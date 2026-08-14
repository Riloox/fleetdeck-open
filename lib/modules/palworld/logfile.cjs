'use strict';

/*
 * Palworld log-file console source.
 *
 * The Windows dedicated server writes its console through the engine's own
 * console API (the launcher spawns PalServer-Win64-Shipping-Cmd.exe, which
 * allocates a console window and writes to its screen buffer, not to the
 * stdout/stderr handles fleetdeck pipes). With the `-log` launch flag, UE
 * ALSO writes every console line to Pal/Saved/Logs/Pal.log - the panel tails
 * that file and pushes the lines through the normal console pipeline.
 *
 * The tailer is poll-based on purpose: UE recreates Pal.log from scratch on
 * each launch (the old session is rotated away), so fs.watch on Windows -
 * which is unreliable for files that are replaced rather than appended - is
 * the wrong tool. A short stat poll is cheap and rotation-proof.
 */

const fs = require('fs');
const path = require('path');

const ANSI_ESCAPE_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~])/g;

// UE log lines look like "[2026.08.09-14.22.33:456][  0]LogTemp: Display: ...".
// The engine timestamp is engine noise - the panel entry carries its own ts -
// so it is stripped; the category and message stay.
const UE_PREFIX_RE = /^\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]\[\s*\d+\]\s*/;

function logPath(cwd) {
  return path.join(cwd, 'Pal', 'Saved', 'Logs', 'Pal.log');
}

/*
 * Normalize one Pal.log line into what the panel console should show.
 * Returns { text, level } or null for a line with no content.
 */
function parseLogLine(line) {
  const raw = String(line == null ? '' : line)
    .replace(ANSI_ESCAPE_RE, '')
    .replace(/\r/g, '');
  const text = raw.replace(UE_PREFIX_RE, '');
  if (!text.trim()) return null;
  let level = 'info';
  if (/:\s*(?:Error|Fatal):/.test(text)) level = 'error';
  else if (/:\s*Warning:/.test(text)) level = 'warn';
  return { text, level };
}

/*
 * Poll-based tailer. Starts at the current end of the file (so a restart
 * never replays the previous session), emits complete newline-terminated
 * lines, tolerates the file being absent (server still booting) and survives
 * UE recreating the file (size < offset -> re-read from the start).
 *
 * `fsImpl` is a seam for tests; it only needs statSync, openSync, readSync,
 * closeSync.
 */
function createLogTailer({ file, onLine, pollMs = 500, fsImpl = fs }) {
  let timer = null;
  let offset = 0;
  let identity = null; // "dev:ino" of the file we are reading
  let buffer = ''; // a line that has not seen its newline yet
  let started = false;

  function currentStat() {
    try {
      return fsImpl.statSync(file);
    } catch {
      return null; // absent, or stat raced a replacement
    }
  }

  function readChunk() {
    let fd;
    try {
      fd = fsImpl.openSync(file, 'r');
    } catch {
      return ''; // file disappeared between stat and open; next poll catches it
    }
    try {
      const size = fsImpl.fstatSync(fd).size;
      if (size <= offset) return '';
      const buffer = Buffer.alloc(size - offset);
      fsImpl.readSync(fd, buffer, 0, buffer.length, offset);
      offset = size;
      return buffer.toString('utf8');
    } finally {
      fsImpl.closeSync(fd);
    }
  }

  function tick() {
    if (!started) return;
    const stat = currentStat();
    if (stat === null) return;
    const id = `${stat.dev}:${stat.ino}`;
    if (identity !== null && id !== identity) {
      // The file was replaced (UE rotates Pal.log away and starts a fresh one
      // on a new launch). Drop any half-read line and start over.
      buffer = '';
      offset = 0;
    } else if (stat.size < offset) {
      // Same file, but truncated in place. Start over.
      buffer = '';
      offset = 0;
    }
    identity = id;
    const chunk = readChunk();
    if (!chunk) return;
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      line = line.replace(/\r$/, '');
      if (line.length > 0) onLine(line);
    }
  }

  return {
    file,
    start() {
      if (timer) return;
      started = true;
      // Baseline: begin at whatever exists now, so a restart never replays
      // the previous session's lines.
      const stat = currentStat();
      identity = stat === null ? null : `${stat.dev}:${stat.ino}`;
      offset = stat === null ? 0 : stat.size;
      buffer = '';
      timer = setInterval(tick, pollMs);
      if (timer.unref) timer.unref();
    },
    stop() {
      started = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

module.exports = { logPath, parseLogLine, createLogTailer };
