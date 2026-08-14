'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const createCustomModule = require('../lib/modules/custom/manager.cjs');
const { parseCommand } = createCustomModule;

test('custom commands are split into an executable and quoted arguments', () => {
  assert.deepEqual(parseCommand('node "worker process.js" --port 2121'), [
    'node',
    'worker process.js',
    '--port',
    '2121',
  ]);
  assert.deepEqual(parseCommand('"C:\\Program Files\\nodejs\\node.exe" app.js'), [
    'C:\\Program Files\\nodejs\\node.exe',
    'app.js',
  ]);
  assert.throws(() => parseCommand('node "worker.js'), /unclosed quote/);
});

test('custom module launches directly and becomes online on spawn without a health check', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-custom-'));
  let launched;
  const manager = {
    desc: () => ({ cwd, startCommand: 'node "worker.js" --watch' }),
    _launch: (bin, args) => { launched = { bin, args }; return { ok: true }; },
  };
  const mod = createCustomModule();

  try {
    assert.deepEqual(mod.start(manager), { ok: true });
    assert.deepEqual(launched, { bin: 'node', args: ['worker.js', '--watch'] });
    assert.equal(mod.detectOnline(null, manager), true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('custom health checks, stop sequences, and backup selection use descriptor fields', () => {
  const mod = createCustomModule();
  const manager = {
    desc: () => ({
      healthCheckRegex: 'Ready on port \\d+',
      stopCommand: 'shutdown',
      stopSignal: 'SIGINT',
    }),
  };

  assert.equal(mod.detectOnline(null, manager), false);
  assert.equal(mod.detectOnline('Ready on port 2121', manager), true);
  assert.deepEqual(mod.buildStopSequence(manager), { command: 'shutdown' });
  assert.deepEqual(mod.backupSelection(), ['.']);

  manager.desc = () => ({ stopSignal: 'SIGINT' });
  assert.deepEqual(mod.buildStopSequence(manager), { signal: 'SIGINT' });
});
