'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stateStore = require('../lib/stateStore.cjs');
const updates = require('../lib/palworld-updates.cjs');

async function main() {
  assert.strictEqual(updates.parseBuildId('"branches" { "public" { "buildid" "19283746" } }'), '19283746');
  assert.strictEqual(updates.parseBuildId('"buildid" "42"'), '42');
  assert.strictEqual(updates.parseBuildId('no build here'), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-palworld-update-'));
  fs.mkdirSync(path.join(dir, 'steamapps'));
  fs.writeFileSync(path.join(dir, 'steamapps', 'appmanifest_2394010.acf'), '"AppState" { "buildid" "123456" }');
  assert.strictEqual(updates.installedBuild(dir).buildId, '123456');

  const policy = updates.safePolicy({
    enabled: true,
    checkIntervalMinutes: 1,
    maintenanceWindow: { start: 'bad', end: '08:30' },
    playersOnline: 'force',
    failureThreshold: 99,
  });
  assert.strictEqual(policy.enabled, true);
  assert.strictEqual(policy.checkIntervalMinutes, 15);
  assert.deepStrictEqual(policy.maintenanceWindow, { start: '04:00', end: '08:30' });
  assert.strictEqual(policy.failureThreshold, 10);
  assert.strictEqual(updates.DEFAULT_POLICY.enabled, false);
  assert.deepStrictEqual(updates.automaticDecision({
    policy: { ...policy, maintenanceWindow: { start: '00:00', end: '23:59' }, playersOnline: 'defer' },
    updateState: 'update-ready',
    playerCount: 2,
    now: new Date(2026, 0, 1, 12).getTime(),
  }), { action: 'wait', reason: 'players_online' });
  assert.strictEqual(updates.automaticDecision({
    policy: { ...policy, maintenanceWindow: { start: '00:00', end: '23:59' }, playersOnline: 'force' },
    updateState: 'update-ready',
    playerCount: 2,
    now: new Date(2026, 0, 1, 12).getTime(),
  }).action, 'apply');

  const manager = {
    status: 'online',
    moduleState: { normalizedStatus: { version: 'v0.6.5.0', playerCount: 2 } },
  };
  const plan = await updates.preview({
    server: { id: 'pal-1', dir },
    manager,
    latest: { buildId: '654321', source: 'steamcmd-public-branch', stale: false },
    input: { restart: true, backupRequired: true, announceSeconds: 60 },
  });
  assert.strictEqual(plan.installedBuildId, '123456');
  assert.strictEqual(plan.targetBuildId, '654321');
  assert.strictEqual(plan.wasRunning, true);
  assert.ok(plan.revision);

  // --- restart survival tests -----------------------------------------------
  // Simulate a panel restart: persist a release cache via stateStore,
  // then re-require the module and verify it was loaded.
  // Create a fake steamcmd so ensureSteamCmd succeeds.
  const cacheDir = path.join(dir, 'cache');
  const steamcmd = path.join(cacheDir, 'steamcmd', process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');
  fs.mkdirSync(path.dirname(steamcmd), { recursive: true });
  fs.writeFileSync(steamcmd, 'fixture');

  // 1. Persist a cache and verify it survives re-requiring the module.
  stateStore.write('palworld', 'release-cache', {
    buildId: '999999',
    source: 'steamcmd-public-branch',
    retrievedAt: Date.now() - 1000,
    retrievedAtIso: new Date(Date.now() - 1000).toISOString(),
    lastSuccessAt: new Date(Date.now() - 1000).toISOString(),
    error: null,
  });
  delete require.cache[require.resolve('../lib/palworld-updates.cjs')];
  const updates2 = require('../lib/palworld-updates.cjs');
  const latest2 = await updates2.discoverLatest({
    cacheDir,
    download: async () => {},
    now: Date.now() + 1000,
    force: true,
    runCommand: async (_bin, _args, _options, line) => line('"branches" { "public" { "buildid" "777777" } }'),
  });
  // The fresh fetch should succeed and overwrite the persisted cache.
  assert.strictEqual(latest2.buildId, '777777');
  assert.strictEqual(latest2.stale, false);

  // 2. Simulate restart with stale cache (fetch fails) - should return persisted value as stale.
  delete require.cache[require.resolve('../lib/palworld-updates.cjs')];
  const updates3 = require('../lib/palworld-updates.cjs');
  const stale3 = await updates3.discoverLatest({
    cacheDir,
    download: async () => {},
    now: Date.now() + 1000,
    force: true,
    runCommand: async () => { throw new Error('offline'); },
  });
  // Should still have the buildId from the persisted cache (now stale).
  assert.strictEqual(stale3.buildId, '777777');
  assert.strictEqual(stale3.stale, true);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('palworld updates tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
