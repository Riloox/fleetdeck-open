'use strict';

const assert = require('assert');
const http = require('http');
const express = require('express');
const { setupDataDir, teardown } = require('./_setup.cjs');
setupDataDir();

const { close } = require('../lib/db.cjs');
const migrations = require('../lib/migrations.cjs');
const operations = require('../lib/operations.cjs');
const capabilities = require('../lib/capabilities.cjs');
const { router } = require('../lib/routes/operations.cjs');

async function main() {
  migrations.runMigrations();
  const admin = { id: 'admin-routes', role: 'admin' };
  const operator = { id: 'operator-routes', role: 'operator' };
  capabilities.grant(operator.id, 'server-a', capabilities.CAPABILITIES.SERVER_CONTROL, admin.id);
  const allowed = operations.create({ kind: 'test.allowed', actorId: admin.id, serverId: 'server-a' });
  const hidden = operations.create({ kind: 'test.hidden', actorId: admin.id, serverId: 'server-b' });

  const app = express();
  app.use((req, res, next) => {
    req.user = req.headers['x-test-user'] === 'admin' ? admin : operator;
    next();
  });
  app.use('/api/operations', router());
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/operations?serverId=server-a`);
    assert.strictEqual(response.status, 200);
    assert.ok((await response.json()).items.some((op) => op.id === allowed.id));

    response = await fetch(`${base}/api/operations?serverId=server-b`);
    assert.strictEqual(response.status, 403);
    response = await fetch(`${base}/api/operations/${hidden.id}`);
    assert.strictEqual(response.status, 403);

    response = await fetch(`${base}/api/operations`, { headers: { 'x-test-user': 'admin' } });
    assert.strictEqual(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    close();
    teardown();
  }
  console.log('PASS  foundation-routes');
}

main().catch((err) => {
  console.error(err);
  close();
  teardown();
  process.exit(1);
});
