'use strict';

/*
 * Palworld profile export/import and adoption
 * (docs/palworld/07-portability-safety.md).
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { setupDataDir, teardown, TMP_ROOT } = require('./_setup.cjs');
setupDataDir();

const migrations = require('../lib/migrations.cjs');
const portability = require('../lib/palworld-portability.cjs');
const settings = require('../lib/palworld-settings.cjs');

migrations.runMigrations();

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ADMIN_PASSWORD = 'sekritsekritsekritsekritsekrit01';
function ini({ port = 8211, restPort = 8212, adminPassword = ADMIN_PASSWORD, rest = 'True' } = {}) {
  return '[/Script/Pal.PalGameWorldSettings]\n'
    + `OptionSettings=(Difficulty=None,ServerName="Bonfire",ServerDescription="hi",AdminPassword="${adminPassword}",`
    + `ServerPassword="",PublicPort=${port},PublicIP="",RESTAPIEnabled=${rest},RESTAPIPort=${restPort},ServerPlayerMaxNum=16)\n`;
}

/*
 * Adoption refuses an install the real host cannot run, so a fixture that has
 * to come back ready is native to whichever host the suite runs on. The
 * platform rules themselves are covered by the compatibility tests.
 */
const NATIVE_TARGET = process.platform === 'win32' ? 'windows' : 'linux';
const NATIVE_EXECUTABLE = NATIVE_TARGET === 'windows' ? 'PalServer.exe' : 'PalServer.sh';

function makeServer(name, options = {}) {
  const dir = path.join(TMP_ROOT, name);
  const config = path.join(dir, 'Pal', 'Saved', 'Config', 'LinuxServer', 'PalWorldSettings.ini');
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, options.ini === undefined ? ini(options) : options.ini);
  const save = path.join(dir, 'Pal', 'Saved', 'SaveGames', '0', 'ABCDEF');
  fs.mkdirSync(save, { recursive: true });
  fs.writeFileSync(path.join(save, 'Level.sav'), 'level-bytes');
  fs.writeFileSync(path.join(save, 'LocalData.sav'), 'local-bytes');
  if (options.executable !== null) {
    fs.writeFileSync(path.join(dir, options.executable || 'PalServer.sh'), '#!/bin/sh\n');
  }
  if (options.mods) {
    const inventory = path.join(dir, '.fleetdeck', 'palworld-mods', 'inventory.json');
    fs.mkdirSync(path.dirname(inventory), { recursive: true });
    fs.writeFileSync(inventory, JSON.stringify({ packages: [{ name: 'Pal Mod', slug: 'pal-mod', kind: 'pak', provider: 'steam-workshop', sourceItemId: '12345', files: [{ path: 'a.pak', bytes: 4 }], sizeBytes: 4 }] }));
  }
  return {
    id: name, name, type: 'palworld', dir,
    executable: path.join(dir, options.executable || 'PalServer.sh'),
    port: options.port || 8211,
    restPort: options.restPort || 8212,
    adminPassword: ADMIN_PASSWORD,
    maxPlayers: 16,
    serverName: 'Bonfire',
  };
}

// --- export ---------------------------------------------------------------

test('an export preview reports what travels and what is deliberately excluded', () => {
  const server = makeServer('export-preview', { mods: true });
  const preview = portability.exportPreview({ server, selection: 'complete', tasks: [{ name: 'nightly', type: 'backup', schedule: '0 4 * * *' }] });
  assert.strictEqual(preview.selection, 'complete');
  assert.deepStrictEqual(preview.sections, { configuration: true, world: true, mods: true, schedules: true });
  assert.strictEqual(preview.bySection.world.files, 2);
  assert.ok(preview.excluded.some((item) => /administration password/i.test(item)));
  assert.ok(preview.warnings.some((item) => item.code === 'secrets_excluded'));
});

test('a configuration-only export carries no save data', () => {
  const server = makeServer('export-config-only');
  const preview = portability.exportPreview({ server, selection: 'configuration' });
  assert.strictEqual(preview.sections.world, false);
  assert.strictEqual(preview.bySection.world, undefined);
});

