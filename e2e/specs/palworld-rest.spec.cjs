'use strict';

/*
 * The Windows Palworld case: the real server writes its console to its own
 * window, so the "Running Palworld dedicated server" line never reaches the
 * panel's pipe and a healthy REST API is the only proof the process is up.
 * The fake at e2e/support/fake-palworld.cjs never prints that line, so a
 * start here only ever reaches online through the module's own REST polling -
 * which is the regression this spec pins.
 */

const net = require('net');
const { test, expect, en } = require('../support/fixtures.cjs');
const { serverRow } = require('../support/pages.cjs');
const { signInFast, openView, waitForLiveConnection } = require('../support/actions.cjs');
const seed = require('../support/seed.cjs');

const LIFECYCLE = { timeout: 20_000 };

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

test('promotes a Palworld server to online from REST health when the console line never arrives', async ({ page, newApp }) => {
  const restPort = await freePort();
  const panel = await newApp({
    servers: (dirs) => [seed.palworldRunnable(dirs, { name: 'Pal Windows', restPort })],
    // The child process inherits the panel's environment, which is how the
    // fake learns the port it must serve its REST API on.
    env: { FAKE_REST_PORT: String(restPort) },
  });
  await signInFast(page, panel);
  await openView(page, 'palworld', 'servers', { origin: panel.url });

  await waitForLiveConnection(page);
  const row = serverRow(page, 'Pal Windows');
  await expect(row.status).toHaveText(en('status.offline'));

  await row.start.click();
  // No readiness line is ever printed by the fake; the pill flips purely on a
  // healthy REST answer from the module's own readiness polling.
  await expect(row.status).toHaveText(en('status.online'), { timeout: 60_000 });

  await row.stop.click();
  await expect(row.status).toHaveText(en('status.offline'), LIFECYCLE);
});
