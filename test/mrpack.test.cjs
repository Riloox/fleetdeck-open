'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const {
  readMrpackIndex,
  manifestToSpec,
  serverSideFiles,
  fileCountByEnv,
  extractOverrides,
  safeResolve,
  SUPPORTED_LOADERS,
} = require('../lib/mrpack.cjs');

function createMrpackZip(indexJson) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.append(indexJson, { name: 'modrinth.index.json', store: false });
    archive.finalize();
  });
}

function createMrpackWithOverrides(indexJson, overrides) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.append(indexJson, { name: 'modrinth.index.json', store: false });
    for (const [entryName, content] of Object.entries(overrides)) {
      archive.append(content, { name: entryName, store: false });
    }
    archive.finalize();
  });
}

test('readMrpackIndex parses a valid mrpack zip', async () => {
  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: 'Test Modpack',
    dependencies: {
      minecraft: '1.20.1',
      'fabric-loader': '0.16.0',
    },
    files: [],
  };
  const buf = await createMrpackZip(JSON.stringify(index));
  const parsed = await readMrpackIndex(buf);
  assert.deepStrictEqual(parsed, index);
});

test('readMrpackIndex fails on invalid zip', async () => {
  await assert.rejects(
    () => readMrpackIndex(Buffer.from('not a zip')),
    /Failed to open mrpack|End of central directory/
  );
});

test('readMrpackIndex fails when index.json is missing', async () => {
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.append('hello', { name: 'something-else.json', store: false });
    archive.finalize();
  });
  await assert.rejects(
    () => readMrpackIndex(buf),
    /modrinth.index.json not found/
  );
});

test('manifestToSpec extracts fabric loader', () => {
  const spec = manifestToSpec({
    dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.16.0' },
    name: 'Test',
    versionId: '1.0',
  });
  assert.strictEqual(spec.unsupported, false);
  assert.strictEqual(spec.loaderType, 'fabric');
  assert.strictEqual(spec.mcVersion, '1.20.1');
  assert.strictEqual(spec.loaderVersion, '0.16.0');
});

test('manifestToSpec extracts forge loader', () => {
  const spec = manifestToSpec({
    dependencies: { minecraft: '1.20.1', forge: '47.2.0' },
    name: 'Forge Pack',
    versionId: '2.0',
  });
  assert.strictEqual(spec.unsupported, false);
  assert.strictEqual(spec.loaderType, 'forge');
  assert.strictEqual(spec.mcVersion, '1.20.1');
  assert.strictEqual(spec.loaderVersion, '47.2.0');
});

test('manifestToSpec extracts neoforge loader', () => {
  const spec = manifestToSpec({
    dependencies: { minecraft: '1.21.1', neoforge: '21.1.1' },
    name: 'Neo Pack',
    versionId: '1.0',
  });
  assert.strictEqual(spec.unsupported, false);
  assert.strictEqual(spec.loaderType, 'neoforge');
  assert.strictEqual(spec.mcVersion, '1.21.1');
});

test('manifestToSpec rejects quilt loader as unsupported', () => {
  const spec = manifestToSpec({
    dependencies: { minecraft: '1.20.1', 'quilt-loader': '0.27.0' },
    name: 'Quilt Pack',
    versionId: '1.0',
  });
  assert.strictEqual(spec.unsupported, true);
  assert.strictEqual(spec.loaderType, 'quilt');
  assert.strictEqual(spec.mcVersion, '1.20.1');
  assert.strictEqual(spec.reason, 'Loader "quilt" is not supported. Supported: fabric, forge, neoforge');
});

test('manifestToSpec marks unknown loader as unsupported', () => {
  const spec = manifestToSpec({
    dependencies: { minecraft: '1.20.1', 'some-loader': '1.0' },
    name: 'Unknown',
    versionId: '1',
  });
  assert.strictEqual(spec.unsupported, true);
  assert.strictEqual(spec.reason, 'No recognized mod loader in dependencies (expected fabric-loader, forge, or neoforge)');
});

test('manifestToSpec returns unsupported when no dependencies', () => {
  assert.strictEqual(manifestToSpec({ name: 'Test' }).unsupported, true);
  assert.strictEqual(manifestToSpec(null).unsupported, true);
  assert.strictEqual(manifestToSpec({}).unsupported, true);
  assert.strictEqual(manifestToSpec({ dependencies: {} }).unsupported, true);
  assert.strictEqual(manifestToSpec({ dependencies: { something: 'else' } }).unsupported, true);
});