test('an export never contains the administration password or machine paths', async () => {
  const server = makeServer('export-secrets', { mods: true });
  const result = await portability.exportProfile({ server, selection: 'complete', actorId: 'u1' });
  const bytes = fs.readFileSync(result.file);
  assert.strictEqual(bytes.includes(Buffer.from(ADMIN_PASSWORD)), false);
  assert.strictEqual(JSON.stringify(result.manifest).includes(server.dir), false);
  assert.strictEqual(result.manifest.server.targetPlatform, 'linux');
  assert.strictEqual(result.manifest.secretsExcluded, true);
  assert.ok(result.manifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test('an unparsable settings file stops the export instead of exporting garbage', async () => {
  const server = makeServer('export-broken', { ini: 'OptionSettings=(oops' });
  await assert.rejects(async () => portability.exportProfile({ server }), (error) => error.code === 'malformed_settings');
});

// --- round trip -----------------------------------------------------------

async function roundTrip(name, options = {}) {
  const server = makeServer(name, { mods: true, ...options });
  const exported = await portability.exportProfile({
    server,
    selection: 'complete',
    tasks: [{ name: 'nightly', type: 'backup', schedule: '0 4 * * *' }],
    updatePolicy: { enabled: true, backupRequired: true },
  });
  return { server, exported };
}

test('a profile round trip preserves selected data and generates a new administration password', async () => {
  const { exported } = await roundTrip('round-trip');
  const preview = await portability.importPreview({ file: exported.file, actorId: 'u1', servers: [] });
  assert.strictEqual(preview.manifest.format, portability.FORMAT);
  assert.strictEqual(preview.generatesNewAdminPassword, true);
  assert.strictEqual(preview.requiresServerFiles, true);
  assert.ok(preview.requiredBytes >= preview.totals.bytes);

  const destination = path.join(TMP_ROOT, 'round-trip-imported');
  const result = portability.confirmImport({
    token: preview.token, actorId: 'u1', name: 'Imported', dir: destination, port: 9211, restPort: 9212, servers: [],
  });
  assert.strictEqual(result.descriptor.port, 9211);
  assert.notStrictEqual(result.descriptor.adminPassword, ADMIN_PASSWORD);
  assert.ok(result.descriptor.adminPassword.length >= 32);
  assert.strictEqual(
    fs.readFileSync(path.join(destination, 'Pal', 'Saved', 'SaveGames', '0', 'ABCDEF', 'Level.sav'), 'utf8'),
    'level-bytes',
  );
  const written = settings.parse(fs.readFileSync(settings.configPath(destination)));
  const values = new Map(written.members.map((member) => [member.key, settings.decode(member.rawValue)]));
  assert.strictEqual(values.get('RESTAPIPort'), 9212);
  assert.strictEqual(values.get('PublicPort'), 9211);
  assert.strictEqual(values.get('RESTAPIEnabled'), true);
  assert.strictEqual(values.get('AdminPassword'), result.descriptor.adminPassword);
  assert.strictEqual(values.get('Difficulty'), 'None');
  assert.strictEqual(result.schedules.length, 1);
  assert.strictEqual(result.updatePolicy.enabled, true);
});

test('import rejects a tampered archive, an unknown format, and a newer version', async () => {
  const { exported } = await roundTrip('tampered');
  const tampered = path.join(TMP_ROOT, 'tampered.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(tampered);
    const zip = archiver('zip');
    output.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(output);
    zip.append(JSON.stringify(exported.manifest), { name: 'manifest.json' });
    zip.append('not-the-original-bytes', { name: exported.manifest.entries.find((entry) => entry.path.startsWith('save/')).path });
    zip.finalize();
  });
  await assert.rejects(
    async () => portability.importPreview({ file: tampered, actorId: 'u1' }),
    (error) => error.code === 'hash_mismatch' || error.code === 'missing_entry',
  );

  const foreign = path.join(TMP_ROOT, 'foreign.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(foreign);
    const zip = archiver('zip');
    output.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(output);
    zip.append(JSON.stringify({ format: 'something-else', version: 1, entries: [] }), { name: 'manifest.json' });
    zip.finalize();
  });
  await assert.rejects(async () => portability.importPreview({ file: foreign, actorId: 'u1' }), (error) => error.code === 'unsupported_format');

  const newer = path.join(TMP_ROOT, 'newer.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(newer);
    const zip = archiver('zip');
    output.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(output);
    zip.append(JSON.stringify({ format: portability.FORMAT, version: portability.PROFILE_VERSION + 1, entries: [] }), { name: 'manifest.json' });
    zip.finalize();
  });
  await assert.rejects(async () => portability.importPreview({ file: newer, actorId: 'u1' }), (error) => error.code === 'unsupported_version');
});

