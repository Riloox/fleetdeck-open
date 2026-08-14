'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const valheim = require('../lib/valheim-install.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-valheim-install-'));
const cacheDir = path.join(root, 'cache');
const destination = path.join(root, 'server');
const steamcmd = path.join(cacheDir, 'steamcmd', process.platform === 'win32' ? 'steamcmd.exe' : 'steamcmd.sh');

function createInstalled(dir, buildId = '123456') {
  fs.mkdirSync(path.join(dir, 'steamapps'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'steamapps', `appmanifest_${valheim.APP_ID}.acf`), `"AppState"\n{\n"buildid" "${buildId}"\n}`);
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(dir, 'valheim_server.exe'), 'exe');
    fs.writeFileSync(path.join(dir, 'UnityPlayer.dll'), 'lib');
    fs.writeFileSync(path.join(dir, 'steamclient64.dll'), 'lib');
  } else {
    fs.writeFileSync(path.join(dir, 'valheim_server.x86_64'), 'exe');
    fs.writeFileSync(path.join(dir, 'UnityPlayer.so'), 'lib');
    fs.writeFileSync(path.join(dir, 'steamclient.so'), 'lib');
  }
}

async function run() {
  try {
    fs.mkdirSync(path.dirname(steamcmd), { recursive: true });
    fs.writeFileSync(steamcmd, 'fixture');
    const runtime = await valheim.install({
      destination, worldName: 'Dedicated',
    }, {
      cacheDir,
      download: async () => { throw new Error('unexpected download'); },
      runCommand: async (_bin, args) => {
        assert.deepEqual(args.slice(2, 6), ['+login', 'anonymous', '+app_update', String(valheim.APP_ID)]);
        createInstalled(args[1]);
      },
    });
    assert.equal(runtime.buildId, '123456');
    assert.equal(fs.existsSync(path.join(destination, 'data')), true);
    assert.equal(fs.existsSync(path.join(destination, '.fleetdeck', 'valheim-build.json')), true);
    assert.equal(valheim.readInstalledBuild(destination).buildId, '123456');

    const failed = path.join(root, 'failed');
    await assert.rejects(
      valheim.install({ destination: failed, worldName: 'Broken' }, {
        cacheDir,
        download: async () => {},
        runCommand: async () => {},
      }),
      /executable is missing/,
    );
    assert.equal(fs.existsSync(failed), false);
    assert.equal(fs.readdirSync(root).some((name) => name.includes('failed.fleetdeck-staging')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().then(() => console.log('valheim install tests passed'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
