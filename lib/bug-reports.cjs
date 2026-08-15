'use strict';

/*
 * Bug-report storage (plan Task 2 — .hermes/plans/2026-08-14_235510-report-bug-github.md).
 *
 * Durable SQLite persistence for in-app bug reports, kept deliberately
 * transport-free: GitHub I/O lives in lib/github-issues.cjs and the retry
 * worker in lib/bug-report-sync.cjs, so this module is deterministic and
 * unit-testable on its own.
 *
 * All functions are SYNCHRONOUS and open the DB lazily per call (lib/audit.cjs
 * pattern). Never cache prepared statements at module scope: tests delete the
 * database file and reopen, so anything cached would point at a dead handle.
 *
 * A report is durable BEFORE any network call; sync failures leave a
 * retryable pending/failed record rather than losing user feedback.
 */

const crypto = require('crypto');
const { open } = require('./db.cjs');

const LIMITS = {
  titleMax: 200,
  descriptionMax: 100_000,
  optionalMax: 500,     // game / view / route / actorUsername
  stepsMax: 5000,       // reproSteps / expected
  userAgentMax: 1000,
  versionMax: 100,
  markerMax: 100,
};

const DAY_MS = 86_400_000;

/*
 * Redact PAT-shaped secrets before an error text is persisted. The exact
 * token literal is the GitHub client's job (it knows the token); this layer
 * strips anything shaped like ghp_/github_pat_ tokens or a Bearer header so a
 * secret can never reach storage in any form.
 */
function redactForStorage(text) {
  let out = String(text);
  out = out.replace(/(?:github_pat_|ghp_)[A-Za-z0-9_]*/g, '[REDACTED]');
  out = out.replace(/\bBearer\s+\S+/g, 'Bearer [REDACTED]');
  return out;
}

function fail(message) {
  throw new Error(`bug-reports: ${message}`);
}

