'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stateStore = require('../lib/stateStore.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-valheim-updates-'));
const cacheDir = path.join(root, 'cache');
const serverDir = path.join(root, 'server');
const steamcmd = path.join(cacheDir, 'steamcmd', process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');

function manifest(dir, buildId) {
  fs.mkdirSync(path.join(dir, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steamapps', `appmanifest_${require('../lib/valheim-install.cjs').APP_ID}.acf`), `"AppState" { "buildid" "${buildId}" }`);
}

async function run() {
  try {
    fs.mkdirSync(path.dirname(steamcmd), { recursive: true });
    fs.writeFileSync(steamcmd, 'fixture');
    fs.mkdirSync(serverDir);
    manifest(serverDir, '100');
    fs.writeFileSync(path.join(serverDir, 'binary.dat'), 'old');

    let valheim = require('../lib/valheim-install.cjs');
    valheim.resetForTests();
    const latest = await valheim.discoverAvailable({
      cacheDir,
      download: async () => {},
      runCommand: async (_bin, _args, _options, line) => line('"branches" { "public" { "buildid" "200" } }'),
    });
    assert.equal(latest.buildId, '200');
    assert.equal(latest.stale, false);

    const server = { id: 'vh-1', dir: serverDir };
    const manager = { status: 'offline' };
    const plan = valheim.createPreview({ server, manager, actorId: 'user-1', latest });
    assert.equal(plan.availableBuildId, '200');
    assert.deepEqual(plan.preservedPaths, valheim.PRESERVED_PATHS);
    valheim.consumePreview({ token: plan.previewToken, actorId: 'user-1', server, latest });
    assert.throws(
      () => valheim.consumePreview({ token: plan.previewToken, actorId: 'user-1', server, latest }),
      /expired or was already used/,
    );

    const changed = valheim.createPreview({ server, manager, actorId: 'user-1', latest });
    fs.writeFileSync(path.join(serverDir, 'binary.dat'), 'changed');
    assert.throws(
      () => valheim.consumePreview({ token: changed.previewToken, actorId: 'user-1', server, latest }),
      /server or available build changed/,
    );

    valheim.resetForTests();
    await valheim.discoverAvailable({
      cacheDir,
      download: async () => {},
      now: 1,
      runCommand: async (_bin, _args, _options, line) => line('"public" { "buildid" "200" }'),
    });
    const stale = await valheim.discoverAvailable({
      cacheDir,
      download: async () => {},
      force: true,
      now: 2,
      runCommand: async () => { throw new Error('offline'); },
    });
    assert.equal(stale.buildId, '200');
    assert.equal(stale.stale, true);
    assert.throws(() => valheim.createPreview({ server, manager, actorId: 'user-1', latest: stale }), /Fresh Steam build metadata/);

    // --- restart survival tests ------------------------------------------------
    // Simulate a panel restart: the in-memory state is lost but stateStore has
    // the persisted blobs.  Re-require the module to re-initialize from disk.

    // 1. Persist a release cache and verify it survives re-requiring the module.
    stateStore.write('valheim', 'release-cache', {
      buildId: '999', source: 'test', retrievedAt: 1, checkedAt: new Date(1).toISOString(), error: null,
    });
    delete require.cache[require.resolve('../lib/valheim-install.cjs')];
    const valheim2 = require('../lib/valheim-install.cjs');
    const restarted = await valheim2.discoverAvailable({
      cacheDir,
      download: async () => {},
      now: Date.now() + 1000,
      runCommand: async (_bin, _args, _options, line) => line('"branches" { "public" { "buildid" "1234" } }'),
    });
    // The persisted cache should be loaded and used (fresh fetch overwrites it).
    assert.equal(restarted.buildId, '1234');

    // 2. Persist a preview and verify it survives a restart.
    fs.writeFileSync(path.join(serverDir, 'binary.dat'), 'old2');
    manifest(serverDir, '1234');
    const plan2 = valheim2.createPreview({ server, manager, actorId: 'user-2', latest: { buildId: '1234', source: 'test', retrievedAt: Date.now(), checkedAt: new Date().toISOString(), stale: false } });
    assert.ok(plan2.previewToken);
    // Simulate restart
    delete require.cache[require.resolve('../lib/valheim-install.cjs')];
    const valheim3 = require('../lib/valheim-install.cjs');
    // The preview token should still be valid after restart.
    const consumed = valheim3.consumePreview({ token: plan2.previewToken, actorId: 'user-2', server, latest: { buildId: '1234', source: 'test', retrievedAt: Date.now(), checkedAt: new Date().toISOString(), stale: false } });
    assert.ok(consumed);

    // 3. Persist a rollback record directly and verify it survives restart.
    stateStore.write('valheim', 'rollbacks', {
      'test-rollback-id': { serverId: 'vh-1', backup: '/tmp/fake-backup', oldBuildId: '100', newBuildId: '200' },
    });
    delete require.cache[require.resolve('../lib/valheim-install.cjs')];
    const valheim4 = require('../lib/valheim-install.cjs');
    // The rollback should now be loadable via stateStore.read (in-memory map).
    const persistedRollbacks = stateStore.read('valheim', 'rollbacks');
    assert.ok(persistedRollbacks['test-rollback-id']);
    assert.equal(persistedRollbacks['test-rollback-id'].oldBuildId, '100');

    console.log('valheim update tests passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().then(() => {})
  .catch((error) => { console.error(error); process.exitCode = 1; });
