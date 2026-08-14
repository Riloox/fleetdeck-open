'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanSensitive, isInside } = require('../lib/terraria-verification.cjs');

const ROOT = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(file) : [file];
    });
}

function flatten(value, prefix = '', output = {}) {
  for (const [key, item] of Object.entries(value || {})) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, next, output);
    else output[next] = item;
  }
  return output;
}

function main() {
  const known = ['fixture-server-password', 'fixture-rest-token', 'fixture-account-password'];
  assert.deepStrictEqual(scanSensitive({
    ok: true,
    operation: { state: 'failed', recovery: { action: 'Restore the prior snapshot.' } },
  }, { knownSecrets: known }), []);
  assert(scanSensitive({ password: known[0] }, { knownSecrets: known }).some((x) => x.reason === 'sensitive_key'));
  assert(scanSensitive({ message: `Bearer ${known[1]}` }, { knownSecrets: known }).some((x) => x.reason === 'credential_pattern'));
  assert(scanSensitive({ evidence: `player at 203.0.113.9 used ${known[2]}` }, { knownSecrets: known })
    .some((x) => x.reason === 'ip_address'));
  assert(scanSensitive({ log: 'failed under /home/operator/terraria/serverconfig.txt' })
    .some((x) => x.reason === 'absolute_path'));

  const fixtureRoot = path.join(__dirname, 'fixtures', 'terraria');
  for (const file of walk(fixtureRoot)) {
    const relative = path.relative(fixtureRoot, file);
    const findings = scanSensitive(fs.readFileSync(file), {
      knownSecrets: known,
      // Version-source fixtures legitimately contain public download URLs and
      // captured console fixtures can contain loopback/wildcard bind addresses.
      allowIp: true,
      allowAbsolutePath: true,
    });
    assert.deepStrictEqual(findings, [], `${relative} contains sensitive capture data`);
  }

  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n.json'), 'utf8'));
  const en = flatten(i18n.dictionaries.en);
  const es = flatten(i18n.dictionaries.es);
  const enKeys = Object.keys(en).filter((key) => key.startsWith('terraria.')).sort();
  const esKeys = Object.keys(es).filter((key) => key.startsWith('terraria.')).sort();
  assert(enKeys.length > 0, 'the Terraria i18n namespace is empty');
  assert.deepStrictEqual(esKeys, enKeys, 'Terraria en/es translation keys differ');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'terraria-verification-'));
  try {
    assert.strictEqual(isInside(temp, path.join(temp, 'staging', 'payload')), true);
    assert.strictEqual(isInside(temp, path.join(temp, '..', 'outside')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  const requiredSuites = [
    'terraria-module', 'terraria-install', 'terraria-lifecycle', 'terraria-worlds',
    'terraria-config', 'terraria-backups', 'terraria-mods', 'terraria-tshock',
    'terraria-crashes', 'terraria-import', 'terraria-routes', 'terraria-verification',
  ];
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const suite of requiredSuites) {
    assert(pkg.scripts.test.includes(`test/${suite}.test.cjs`), `${suite} is not registered in npm test`);
  }

  console.log(`PASS  terraria-verification (${enKeys.length} translation keys, ${walk(fixtureRoot).length} fixtures scanned)`);
}

main();
