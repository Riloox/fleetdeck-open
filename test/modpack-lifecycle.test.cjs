'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lifecycle = require('../lib/modpacks.cjs');
const hash = (s) => lifecycle.sha256(Buffer.from(s));
test('three-way classifier covers lifecycle cases', () => {
  assert.equal(lifecycle.classify(hash('a'), hash('a'), hash('b')), 'safe_update');
  assert.equal(lifecycle.classify(hash('a'), hash('b'), hash('a')), 'local_edit');
  assert.equal(lifecycle.classify(hash('a'), hash('b'), hash('c')), 'conflict');
  assert.equal(lifecycle.classify(hash('a'), hash('b'), hash('b')), 'converged');
  assert.equal(lifecycle.classify(null, null, hash('a')), 'addition');
});
test('operator paths and traversal are excluded', () => {
  assert.equal(lifecycle.exclusionReason('world/level.dat'), 'operator_data');
  assert.equal(lifecycle.exclusionReason('ops.json'), 'identity_or_secret');
  assert.equal(lifecycle.exclusionReason('.env'), 'secret');
  assert.equal(lifecycle.normalizeRelative('../escape'), null);
});
test('buildPlan inventories conflicts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-pack-'));
  try {
    fs.mkdirSync(path.join(root, 'mods'));
    fs.writeFileSync(path.join(root, 'mods', 'a.jar'), 'local');
    const plan = lifecycle.buildPlan({ root, oldFiles: [{ relativePath: 'mods/a.jar', sha256: hash('old'), sizeBytes: 3 }], newFiles: [{ relativePath: 'mods/a.jar', sha256: hash('new'), sizeBytes: 3 }] });
    assert.equal(plan.groups.conflicts.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
