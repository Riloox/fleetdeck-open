'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const crashes = require('../lib/crashes.cjs');
const terraria = require('../lib/terraria-crashes.cjs');

const legacyNormalize = (text) => crashes.redact(text).replace(/\x1b\[[0-9;]*m/g, '').replace(/\[?\d{2}:\d{2}:\d{2}\]?/g, '<time>').replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.+-]+Z?\b/g, '<timestamp>').replace(/(?:[A-Za-z]:\\|\/)[^\s:]+/g, '<path>').replace(/\.java:\d+/g, '.java:<line>').replace(/(?:Thread|pool)-\d+(?:-thread-\d+)?/gi, '<thread>').replace(/\s+/g, ' ').trim();
const evidence = { console: [{ text: 'java.lang.IllegalStateException: broken' }, { text: ' at net.minecraft.Main.run(Main.java:421)' }], latestLog: { text: 'Caused by: java.lang.IllegalArgumentException: bad' }, crashReport: { status: 'absent' } };
const all = [evidence.crashReport?.text, evidence.latestLog?.text, ...evidence.console.map((line) => line.text)].filter(Boolean).join('\n');
const stable = all.split(/\r?\n/).filter((line) => /(?:Exception|Error|Caused by:|\bat\s+[\w.$]+\()/i.test(line)).slice(-80).map(legacyNormalize).join('\n') || legacyNormalize(all).slice(-8192) || 'empty-crash';
assert.strictEqual(crashes.fingerprint(evidence), crypto.createHash('sha256').update(`v1\n${stable}`).digest('hex'), 'Minecraft fingerprint changed');

const fixtures = [
  ['terraria.port.in-use', 'Address already in use while binding port 7777', 'vanilla'],
  ['terraria.world.missing', 'World Home.wld not found', 'vanilla'],
  ['terraria.world.corrupt', 'Failed to load world: invalid world header', 'vanilla'],
  ['terraria.world.version', 'World was saved by a newer version', 'vanilla'],
  ['terraria.awaiting-input', 'Choose world: n new world', 'vanilla'],
  ['terraria.memory', 'System.OutOfMemoryException', 'vanilla'],
  ['terraria.runtime.missing', 'You must install .NET runtime', 'tmodloader'],
  ['tmodloader.mod.missing-dependency', 'MagicStorage missing dependency BaseLib not found', 'tmodloader'],
  ['tmodloader.mod.version', 'ExampleMod was built for tModLoader version v2025.1', 'tmodloader'],
  ['tmodloader.mod.exception', 'ModLoadingException: unhandled exception loading mod Example.tmod', 'tmodloader'],
  ['tshock.db.locked', 'SQLite error: database is locked', 'tshock'],
  ['tshock.config.invalid', 'Config JSON parse failed: unexpected character', 'tshock'],
  ['terraria.unclean-stop', 'Stop timed out; sent SIGKILL', 'vanilla'],
];
for (const [expected, text, variant] of fixtures) {
  const environment = expected === 'terraria.awaiting-input' ? { signal: 'SIGKILL' } : {};
  const found = crashes.classify({ console: [{ text }] }, environment, terraria.crashRules({ terrariaVariant: variant })).map((item) => item.ruleId);
  assert.deepStrictEqual(found, [expected], `${expected} cross-matched: ${found.join(', ')}`);
}
assert.deepStrictEqual(crashes.classify({ console: [{ text: 'Unfamiliar failure' }] }, {}, terraria.crashRules({ terrariaVariant: 'vanilla' })), []);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-crashes-'));
try {
  fs.mkdirSync(path.join(root, 'Logs'));
  const old = path.join(root, 'Logs', 'old.log'); const fresh = path.join(root, 'Logs', 'fresh.log');
  fs.writeFileSync(old, 'old'); fs.writeFileSync(fresh, 'fresh');
  const now = Date.now();
  fs.utimesSync(old, new Date(now - 48 * 3600000), new Date(now - 48 * 3600000));
  fs.utimesSync(fresh, new Date(now - 1000), new Date(now - 1000));
  assert.strictEqual(crashes.newestMatching(root, 'Logs/*.log', now, 24 * 3600000).path, 'Logs/fresh.log');
  // Only a privileged Windows account can link a file, so there the same
  // escape is built out of a junction - the directory link anyone can make -
  // and safeTail has to refuse the file reached through it.
  const link = path.join(root, 'Logs', 'link.log');
  if (process.platform === 'win32') {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-crashes-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'link.log'), 'outside');
      fs.symlinkSync(outside, path.join(root, 'Logs', 'linked'), 'junction');
      assert.strictEqual(crashes.safeTail(root, path.join(root, 'Logs', 'linked', 'link.log')).status, 'rejected');
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  } else {
    fs.symlinkSync(__filename, link);
    assert.strictEqual(crashes.safeTail(root, link).status, 'rejected');
  }
} finally { fs.rmSync(root, { recursive: true, force: true }); }

console.log(`terraria crash tests passed (${fixtures.length + 3})`);
