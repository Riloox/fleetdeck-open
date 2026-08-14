'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const tshock = require('../lib/terraria-tshock.cjs');

(async () => {
  const config = { enabled: true, host: '127.0.0.1', port: 7878, token: 'fixture-secret-token' };
  const adapter = tshock.createAdapter({ fetch: async () => ({ ok: true, status: 200, text: async () => '{}' }) });
  await adapter.request(config, 'GET', '/v2/server/status');
  assert.equal(adapter.health().state, 'healthy');
  assert.equal(JSON.stringify(adapter.health()).includes(config.token), false);
  await assert.rejects(adapter.request({ ...config, host: '0.0.0.0' }, 'GET', '/v2/server/status'),
    (error) => error.code === 'non_loopback_host');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fleetdeck-tshock-'));
  try {
    const db = new Database(path.join(root, 'tshock.sqlite'));
    db.exec(`
      CREATE TABLE Users (Username TEXT, Password TEXT, Usergroup TEXT, Registered TEXT, LastAccessed TEXT);
      CREATE TABLE GroupList (GroupName TEXT PRIMARY KEY, Parent TEXT, Commands TEXT, ChatColor TEXT, Prefix TEXT, Suffix TEXT);
      CREATE TABLE Bans (ID INTEGER, Name TEXT, UUID TEXT, Reason TEXT, Expiration TEXT, BanningUser TEXT);
      INSERT INTO GroupList VALUES ('guest', '', 'tshock.world', '', '', '');
      INSERT INTO GroupList VALUES ('admin', 'guest', 'tshock.admin,plugin.dynamic', '', '', '');
      INSERT INTO Users VALUES ('operator', 'secret-hash', 'admin', '', '');
    `);
    db.close();
    const desc = { dir: root };
    assert.deepEqual(tshock.effectivePermissions(tshock.listGroups(desc), 'admin'),
      ['plugin.dynamic', 'tshock.admin', 'tshock.world']);
    assert.throws(() => tshock.previewGroup(desc, {
      name: 'guest', parent: 'admin', permissions: ['tshock.world'],
    }), (error) => error.code === 'parent_cycle');
    assert.throws(() => tshock.groupAction(desc, 'delete', { name: 'admin' }, { online: false }),
      (error) => error.code === 'group_has_members');
    const preview = tshock.previewGroup(desc, { name: 'admin', parent: 'guest', permissions: ['plugin.unknown'] },
      { group: 'admin' });
    assert.equal(preview.unknownPermissions.includes('plugin.unknown'), true);
    assert.equal(preview.selfLockout, true);
    fs.writeFileSync(path.join(root, 'tshock.sqlite-wal'), '');
    assert.throws(() => tshock.groupAction(desc, 'save', preview.after, { online: false, confirmSelfLockout: true }),
      (error) => error.code === 'database_live');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const result = tshock.accountAction({}, 'setPassword', { name: 'operator', password: 'new-secret' },
    { online: true, manager: { sendCommand() {} } });
  assert.equal(result.passwordChanged, true);
  assert.equal(JSON.stringify(result).includes('new-secret'), false);
  console.log('terraria-tshock tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
