'use strict';

/*
 * Palworld log-file console source (docs: the Windows dedicated server writes
 * its console through the engine's own console API, so fleetdeck's stdout
 * pipe stays empty; with the `-log` launch flag UE also writes every console
 * line to Pal/Saved/Logs/Pal.log, which this module tails into the panel).
 *
 * The tailer is poll-based on purpose: UE recreates/truncates Pal.log on a
 * restart, and fs.watch on Windows is unreliable for files that get replaced
 * rather than appended. A 500ms stat is cheap and rotation-proof.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  logPath,
  parseLogLine,
  createLogTailer,
} = require('../lib/modules/palworld/logfile.cjs');

// -- logPath ----------------------------------------------------------------

assert.equal(
  logPath('C:\\Games\\PalServer'),
  path.join('C:\\Games\\PalServer', 'Pal', 'Saved', 'Logs', 'Pal.log'),
  'logPath resolves relative to the server working directory',
);

// -- parseLogLine -----------------------------------------------------------

// A full UE console line as written to Pal.log (timestamp, frame, category,
// verbosity, message). The engine timestamp is engine noise - the panel entry
// carries its own ts - so it is stripped; the category and message stay.
const parsed = parseLogLine('[2026.08.09-14.22.33:456][  0]LogTemp: Display: Running Palworld dedicated server on :8211');
assert.deepStrictEqual(
  parsed,
  { text: 'LogTemp: Display: Running Palworld dedicated server on :8211', level: 'info' },
  'a full UE line loses its engine timestamp prefix and stays info',
);

// Verbosity markers map to panel levels.
assert.equal(parseLogLine('[2026.08.09-14.22.33:456][  0]LogTemp: Error: Could not bind socket').level, 'error');
assert.equal(parseLogLine('[2026.08.09-14.22.33:456][  0]LogTemp: Warning: Low disk space on save drive').level, 'warn');
assert.equal(parseLogLine('[2026.08.09-14.22.33:456][  0]LogTemp: Fatal: Out of memory').level, 'error');

// Lines without the engine prefix pass through untouched (raw stdout prints,
// third-party DLL chatter that lands in the log).
assert.deepStrictEqual(
  parseLogLine('hello from a plugin'),
  { text: 'hello from a plugin', level: 'info' },
  'a bare line is passed through unchanged',
);

// Empty and whitespace-only lines carry no content.
assert.equal(parseLogLine(''), null);
assert.equal(parseLogLine('   '), null);
assert.equal(parseLogLine(null), null);

// ANSI escapes are terminal instructions, not content.
assert.equal(
  parseLogLine('\u001b[31mLogTemp: Display: red text\u001b[0m').text,
  'LogTemp: Display: red text',
);

// -- createLogTailer --------------------------------------------------------

function waitFor(condition, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (condition()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out waiting for tailer'));
      setTimeout(poll, 5);
    };
    poll();
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-palworld-logfile-'));
}

async function testTailerAppendsAndBuffers() {
  const dir = tempDir();
  const file = path.join(dir, 'Pal.log');
  const received = [];
  const tailer = createLogTailer({
    file,
    pollMs: 10,
    onLine: (line) => received.push(line),
  });
  try {
    tailer.start();

    // A partial line is buffered, not emitted, until the newline lands.
    fs.writeFileSync(file, '[2026.08.09-14.22.33:456][  0]LogTemp: Display: first half');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(received.length, 0, 'a line without a newline is buffered');

    fs.appendFileSync(file, ' complete\r\n');
    fs.appendFileSync(file, '[2026.08.09-14.22.33:457][  0]LogTemp: Display: second line\n');
    await waitFor(() => received.length === 2);
    assert.deepStrictEqual(received, [
      '[2026.08.09-14.22.33:456][  0]LogTemp: Display: first half complete',
      '[2026.08.09-14.22.33:457][  0]LogTemp: Display: second line',
    ], 'complete lines are emitted in order, CRLF handled');
  } finally {
    tailer.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testTailerSkipsPreexistingContent() {
  const dir = tempDir();
  const file = path.join(dir, 'Pal.log');
  // Content from a previous session: a restart must not replay it.
  fs.writeFileSync(file, 'old session line\n');
  const received = [];
  const tailer = createLogTailer({ file, pollMs: 10, onLine: (line) => received.push(line) });
  try {
    tailer.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(received.length, 0, 'pre-existing content is the baseline, not replayed');

    fs.appendFileSync(file, 'new session line\n');
    await waitFor(() => received.length === 1);
    assert.deepStrictEqual(received, ['new session line'], 'only appended content is delivered');
  } finally {
    tailer.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testTailerSurvivesFileRecreation() {
  const dir = tempDir();
  const file = path.join(dir, 'Pal.log');
  fs.writeFileSync(file, 'first session\n');
  const received = [];
  const tailer = createLogTailer({ file, pollMs: 10, onLine: (line) => received.push(line) });
  try {
    tailer.start();
    await new Promise((resolve) => setTimeout(resolve, 80));

    // UE rotates the old session away (rename) and starts a fresh Pal.log.
    fs.renameSync(file, path.join(dir, 'backup-Pal.log'));
    fs.writeFileSync(file, 'restarted session line\n');
    await waitFor(() => received.length === 1);
    assert.deepStrictEqual(received, ['restarted session line'], 'a replaced file (new inode) is re-read from the top');
  } finally {
    tailer.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testTailerToleratesMissingFile() {
  const dir = tempDir();
  const file = path.join(dir, 'Pal.log'); // never created
  const received = [];
  const tailer = createLogTailer({ file, pollMs: 10, onLine: (line) => received.push(line) });
  try {
    tailer.start();
    // The file appears a moment after the server process spawns. The tailer
    // must not throw while it is absent, and must pick the file up when it
    // lands (baseline = whatever exists at that point, so nothing replayed).
    await new Promise((resolve) => setTimeout(resolve, 60));
    fs.writeFileSync(file, 'late file line\n');
    await waitFor(() => received.length === 1);
    assert.deepStrictEqual(received, ['late file line'], 'a file created after start() is picked up');
  } finally {
    tailer.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function testTailerStopHaltsDelivery() {
  const dir = tempDir();
  const file = path.join(dir, 'Pal.log');
  fs.writeFileSync(file, '');
  const received = [];
  const tailer = createLogTailer({ file, pollMs: 10, onLine: (line) => received.push(line) });
  tailer.start();
  fs.appendFileSync(file, 'before stop\n');
  await waitFor(() => received.length === 1);
  tailer.stop();
  fs.appendFileSync(file, 'after stop\n');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(received.length, 1, 'no lines are delivered after stop()');
  fs.rmSync(dir, { recursive: true, force: true });
}

testTailerAppendsAndBuffers()
  .then(testTailerSkipsPreexistingContent)
  .then(testTailerSurvivesFileRecreation)
  .then(testTailerToleratesMissingFile)
  .then(testTailerStopHaltsDelivery)
  .then(() => console.log('palworld logfile tests passed'))
  .catch((err) => { console.error(err); process.exitCode = 1; });
