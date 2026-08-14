'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const importer = require('../lib/terraria-import.cjs');

const ROOT = path.join(os.tmpdir(), `fleetdeck-terraria-import-${process.pid}`);
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

function folder(name, files = {}) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    if (/Server(?:\.exe|\.bin\.x86_64)?$|tModLoaderServer$/.test(relative)) fs.chmodSync(file, 0o755);
  }
  return dir;
}

function state(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else {
        const stat = fs.statSync(absolute);
        out.push([path.relative(dir, absolute), stat.size, stat.mtimeMs, crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')]);
      }
    }
  };
  walk(dir);
  return out.sort();
}

test('detects all variants with evidence', () => {
  const vanilla = folder('vanilla', { 'TerrariaServer.bin.x86_64': 'binary' });
  const tshock = folder('tshock', { 'TShock.Server': 'binary', 'tshock/config.json': '{}' });
  const tmod = folder('tmod', { 'tModLoader.dll': 'binary', dotnet: 'runtime', 'Mods/enabled.json': '[]' });
  assert.strictEqual(importer.inspect(vanilla).variant.value, 'vanilla');
  assert.strictEqual(importer.inspect(tshock).variant.value, 'tshock');
  assert.strictEqual(importer.inspect(tmod).variant.value, 'tmodloader');
  assert.ok(importer.inspect(tshock).variant.evidence.some((item) => item.source === 'tshock/config.json'));
});

test('ambiguity needs a choice and unknown folders are refused', () => {
  const ambiguous = folder('ambiguous', { 'TShock.Server': 'binary', 'tModLoader.dll': 'binary', dotnet: 'runtime' });
  assert.strictEqual(importer.inspect(ambiguous).variant.value, null);
  assert.throws(() => importer.inspect(folder('unknown', { 'run.sh': 'x' })), (error) => error.code === 'not_terraria');
});

test('preview is read-only and its token is actor and evidence bound', () => {
  const dir = folder('tokens', { 'TerrariaServer.bin.x86_64': 'binary', 'serverconfig.txt': 'port=7778\n' });
  const before = state(dir);
  const foreign = importer.preview({ dir, actorId: 'a' });
  assert.deepStrictEqual(state(dir), before);
  assert.throws(() => importer.consumePreview({ token: foreign.token, actorId: 'b' }), (error) => error.code === 'preview_actor');
  const stale = importer.preview({ dir, actorId: 'a' });
  fs.appendFileSync(path.join(dir, 'serverconfig.txt'), 'maxplayers=12\n');
  assert.throws(() => importer.consumePreview({ token: stale.token, actorId: 'a' }), (error) => error.code === 'preview_stale');
  const once = importer.preview({ dir, actorId: 'a' });
  importer.consumePreview({ token: once.token, actorId: 'a' });
  assert.throws(() => importer.consumePreview({ token: once.token, actorId: 'a' }), (error) => error.code === 'preview_missing');
});

test('outside saves, protected roots, and registered folders are refused', () => {
  const outside = folder('outside', { 'TerrariaServer.bin.x86_64': 'binary', 'serverconfig.txt': `worldpath=${path.join(ROOT, 'elsewhere')}\n` });
  assert.throws(() => importer.inspect(outside), (error) => error.code === 'save_dir_outside');
  assert.throws(() => importer.inspect(path.parse(ROOT).root), (error) => error.code === 'drive_root');
  const dir = folder('registered', { 'TerrariaServer.bin.x86_64': 'binary' });
  assert.throws(() => importer.inspect(dir, { servers: [{ id: 'x', dir }] }), (error) => error.code === 'server_overlap');
});

test('adoption applies only selected fixes and does not start a process', () => {
  const dir = folder('fixes', { 'TerrariaServer.bin.x86_64': 'binary' });
  fs.chmodSync(path.join(dir, 'TerrariaServer.bin.x86_64'), 0o644);
  const preview = importer.preview({ dir, actorId: 'a' });
  // Setting the executable bit is a POSIX-only repair, so Windows is never
  // offered it and proves fixes are opt-in through the unselected writeConfig
  // alone.
  const posix = process.platform !== 'win32';
  assert.strictEqual(preview.inspection.optionalFixes.some((fix) => fix.id === 'makeExecutable'), posix);
  const result = importer.adopt({ token: preview.token, actorId: 'a', name: 'Imported', fixes: posix ? ['makeExecutable'] : [] });
  assert.strictEqual(result.descriptor.terrariaVariant, 'vanilla');
  if (posix) assert.ok(fs.statSync(path.join(dir, 'TerrariaServer.bin.x86_64')).mode & 0o111);
  assert.strictEqual(fs.existsSync(path.join(dir, 'serverconfig.txt')), false);
  assert.strictEqual(result.descriptor.status, undefined);
});

test('a missing configured world warns but still adopts', () => {
  const dir = folder('missing-world', { 'TerrariaServer.bin.x86_64': 'binary', 'serverconfig.txt': 'world=Worlds/missing.wld\n' });
  const preview = importer.preview({ dir, actorId: 'a' });
  assert.ok(preview.inspection.issues.some((issue) => issue.code === 'world_missing'));
  assert.strictEqual(importer.adopt({ token: preview.token, actorId: 'a', name: 'Fresh' }).descriptor.name, 'Fresh');
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