test('import rejects traversal and out-of-scope entries', async () => {
  const evil = path.join(TMP_ROOT, 'evil.zip');
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(evil);
    const zip = archiver('zip');
    output.on('close', resolve);
    zip.on('error', reject);
    zip.pipe(output);
    zip.append(JSON.stringify({ format: portability.FORMAT, version: 1, entries: [] }), { name: 'manifest.json' });
    zip.append('pwned', { name: '../../escape.txt' });
    zip.finalize();
  });
  await assert.rejects(
    async () => portability.importPreview({ file: evil, actorId: 'u1' }),
    (error) => ['invalid_path', 'archive_scope', 'path_traversal', 'archive_rejected'].includes(error.code),
  );
  assert.strictEqual(fs.existsSync(path.join(TMP_ROOT, 'escape.txt')), false);
});

test('import reports collisions and refuses to reuse a taken name or port', async () => {
  const { exported } = await roundTrip('collisions');
  const registered = [{ id: 'other', name: 'Bonfire', dir: path.join(TMP_ROOT, 'other-server'), port: 8211, restPort: 8212 }];
  const preview = await portability.importPreview({ file: exported.file, actorId: 'u1', servers: registered });
  assert.ok(preview.collisions.some((item) => item.kind === 'port'));
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u1', name: 'Bonfire', dir: path.join(TMP_ROOT, 'collide'), port: 7000, restPort: 7001, servers: [{ id: 'x', name: 'Bonfire' }] }),
    (error) => error.code === 'name_collision',
  );
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u1', name: 'Fresh', dir: path.join(TMP_ROOT, 'collide'), port: 8211, restPort: 7001, servers: registered }),
    (error) => error.code === 'port_collision',
  );
});

test('import never merges into a non-empty folder and never targets a protected root', async () => {
  const { exported } = await roundTrip('no-merge');
  const preview = await portability.importPreview({ file: exported.file, actorId: 'u1' });
  const occupied = path.join(TMP_ROOT, 'occupied');
  fs.mkdirSync(occupied, { recursive: true });
  fs.writeFileSync(path.join(occupied, 'existing.txt'), 'keep me');
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u1', name: 'Fresh', dir: occupied, port: 7100, restPort: 7101 }),
    (error) => error.code === 'destination_not_empty',
  );
  assert.strictEqual(fs.readFileSync(path.join(occupied, 'existing.txt'), 'utf8'), 'keep me');
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u1', name: 'Fresh', dir: require('../lib/db.cjs').dataDir(), port: 7100, restPort: 7101 }),
    (error) => error.code === 'fleetdeck_data',
  );
});

test('a stale or foreign preview cannot be confirmed', async () => {
  const { exported } = await roundTrip('stale');
  const preview = await portability.importPreview({ file: exported.file, actorId: 'u1' });
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u2', name: 'Fresh', dir: path.join(TMP_ROOT, 'stale-out'), port: 7200, restPort: 7201 }),
    (error) => error.code === 'preview_owner_mismatch',
  );
  assert.throws(
    () => portability.confirmImport({ token: preview.token, actorId: 'u1', name: 'Fresh', dir: path.join(TMP_ROOT, 'stale-out'), port: 7200, restPort: 7201, now: Date.now() + 60 * 60_000 }),
    (error) => error.code === 'stale_preview',
  );
  assert.throws(
    () => portability.confirmImport({ token: 'made-up', actorId: 'u1', name: 'Fresh', dir: path.join(TMP_ROOT, 'stale-out'), port: 7200, restPort: 7201 }),
    (error) => error.code === 'stale_preview',
  );
});

// --- adoption -------------------------------------------------------------

