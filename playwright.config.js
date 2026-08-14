'use strict';

const { defineConfig, devices } = require('@playwright/test');

/*
 * Browser tests. These drive the built panel in a real Chromium, as a user
 * does - the suites under test/ cover the modules and routes underneath.
 *
 * There is no `webServer` here on purpose: each worker boots its own isolated
 * panel on its own port (see e2e/support/instance.cjs), so the specs never
 * touch the real config.json or data/.
 *
 * Slow-runner profile: GitHub's Windows runners are far slower than Linux ones
 * (2-core, real-time AV scanning every fs op this fs-heavy suite makes). The
 * base timeouts are tuned for a dev machine, and on Windows CI the first
 * attempt of roughly one test in seven was timing out and passing on retry - a
 * 14% flake storm that doubled the run and masked real failures. Windows CI
 * gets its own budget (expect/action/navigation scaled up, one worker so
 * panels are not booting against each other). Local runs and Linux CI are
 * untouched.
 */
const slowCI = !!(process.env.CI && process.platform === 'win32');

module.exports = defineConfig({
  testDir: './e2e/specs',
  globalSetup: require.resolve('./e2e/support/global-setup.cjs'),
  globalTeardown: require.resolve('./e2e/support/global-teardown.cjs'),

  // Generous, because a panel boot is in here: ~2s on an idle machine, but
  // several times that when every worker is booting one at the same moment.
  timeout: slowCI ? 180_000 : 90_000,
  expect: { timeout: slowCI ? 20_000 : 7_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // These tests spawn real processes - a panel per worker, plus the child
  // processes the lifecycle and console specs start. One retry absorbs the
  // occasional resource-pressure casualty (a Chromium that gets OOM-killed
  // mid-run) without hiding a test that fails on its own merits: a retried
  // failure is reported as flaky, not passed over in silence.
  retries: 1,
  // Each worker runs a Chromium *and* a Node panel, and they all boot at once
  // at the start of a run. Past ~3 the boots queue behind each other, every
  // test in the first batch pays for it, and the box starts shedding browsers.
  // Windows CI gets one worker: two panels plus Chromium on a 2-core runner
  // with AV scanning makes everything time out together.
  workers: process.env.CI ? (slowCI ? 1 : 2) : 3,

  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  outputDir: 'e2e/results',

  use: {
    actionTimeout: slowCI ? 20_000 : 10_000,
    navigationTimeout: slowCI ? 30_000 : 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The install specs download real game servers from the internet. They
      // are their own project, run on request - see below.
      testIgnore: '**/install.spec.cjs',
    },
    {
      /*
       * Real installs: the create wizard, a real download, a real folder on
       * disk, then a real removal. Opt in per game and run on its own -
       *
       *   E2E_INSTALL=minecraft,terraria npm run test:e2e:install
       *
       * without E2E_INSTALL every test in here skips itself. One worker,
       * because two multi-gigabyte downloads at once help nobody, and no
       * retry, because retrying a 20-minute download to paper over a flake is
       * worse than being told it failed.
       */
      name: 'install',
      testMatch: '**/install.spec.cjs',
      use: { ...devices['Desktop Chrome'], actionTimeout: slowCI ? 60_000 : 10_000 },
      workers: 1,
      retries: 0,
      timeout: 25 * 60 * 1000,
    },
  ],
});