function requireNonEmptyString(value, field, max) {
  if (typeof value !== 'string') {
    fail(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    fail(`${field} must be a non-empty string`);
  }
  if (trimmed.length > max) {
    fail(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

/*
 * Optional strings: null / undefined / '' / whitespace normalize to null;
 * anything else is trimmed and length-checked.
 */
function normalizeOptional(value, field, max) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    fail(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > max) {
    fail(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

const SELECT_COLUMNS = `
  id, actor_id, actor_username, created_at, game, view, route, title,
  description, repro_steps, expected, user_agent, version, sync_state,
  issue_number, issue_url, marker, last_error, attempts, updated_at
`;

function getRow(id) {
  return open().prepare(`SELECT ${SELECT_COLUMNS} FROM bug_reports WHERE id = ?`).get(id);
}

/*
 * Create a report. Returns the stored row (snake_case columns).
 *
 * input: { actorId, actorUsername, game, view, route, title, description,
 *          reproSteps, expected, userAgent, version, marker }
 * opts:  { now, id } — deterministic test seams (defaults Date.now / randomUUID).
 *
 * Idempotency: when the caller supplies a marker that already exists, the
 * EXISTING row is returned unchanged (double-submit protection).
 */
function create(input, opts = {}) {
  if (!input || typeof input !== 'object') {
    fail('input object required');
  }
  const now = opts.now !== undefined ? opts.now : Date.now();
  const id = opts.id !== undefined ? opts.id : crypto.randomUUID();

  const actorId = requireNonEmptyString(input.actorId, 'actorId', LIMITS.optionalMax);
  const title = requireNonEmptyString(input.title, 'title', LIMITS.titleMax);
  const description = requireNonEmptyString(input.description, 'description', LIMITS.descriptionMax);

  const actorUsername = normalizeOptional(input.actorUsername, 'actorUsername', LIMITS.optionalMax);
  const game = normalizeOptional(input.game, 'game', LIMITS.optionalMax);
  const view = normalizeOptional(input.view, 'view', LIMITS.optionalMax);
  const route = normalizeOptional(input.route, 'route', LIMITS.optionalMax);
  const reproSteps = normalizeOptional(input.reproSteps, 'reproSteps', LIMITS.stepsMax);
  const expected = normalizeOptional(input.expected, 'expected', LIMITS.stepsMax);
  const userAgent = normalizeOptional(input.userAgent, 'userAgent', LIMITS.userAgentMax);
  const version = normalizeOptional(input.version, 'version', LIMITS.versionMax);
  const marker = input.marker == null
    ? `fleetdeck-${crypto.randomUUID()}`
    : normalizeOptional(input.marker, 'marker', LIMITS.markerMax);

  const db = open();

  // Idempotent double-submit protection: an existing marker wins.
  if (marker !== null) {
    const existing = db.prepare('SELECT id FROM bug_reports WHERE marker = ?').get(marker);
    if (existing) return getRow(existing.id);
  }

  db.prepare(`
    INSERT INTO bug_reports (
      id, actor_id, actor_username, created_at, game, view, route, title,
      description, repro_steps, expected, user_agent, version, sync_state,
      issue_number, issue_url, marker, last_error, attempts, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
      NULL, NULL, ?, NULL, 0, ?
    )
  `).run(
    id, actorId, actorUsername, now, game, view, route, title, description,
    reproSteps, expected, userAgent, version, marker, now,
  );

  return getRow(id);
}

function get(id) {
  return getRow(id);
}

/*
 * Rows eligible for sync, ordered created_at ASC.
 * opts: { limit (10), now (Date.now), maxAttempts (5),
 *         backoffBaseMs (60_000), maxAgeMs (30 days) }
 *
 * Eligibility: sync_state IN ('pending','failed') AND attempts < maxAttempts
 * AND updated_at >= now - maxAgeMs AND
 * (attempts === 0 OR updated_at + backoffBaseMs * 2^(attempts-1) <= now)
 */
function listPending(opts = {}) {
  const now = opts.now !== undefined ? opts.now : Date.now();
  const limit = opts.limit !== undefined ? opts.limit : 10;
  const maxAttempts = opts.maxAttempts !== undefined ? opts.maxAttempts : 5;
  const backoffBaseMs = opts.backoffBaseMs !== undefined ? opts.backoffBaseMs : 60_000;
  const maxAgeMs = opts.maxAgeMs !== undefined ? opts.maxAgeMs : 30 * DAY_MS;

  return open().prepare(`
    SELECT ${SELECT_COLUMNS}
      FROM bug_reports
     WHERE sync_state IN ('pending', 'failed')
       AND attempts < @maxAttempts
       AND updated_at >= @now - @maxAgeMs
       AND (attempts = 0 OR updated_at + @backoffBaseMs * CAST(POWER(2, attempts - 1) AS INTEGER) <= @now)
     ORDER BY created_at ASC
     LIMIT @limit
  `).all({ now, limit, maxAttempts, backoffBaseMs, maxAgeMs });
}

/*
 * Record a successful sync: sync_state 'synced', issue metadata stored,
 * last_error cleared, updated_at bumped. Attempts history is preserved.
 */
function markSynced(id, { issueNumber, issueUrl } = {}, opts = {}) {
  const now = opts.now !== undefined ? opts.now : Date.now();
  open().prepare(`
    UPDATE bug_reports
       SET sync_state = 'synced',
           issue_number = ?,
           issue_url = ?,
           last_error = NULL,
           updated_at = ?
     WHERE id = ?
  `).run(
    issueNumber == null ? null : Number(issueNumber),
    issueUrl == null ? null : String(issueUrl),
    now,
    id,
  );
  return getRow(id);
}

/*
 * Record a failed attempt: sync_state 'failed', attempts = the worker-computed
 * value, last_error = REDACT then TRUNCATE (<= 500 chars), updated_at bumped.
 */
function markFailed(id, { error, attempts } = {}, opts = {}) {
  const now = opts.now !== undefined ? opts.now : Date.now();
  const redacted = redactForStorage(error == null ? '' : String(error));
  const truncated = redacted.length > 500 ? redacted.slice(0, 500) : redacted;

  open().prepare(`
    UPDATE bug_reports
       SET sync_state = 'failed',
           attempts = ?,
           last_error = ?,
           updated_at = ?
     WHERE id = ?
  `).run(
    Number.isFinite(Number(attempts)) ? Number(attempts) : 0,
    truncated,
    now,
    id,
  );
  return getRow(id);
}

module.exports = { create, get, listPending, markSynced, markFailed, LIMITS };