test('manifestToSpec returns unsupported when no minecraft version', () => {
  const spec = manifestToSpec({
    dependencies: { 'fabric-loader': '0.16.0' },
  });
  assert.strictEqual(spec.unsupported, true);
  assert.strictEqual(spec.reason, 'No Minecraft version in dependencies');
});

test('serverSideFiles filters by env correctly', () => {
  const index = {
    files: [
      { path: 'mods/server-only.jar', env: { client: 'unsupported', server: 'required' } },
      { path: 'mods/client-only.jar', env: { client: 'required', server: 'unsupported' } },
      { path: 'mods/both.jar', env: { client: 'optional', server: 'optional' } },
      { path: 'mods/both2.jar', env: { client: 'required', server: 'required' } },
      { path: 'mods/default.jar', env: {} },
      { path: 'mods/no-env.jar' },
    ],
  };
  const result = serverSideFiles(index);
  const paths = result.map((f) => f.path);
  assert.deepStrictEqual(paths.sort(), [
    'mods/both.jar',
    'mods/both2.jar',
    'mods/default.jar',
    'mods/no-env.jar',
    'mods/server-only.jar',
  ].sort());
});

test('fileCountByEnv returns correct totals', () => {
  const index = {
    files: [
      { path: 'a', env: { client: 'unsupported', server: 'required' } },
      { path: 'b', env: { client: 'required', server: 'unsupported' } },
    ],
  };
  const counts = fileCountByEnv(index);
  assert.strictEqual(counts.total, 2);
  assert.strictEqual(counts.server, 1);
});

test('safeResolve allows valid relative paths', () => {
  const base = '/tmp/test-server';
  const resolved = safeResolve(base, 'mods/foo.jar');
  assert.strictEqual(resolved, path.resolve(base, 'mods/foo.jar'));
});

test('safeResolve rejects traversal paths', () => {
  const base = '/tmp/test-server';
  assert.strictEqual(safeResolve(base, '../escape.txt'), null);
  assert.strictEqual(safeResolve(base, '..'), null);
  assert.strictEqual(safeResolve(base, '../../etc/passwd'), null);
});

test('safeResolve allows absolute paths within base', () => {
  const base = '/tmp/test-server';
  const resolved = safeResolve(base, path.join(base, 'mods/ok.jar'));
  assert.notStrictEqual(resolved, null);
});

test('SUPPORTED_LOADERS contains fabric, forge, neoforge', () => {
  assert.deepStrictEqual(SUPPORTED_LOADERS, ['fabric', 'forge', 'neoforge']);
});

test('extractOverrides extracts server overrides', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrpack-test-'));
  try {
    const index = JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1',
      name: 'Test',
      dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.16.0' },
      files: [],
    });
    const buf = await createMrpackWithOverrides(index, {
      'serverOverrides/config/test.cfg': 'overridden config',
      'serverOverrides/scripts/test.lua': 'print("hello")',
    });
    const extracted = await extractOverrides(buf, tmp);
    assert.strictEqual(extracted, 2);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'config', 'test.cfg'), 'utf8'), 'overridden config');
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'scripts', 'test.lua'), 'utf8'), 'print("hello")');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('extractOverrides uses client overrides when no server overrides', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrpack-test-'));
  try {
    const index = JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1',
      name: 'Test',
      dependencies: { minecraft: '1.20.1', forge: '47.2.0' },
      files: [],
    });
    const buf = await createMrpackWithOverrides(index, {
      'clientOverrides/config/common.cfg': 'common config',
    });
    const extracted = await extractOverrides(buf, tmp);
    assert.strictEqual(extracted, 1);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'config', 'common.cfg'), 'utf8'), 'common config');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('extractOverrides rejects traversal in overrides', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mrpack-test-'));
  try {
    const index = JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1',
      name: 'Test',
      dependencies: { minecraft: '1.20.1', 'fabric-loader': '0.16.0' },
      files: [],
    });
    const buf = await createMrpackWithOverrides(index, {
      'serverOverrides/../../../escape.txt': 'evil',
    });
    await assert.rejects(
      () => extractOverrides(buf, tmp),
      /invalid relative path/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
