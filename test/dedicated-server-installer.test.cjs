'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { STEAM_APPS, discoverTerrariaDownload, launchArgs, writeConfiguration, locateExecutable, runSteam } = require('../lib/dedicatedServerInstaller.cjs');

/*
 * A stand-in for steamcmd.exe: it records every invocation and, when asked,
 * behaves like the bootstrapper does on its first run - self-updating instead
 * of executing the command it was given.
 */
function fakeSteamCmd(dir, { failFirstWithSelfUpdate = false, alwaysFail = false } = {}) {
  const script = path.join(dir, 'fake-steamcmd.cjs');
  const attempts = path.join(dir, 'attempts.log');
  fs.writeFileSync(script, `
    const fs = require('fs');
    const attempts = fs.existsSync(${JSON.stringify(attempts)}) ? fs.readFileSync(${JSON.stringify(attempts)}, 'utf8').split('\\n').filter(Boolean) : [];
    attempts.push(process.argv.slice(2).join(' '));
    fs.writeFileSync(${JSON.stringify(attempts)}, attempts.join('\\n'));
    if (${alwaysFail}) { console.log("ERROR! Failed to install app '896660' (No subscription)"); process.exit(8); }
    if (${failFirstWithSelfUpdate} && attempts.length === 1) {
      console.log('Downloading update (43,472 of 43,472 KB)...');
      console.log("ERROR! Failed to install app '896660' (Missing configuration)");
      process.exit(7);
    }
    console.log("Success! App '896660' fully installed.");
  `);
  return { script, attemptCount: () => fs.readFileSync(attempts, 'utf8').split('\n').filter(Boolean).length };
}

async function selfUpdateRetryTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-steamcmd-'));
  try {
    const retried = fakeSteamCmd(dir, { failFirstWithSelfUpdate: true });
    const lines = [];
    await runSteam(process.execPath, [retried.script, '+app_update', '896660'], { cwd: dir }, (line) => lines.push(line));
    assert.strictEqual(retried.attemptCount(), 2, 'a self-updating SteamCMD run should be repeated once');
    assert.ok(lines.some((line) => /fully installed/.test(line)), 'the retry output should reach the caller');

    fs.rmSync(path.join(dir, 'attempts.log'));
    const doomed = fakeSteamCmd(dir, { alwaysFail: true });
    await assert.rejects(
      runSteam(process.execPath, [doomed.script, '+app_update', '896660'], { cwd: dir }),
      /exited with code 8/,
    );
    assert.strictEqual(doomed.attemptCount(), 1, 'a genuine failure should not be retried');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  await selfUpdateRetryTests();
  assert.deepStrictEqual(STEAM_APPS, { valheim: 896660, palworld: 2394010 });
  const release = await discoverTerrariaDownload(async () => '["terraria-server-1450.zip","mobile-server.zip"]');
  assert.strictEqual(release.version, '1450');
  assert.strictEqual(release.url, 'https://terraria.org/api/download/pc-dedicated-server/terraria-server-1450.zip');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-games-'));
  try {
    writeConfiguration('terraria', { destination: root, worldName: 'Fleet', worldSize: 2, difficulty: 1, maxPlayers: 12, port: 7777, password: 'secret' });
    assert.match(fs.readFileSync(path.join(root, 'serverconfig.txt'), 'utf8'), /worldname=Fleet/);
    fs.writeFileSync(path.join(root, 'DefaultPalWorldSettings.ini'), '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Default",ServerPassword="",PublicPort=8211,ServerPlayerMaxNum=32)');
    writeConfiguration('palworld', { destination: root, serverName: 'Fleet Pal', password: 'birds', adminPassword: 'generated-admin-secret', port: 9000, restPort: 9001, maxPlayers: 16 });
    const platform = process.platform === 'win32' ? 'WindowsServer' : 'LinuxServer';
    const palworld = fs.readFileSync(path.join(root, 'Pal', 'Saved', 'Config', platform, 'PalWorldSettings.ini'), 'utf8');
    assert.match(palworld, /ServerName="Fleet Pal"/);
    assert.match(palworld, /PublicPort=9000/);
    assert.match(palworld, /AdminPassword="generated-admin-secret"/);
    assert.match(palworld, /RESTAPIEnabled=True/);
    assert.match(palworld, /RESTAPIPort=9001/);
    const executableName = process.platform === 'win32' ? 'valheim_server.exe' : 'valheim_server.x86_64';
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'nested', executableName), 'binary');
    assert.strictEqual(locateExecutable('valheim', root), path.join(root, 'nested', executableName));
    assert.deepStrictEqual(launchArgs('terraria', { destination: root }), ['-config', path.join(root, 'serverconfig.txt')]);
    // Palworld launches with `-log` so UE writes Pal/Saved/Logs/Pal.log, the
    // file the panel tails into the in-app console on Windows.
    assert.deepStrictEqual(launchArgs('palworld', { port: 9000, maxPlayers: 16 }), ['-port=9000', '-players=16', '-useperfthreads', '-NoAsyncLoadingThread', '-UseMultithreadForDS', '-log']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('dedicated server installer tests passed');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
