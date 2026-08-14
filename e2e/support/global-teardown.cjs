'use strict';

/*
 * The last net under the tests.
 *
 * Fixtures remove their own panels, and an install test removes what it
 * downloaded - but neither runs when a worker is killed outright, which is
 * exactly the case that leaves a directory (and, for an install run, possibly
 * gigabytes) in the OS temp folder. This sweeps anything from this run that
 * is still there.
 *
 * It reports what it removed rather than doing it silently: a directory
 * surviving to this point means some teardown did not run, and that is worth
 * seeing.
 */

const { sweepInstanceDirs } = require('./instance.cjs');

module.exports = function globalTeardown() {
  const removed = sweepInstanceDirs();
  if (removed.length) {
    console.log([
      '',
      `[e2e] swept ${removed.length} instance director${removed.length === 1 ? 'y' : 'ies'} that outlived its test:`,
      ...removed.map((target) => `[e2e]   ${target}`),
      '',
    ].join('\n'));
  }
};