test('adoption inspection detects the install and previews the REST reconciliation', () => {
  const server = makeServer('adopt-inspect', { rest: 'False', restPort: 0, executable: NATIVE_EXECUTABLE });
  const inspection = portability.inspectAdoption({ dir: server.dir, servers: [] });
  assert.strictEqual(inspection.ok, true);
  assert.strictEqual(inspection.targetPlatform, NATIVE_TARGET);
  assert.strictEqual(inspection.executable.relative, NATIVE_EXECUTABLE);
  assert.strictEqual(inspection.ports.publicPort, 8211);
  assert.strictEqual(inspection.ports.proposedRestPort, 8212);
  assert.strictEqual(inspection.saves.length, 1);
  assert.ok(inspection.reconcile.some((item) => item.key === 'RESTAPIEnabled' && item.next === true));
  assert.ok(inspection.reconcile.some((item) => item.key === 'AdminPassword' && item.next === 'unchanged'));
  assert.strictEqual(inspection.ready, true);
});

test('adoption rejects protected roots and folders overlapping a registered server', () => {
  const server = makeServer('adopt-overlap');
  const registered = [{ id: 'other', name: 'Other', dir: server.dir }];
  const blocked = portability.inspectAdoption({ dir: server.dir, servers: registered });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.blocked.reason, 'server_overlap');
  assert.throws(() => portability.adopt({ dir: server.dir, name: 'Nope', servers: registered }), (error) => error.code === 'server_overlap');
  const data = portability.inspectAdoption({ dir: require('../lib/db.cjs').dataDir(), servers: [] });
  assert.strictEqual(data.blocked.reason, 'fleetdeck_data');
});

test('adoption preserves saves and an existing administration password', () => {
  const server = makeServer('adopt-preserve', { rest: 'False' });
  const before = fs.readFileSync(path.join(server.dir, 'Pal', 'Saved', 'SaveGames', '0', 'ABCDEF', 'Level.sav'), 'utf8');
  const result = portability.adopt({ dir: server.dir, name: 'Adopted', servers: [] });
  assert.strictEqual(result.descriptor.adminPassword, ADMIN_PASSWORD);
  assert.strictEqual(result.descriptor.port, 8211);
  assert.strictEqual(result.descriptor.restPort, 8212);
  assert.strictEqual(result.descriptor.serverName, 'Bonfire');
  assert.ok(result.reconciled.includes('RESTAPIEnabled'));
  assert.strictEqual(result.reconciled.includes('AdminPassword'), false);
  assert.strictEqual(fs.readFileSync(path.join(server.dir, 'Pal', 'Saved', 'SaveGames', '0', 'ABCDEF', 'Level.sav'), 'utf8'), before);
  const values = new Map(settings.parse(fs.readFileSync(settings.configPath(server.dir))).members.map((m) => [m.key, settings.decode(m.rawValue)]));
  assert.strictEqual(values.get('RESTAPIEnabled'), true);
  assert.strictEqual(values.get('AdminPassword'), ADMIN_PASSWORD);
  assert.strictEqual(values.get('ServerDescription'), 'hi');
});

test('adoption generates an administration password only when none exists', () => {
  const server = makeServer('adopt-generate', { adminPassword: '' });
  const result = portability.adopt({ dir: server.dir, name: 'Adopted 2', servers: [], generatePassword: () => 'generated-password-value-0123456789' });
  assert.strictEqual(result.descriptor.adminPassword, 'generated-password-value-0123456789');
  assert.ok(result.reconciled.includes('AdminPassword'));
});

test('adoption refuses an installation without an executable or settings file', () => {
  const noExecutable = makeServer('adopt-no-exe', { executable: null });
  fs.rmSync(path.join(noExecutable.dir, 'PalServer.sh'), { force: true });
  const inspection = portability.inspectAdoption({ dir: noExecutable.dir, servers: [] });
  assert.strictEqual(inspection.ready, false);
  assert.throws(() => portability.adopt({ dir: noExecutable.dir, name: 'X', servers: [] }), (error) => error.code === 'executable_missing');

  const bare = path.join(TMP_ROOT, 'adopt-bare');
  fs.mkdirSync(bare, { recursive: true });
  fs.writeFileSync(path.join(bare, 'PalServer.sh'), '#!/bin/sh\n');
  assert.throws(() => portability.adopt({ dir: bare, name: 'Y', servers: [] }), (error) => error.code === 'settings_missing');
});

(async () => {
  for (const [name, fn] of tests) {
    await fn();
    console.log(`  ok  ${name}`);
  }
  console.log('palworld portability tests passed');
  teardown();
})().catch((error) => {
  console.error(error);
  teardown();
  process.exitCode = 1;
});
