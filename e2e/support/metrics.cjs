'use strict';

/*
 * Metric history for a panel under test.
 *
 * Every other fixture arranges over HTTP, which is the rule in the README. This
 * one cannot: samples are written by the panel's own sampler on a timer, and
 * there is no ingestion route to post to. So it writes the same rows
 * lib/health.cjs writes, straight into that instance's database.
 *
 * Safe to do while the panel is running - db.cjs opens in WAL mode, so a second
 * writer is expected - and it touches only the throwaway database under the
 * instance's temp directory, never the developer's.
 */

const path = require('path');
const Database = require('better-sqlite3');

/**
 * Write `count` samples ending now, one per `stepMs`.
 *
 * Values ramp rather than being random so a failure screenshot shows a line
 * with an obvious shape, and so an assertion on the newest reading is stable.
 *
 * @param {object} panel   an instance from instance.cjs
 * @param {string} serverId the server the samples belong to
 * @param {object} [opts]
 * @param {number} [opts.count=40]     how many samples
 * @param {number} [opts.stepMs=60000] spacing, matching the real one-minute sampler
 * @param {boolean} [opts.players=true] also write player and world-size columns
 */
function seedSamples(panel, serverId, { count = 40, stepMs = 60_000, players = true } = {}) {
  const db = new Database(path.join(panel.dataDir, 'fleetdeck.db'));
  try {
    const insert = db.prepare(`
      INSERT INTO metric_samples
        (server_id, ts, cpu, memory_mb, players, world_mb, tps, online, heap_mb, disk_used_mb, disk_total_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id, ts) DO NOTHING
    `);
    // Align to the minute so repeated runs overwrite rather than interleave.
    const now = Math.floor(Date.now() / stepMs) * stepMs;
    const rows = db.transaction(() => {
      for (let i = 0; i < count; i += 1) {
        const age = count - 1 - i;
        insert.run(
          serverId,
          now - age * stepMs,
          10 + (i % 50),                        // cpu %
          512 + i * 8,                          // memory MB
          players ? (i % 12) : null,
          players ? 1024 + i * 4 : null,        // world MB
          players ? 20 : null,
          1,
          256 + i * 4,
          2048 + i,
          20480,
        );
      }
    });
    rows();
    return { count, newestTs: now, oldestTs: now - (count - 1) * stepMs };
  } finally {
    db.close();
  }
}

/** Drop every sample and rollup for one server, back to a history of nothing. */
function clearSamples(panel, serverId) {
  const db = new Database(path.join(panel.dataDir, 'fleetdeck.db'));
  try {
    db.prepare('DELETE FROM metric_samples WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM metric_rollups WHERE server_id = ?').run(serverId);
  } finally {
    db.close();
  }
}

module.exports = { seedSamples, clearSamples };
