const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const {
  findForgeLaunchTarget,
  installerFailureMessage,
  runForgeInstaller,
} = require('../lib/serverInstaller.cjs');
const {
  extractZip,
  safeZipTarget,
} = require('../lib/runtimeArchive.cjs');

function makeStoredZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

test('installer error explains missing Java runtime', () => {
  const err = Object.assign(new Error('spawn java ENOENT'), { code: 'ENOENT' });
  assert.match(
    installerFailureMessage('NeoForge', 'java', '', err),
    /NeoForge installer failed: Java runtime not found at "java"/
  );
});

test('Forge installer launcher uses the resolved Java binary instead of PATH java', { skip: process.platform === 'win32' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-installer-'));
  const oldPath = process.env.PATH;

  try {
    const javaBin = path.join(tmp, 'fake-java');
    const installer = 'neoforge-test-installer.jar';
    fs.writeFileSync(path.join(tmp, installer), 'fake installer', 'utf8');
    fs.writeFileSync(
      javaBin,
      [
        '#!/bin/sh',
        'printf "%s\\n" "$@" > java-args.txt',
        '/usr/bin/touch 21.1.1.jar',
      ].join('\n') + '\n',
      'utf8'
    );
    fs.chmodSync(javaBin, 0o755);

    process.env.PATH = path.join(tmp, 'empty-path');
    fs.mkdirSync(process.env.PATH);

    await runForgeInstaller(tmp, installer, 'NeoForge', javaBin);

    assert.equal(fs.existsSync(path.join(tmp, installer)), false);
    assert.equal(fs.existsSync(path.join(tmp, '21.1.1.jar')), true);
    assert.equal(
      fs.readFileSync(path.join(tmp, 'java-args.txt'), 'utf8'),
      `-jar\n${installer}\n--installServer\n`
    );
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Forge installer succeeds even when its stdout exceeds the execFile default maxBuffer', { skip: process.platform === 'win32' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-installer-'));
  const oldPath = process.env.PATH;

  try {
    const javaBin = path.join(tmp, 'fake-java');
    const installer = 'forge-test-installer.jar';
    fs.writeFileSync(path.join(tmp, installer), 'fake installer', 'utf8');
    fs.writeFileSync(
      javaBin,
      [
        '#!/bin/sh',
        // stdout over the 1MB execFile default; the real Forge installer
        // prints far more than this while extracting libraries.
        'head -c 2000000 /dev/zero | tr "\\0" x',
        '/usr/bin/touch 21.1.1.jar',
      ].join('\n') + '\n',
      'utf8'
    );
    fs.chmodSync(javaBin, 0o755);

    process.env.PATH = path.join(tmp, 'empty-path');
    fs.mkdirSync(process.env.PATH);

    await runForgeInstaller(tmp, installer, 'Forge', javaBin);

    assert.equal(fs.existsSync(path.join(tmp, '21.1.1.jar')), true);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('NeoForge installer output can be launched from generated argfiles without a root jar', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-neoforge-args-'));

  try {
    const argsDir = path.join(tmp, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.1');
    fs.mkdirSync(argsDir, { recursive: true });
    fs.writeFileSync(path.join(argsDir, 'unix_args.txt'), '--module-path\nlibraries\n', 'utf8');

    assert.deepEqual(findForgeLaunchTarget(tmp, 'neoforge', 'linux'), {
      jar: 'neoforge-server',
      launchArgs: ['@libraries/net/neoforged/neoforge/21.1.1/unix_args.txt', 'nogui'],
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('NeoForge installer output uses Windows argfiles on Windows', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-neoforge-winargs-'));

  try {
    const argsDir = path.join(tmp, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.1');
    fs.mkdirSync(argsDir, { recursive: true });
    fs.writeFileSync(path.join(argsDir, 'win_args.txt'), '--module-path\r\nlibraries\r\n', 'utf8');

    assert.deepEqual(findForgeLaunchTarget(tmp, 'neoforge', 'win32'), {
      jar: 'neoforge-server',
      launchArgs: ['@libraries/net/neoforged/neoforge/21.1.1/win_args.txt', 'nogui'],
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('managed runtime zip extraction is handled without external tools', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-runtime-zip-'));

  try {
    const archive = path.join(tmp, 'runtime.zip');
    const dest = path.join(tmp, 'out');
    fs.writeFileSync(archive, makeStoredZip([
      ['jdk-test/', ''],
      ['jdk-test/bin/java.exe', 'fake java'],
      ['../escape.txt', 'nope'],
    ]));

    extractZip(archive, dest);

    assert.equal(fs.readFileSync(path.join(dest, 'jdk-test', 'bin', 'java.exe'), 'utf8'), 'fake java');
    assert.equal(fs.existsSync(path.join(tmp, 'escape.txt')), false);
    assert.equal(safeZipTarget(dest, '../escape.txt'), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
