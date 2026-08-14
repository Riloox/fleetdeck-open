'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const createTerrariaModule = require('../lib/modules/terraria/manager.cjs');

function fixture(variant = 'vanilla') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-terraria-backup-test-'));
  const write = (rel, value = rel) => {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write('Worlds/world.wld');
  write('Worlds/world.twld');
  write('serverconfig.txt');
  write('TerrariaServer.exe');
  write('dotnet/runtime.dll');
  write('Logs/server.log');
  write('steamapps/workshop/content/cache.bin');
  write('Mods/enabled.json', '[]');
  write('Mods/MyPack.json', '{}');
  write('Mods/LargeMod.tmod');
  write('tshock/config.json');
  write('tshock/tshock.sqlite');
  write('tshock/tshock.sqlite-wal');
  write('tshock/logs/server.log');
  return {
    dir,
    desc: { dir, terrariaVariant: variant, terrariaSaveDir: 'Worlds' },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

async function run() {
  for (const variant of ['vanilla', 'tshock', 'tmodloader']) {
    const f = fixture(variant);
    try {
      const module = createTerrariaModule();
      const selected = module.backupSelection(f.desc);
      assert(selected.includes('Worlds/world.wld'));
      assert(selected.includes('serverconfig.txt'));
      assert(!selected.some((item) => /TerrariaServer|dotnet|Logs|workshop/i.test(item)));
      if (variant === 'tshock') {
        assert(selected.includes('tshock/tshock.sqlite'));
        assert(!selected.some((item) => /logs|-(?:wal|journal)$/i.test(item)));
      }
      if (variant === 'tmodloader') {
        assert(selected.includes('Mods/enabled.json'));
        assert(selected.includes('Mods/MyPack.json'));
        assert(!selected.includes('Mods/LargeMod.tmod'));
        const withMods = module.backupSelection(f.desc, { includeMods: true });
        assert(withMods.includes('Mods/LargeMod.tmod'));
        assert.deepStrictEqual(withMods.filter((item) => item !== 'Mods/LargeMod.tmod'), selected);
      }
    } finally { f.cleanup(); }
  }

  const f = fixture();
  try {
    const module = createTerrariaModule({ backupSaveTimeoutMs: 100 });
    const manager = {
      status: 'online',
      moduleState: {},
      desc: () => f.desc,
      sendCommand(command) {
        assert.strictEqual(command, 'save');
        setTimeout(() => module.inspectLine('Backing up world file', manager), 5);
        return { ok: true };
      },
      broadcast() {},
      _afterPlayerChange() {},
      pushLine() {},
    };
    const result = await module.backupPrepare(manager);
    assert.strictEqual(result.saved, true);

    manager.sendCommand = () => ({ ok: true });
    const timeout = await module.backupPrepare(manager);
    assert.deepStrictEqual(timeout, { saved: false, reason: 'save_not_confirmed' });

    manager.status = 'offline';
    manager.sendCommand = () => { throw new Error('must not send'); };
    assert.strictEqual(await module.backupPrepare(manager), null);
  } finally { f.cleanup(); }

  console.log('terraria backups: ok');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
