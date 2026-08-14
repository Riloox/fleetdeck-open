'use strict';

const assert = require('assert');
const path = require('path');
const { createPalworldAdapter, normalizePlayers } = require('../lib/modules/palworld/adapter.cjs');
const { assertMutationEnabled, rolloutState, scanSensitive } = require('../lib/palworld-verification.cjs');
const { createRestHarness, loadFixture } = require('./helpers/palworld-rest-harness.cjs');

async function run() {
  const fixtureFile = path.join(__dirname, 'fixtures', 'palworld', 'rest-lifecycle.json');
  const fixture = loadFixture(fixtureFile);
  const delays = [];
  const harness = createRestHarness(fixture, { wait: async (ms) => delays.push(ms) });
  const adapter = createPalworldAdapter({ fetch: harness.fetch });
  const config = { restPort: 8212, adminPassword: 'fixture-only-password' };

  assert.equal((await adapter.request(config, 'GET', '/info')).servername, 'Disposable Fleet');
  const players = normalizePlayers(await adapter.request(config, 'GET', '/players'));
  assert.equal(players[0].userId, 'fixture-user-1');
  assert.deepEqual(delays, [250]);
  await assert.rejects(() => adapter.request(config, 'GET', '/metrics'), (error) => error.state === 'unauthorized');
  await assert.rejects(() => adapter.request(config, 'GET', '/metrics'), (error) => error.state === 'malformed');
  await assert.rejects(() => adapter.request(config, 'GET', '/metrics'), (error) => error.state === 'timeout');
  await assert.rejects(() => adapter.request(config, 'GET', '/metrics'), (error) => error.state === 'unavailable');
  assert.equal((await adapter.request(config, 'GET', '/metrics')).serverfps, 60);
  harness.assertComplete();

  assert.deepEqual(scanSensitive(fixture), []);
  assert.deepEqual(scanSensitive({ headers: { authorization: 'Basic Zml4dHVyZS1zZWNyZXQ=' } }).map((item) => item.reason).sort(),
    ['credential_pattern', 'sensitive_key']);
  assert.equal(scanSensitive({ message: 'failed', nested: ['do-not-leak-this'] },
    { knownSecrets: ['do-not-leak-this'] })[0].reason, 'known_secret');

  const rollout = rolloutState({});
  assert.equal(rollout.status.enabled, true);
  assert.equal(rollout.map.enabled, true);
  assert.equal(rollout.settings.enabled, false);
  assert.equal(rollout.integrations.optional, true);
  assert.throws(() => assertMutationEnabled('updates', {}), (error) => error.code === 'palworld_feature_disabled');
  assert.equal(assertMutationEnabled('updates', { updates: true }).enabled, true);

  console.log('palworld verification tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
