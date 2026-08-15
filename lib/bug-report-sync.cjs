'use strict';

/*
 * Bug-report sync worker (plan Task 3 — .hermes/plans/2026-08-14_235510-report-bug-github.md).
 *
 * Bridges the durable report store and the GitHub client: claims pending rows,
 * creates issues (reconciling by idempotency marker on retries first), and
 * records success/failure back on the row. A failed GitHub sync NEVER throws
 * out of runOnce() — the failure is recorded on the row for a later bounded
 * retry. Reports are durable in SQLite BEFORE any network call.
 *
 * Retry policy: transient errors (network/5xx/429) bump attempts by one and
 * let the store's exponential backoff gate the next run; configuration
 * failures (auth/forbidden/not-found/validation) exhaust the budget
 * immediately so a broken setup is not hammered.
 */

const bugReports = require('./bug-reports.cjs');
const { buildIssueBody } = require('./github-issues.cjs');

const DAY_MS = 86_400_000;

const noopLogger = { warn() {} };

function defaultBuildBody(report) {
  return buildIssueBody({
    summary: report.title,
    description: report.description,
    reproSteps: report.repro_steps,
    expected: report.expected,
    route: report.route,
    view: report.view,
    game: report.game,
    actorUsername: report.actor_username,
    actorId: report.actor_id,
    timestamp: report.created_at ? new Date(report.created_at).toISOString() : null,
    version: report.version,
    userAgent: report.user_agent,
    marker: report.marker,
  });
}

/*
 * The worker keeps its own in-flight Set so concurrent runOnce() calls can
 * never attempt the same report twice; an injected Set (test seam) shares the
 * guard across workers/processes.
 */
function createSyncWorker(deps = {}) {
  const client = deps.client;
  if (!client || typeof client.createIssue !== 'function') {
    throw new Error('bug-report-sync: client (github-issues) is required');
  }
  const store = deps.store || bugReports;
  const buildBody = typeof deps.buildBody === 'function' ? deps.buildBody : defaultBuildBody;
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const maxAttempts = deps.maxAttempts !== undefined ? deps.maxAttempts : 5;
  const backoffBaseMs = deps.backoffBaseMs !== undefined ? deps.backoffBaseMs : 60_000;
  const maxAgeMs = deps.maxAgeMs !== undefined ? deps.maxAgeMs : 30 * DAY_MS;
  const maxBatch = deps.maxBatch !== undefined ? deps.maxBatch : 10;
  const inFlight = deps.inFlight instanceof Set ? deps.inFlight : new Set();
  const logger = deps.logger && typeof deps.logger.warn === 'function' ? deps.logger : noopLogger;

  /*
   * Error classification: retryable errors keep retrying (attempts+1);
   * everything else exhausts the budget so a config failure cannot be
   * hammered forever. Non-GitHubApiError throws are treated as
   * non-retryable by default.
   */
  function budgetAttempts(report, err) {
    return err && err.retryable === true ? report.attempts + 1 : maxAttempts;
  }

  /*
   * Process one report. Never throws: every failure path lands in markFailed.
   * Returns true when the report was claimed (attempted or skipped), false
   * when it was skipped due to the in-flight guard.
   */
  async function processReport(report) {
    if (inFlight.has(report.id)) return { skipped: true };
    inFlight.add(report.id);
    try {
      let outcome;
      try {
        // On a retry, reconcile first: if the marker already exists upstream
        // (ambiguous previous timeout), adopt that issue instead of risking a
        // duplicate. A search failure is ambiguous — record it and do NOT
        // create.
        if (report.attempts > 0 && typeof client.findIssueByMarker === 'function') {
          const found = await client.findIssueByMarker(report.marker);
          if (found) {
            store.markSynced(report.id, {
              issueNumber: found.issueNumber,
              issueUrl: found.issueUrl,
            }, { now: now() });
            return { succeeded: true };
          }
        }

        const created = await client.createIssue({
          title: report.title,
          body: buildBody(report),
          marker: report.marker,
        });
        store.markSynced(report.id, {
          issueNumber: created.issueNumber,
          issueUrl: created.issueUrl,
        }, { now: now() });
        outcome = { succeeded: true };
      } catch (err) {
        const attempts = budgetAttempts(report, err);
        const message = err && err.message ? String(err.message) : String(err);
        store.markFailed(report.id, { error: message, attempts }, { now: now() });
        logger.warn(`bug-report-sync: report ${report.id} failed (attempts=${attempts}): ${message}`);
        outcome = { failed: true };
      }
      return outcome;
    } finally {
      inFlight.delete(report.id);
    }
  }

  /*
   * One bounded sync pass. Never rejects.
   * Returns { attempted, succeeded, failed, skipped }.
   */
  async function runOnce() {
    const counts = { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
    let rows = [];
    try {
      rows = store.listPending({
        now: now(),
        maxAttempts,
        backoffBaseMs,
        maxAgeMs,
        limit: maxBatch,
      });
    } catch (err) {
      logger.warn(`bug-report-sync: listPending failed: ${err && err.message ? err.message : err}`);
      return counts;
    }

    for (const report of rows) {
      counts.attempted += 1;
      let result;
      try {
        result = await processReport(report);
      } catch (err) {
        // Defensive: storage failures inside processReport must not escape.
        logger.warn(`bug-report-sync: unexpected error on report ${report.id}: ${err && err.message ? err.message : err}`);
        result = { failed: true };
      }
      if (result.skipped) {
        counts.attempted -= 1;
        counts.skipped += 1;
      } else if (result.succeeded) {
        counts.succeeded += 1;
      } else if (result.failed) {
        counts.failed += 1;
      }
    }
    return counts;
  }

  return { runOnce };
}

module.exports = { createSyncWorker };
