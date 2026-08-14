'use strict';

/*
 * What a view shows while it waits.
 *
 * The panel used to draw skeletons - grey blocks shaped like the rows that had
 * not arrived - which read as a broken screen whenever the request was slower
 * than a blink. There is now one spinner instead, and these tests pin that: no
 * ghost content anywhere, and the spinner clears when the data lands.
 *
 * Each test holds one API response open so the loading state is a stable thing
 * to assert on rather than a frame between two renders.
 */

const { test, expect, en } = require('../support/fixtures.cjs');
const { loadingSpinner } = require('../support/pages.cjs');
const { signInFast, openView } = require('../support/actions.cjs');

/*
 * Hold every response matching `pattern` until the returned release() is
 * called. The handler is installed before the navigation that triggers the
 * request, and every test releases it - a route left held would keep the page
 * open past the end of the test.
 */
async function stall(page, pattern) {
  let open;
  const held = new Promise((resolve) => { open = resolve; });
  await page.route(pattern, async (route) => {
    await held;
    await route.continue();
  });
  return open;
}

test.describe('loading states', () => {
  test('the file manager spins while the listing is in flight', async ({ page, app }) => {
    await signInFast(page, app);
    const release = await stall(page, '**/api/files?**');
    await openView(page, 'minecraft', 'files');

    const spinner = loadingSpinner(page);
    await expect(spinner).toBeVisible();
    // The label is drawn for screen readers only, so it is asserted on the
    // element's text rather than on what a sighted user can see.
    await expect(spinner).toContainText(en('common.loading'));

    release();
    await expect(spinner).toBeHidden();
    await expect(page.getByText('server.properties')).toBeVisible();
  });

  test('the waiting view shows no ghost of the rows it is fetching', async ({ page, app }) => {
    await signInFast(page, app);
    const release = await stall(page, '**/api/files?**');
    await openView(page, 'minecraft', 'files');

    await expect(loadingSpinner(page)).toBeVisible();
    // The skeletons were pulsing blocks of `bg-muted`. The only survivors of
    // that class in the panel are progress bars, and none is on this screen.
    await expect(page.locator('.animate-pulse')).toHaveCount(0);

    release();
  });

  test('the audit log spins before its first page arrives', async ({ page, app }) => {
    await signInFast(page, app);
    const release = await stall(page, '**/api/audit?**');
    await openView(page, 'minecraft', 'audit');

    const spinner = loadingSpinner(page);
    await expect(spinner).toBeVisible();

    release();
    await expect(spinner).toBeHidden();
  });
});
