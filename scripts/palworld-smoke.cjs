'use strict';

const assert = require('assert');
const { createPalworldAdapter, normalizePlayers } = require('../lib/modules/palworld/adapter.cjs');
const { scanSensitive } = require('../lib/palworld-verification.cjs');

async function main() {
  if (process.env.FLEETDECK_PALWORLD_SMOKE !== '1') {
    console.error('Refusing to run: set FLEETDECK_PALWORLD_SMOKE=1 for an opt-in disposable-server check.');
    process.exitCode = 2;
    return;
  }
  const restPort = Number(process.env.PALWORLD_REST_PORT);
  const adminPassword = process.env.PALWORLD_ADMIN_PASSWORD;
  assert(Number.isInteger(restPort) && restPort >= 1 && restPort <= 65535, 'PALWORLD_REST_PORT is required');
  assert(adminPassword, 'PALWORLD_ADMIN_PASSWORD is required');

  const adapter = createPalworldAdapter({ timeoutMs: 8_000 });
  const config = { restPort, adminPassword };
  const info = await adapter.request(config, 'GET', '/info');
  const players = normalizePlayers(await adapter.request(config, 'GET', '/players'));
  const summary = {
    ok: true,
    target: `127.0.0.1:${restPort}`,
    version: typeof info.version === 'string' ? info.version : null,
    playerCount: players.length,
    checkedAt: new Date().toISOString(),
  };
  assert.deepEqual(scanSensitive(summary, { knownSecrets: [adminPassword] }), []);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`Palworld smoke check failed: ${error.message}`);
  process.exitCode = 1;
});
