'use strict';

/*
 * What the panel does with the first paint: which screen a visitor gets,
 * where a URL puts them, what a returning user resumes into, and which
 * language they are greeted in.
 */

const { test, expect, en, es } = require('../support/fixtures.cjs');
const { loginScreen, gamesHub, appShell } = require('../support/pages.cjs');
const { submitLogin, signIn, enterGame } = require('../support/actions.cjs');

test.describe('boot', () => {
  test('opens the games hub, not a game, on a bare URL', async ({ page, app }) => {
    await signIn(page, { identifier: app.admin.username, password: app.admin.password });

    // A signed-in visitor with nothing remembered gets the picker. Landing in
    // some default game instead is the bug this pins down.
    await expect(page).toHaveURL(/\/games$/);
    await expect(gamesHub(page).carousel).toBeVisible();
  });

  test('collapses an unknown path to the hub', async ({ page, app }) => {
    await signIn(page, { identifier: app.admin.username, password: app.admin.password });

    await page.goto('/not-a-real-page');

    await expect(page).toHaveURL(/\/games$/);
    await expect(gamesHub(page).carousel).toBeVisible();
  });

  test('resumes the last game and view on the next visit', async ({ page, app }) => {
    await signIn(page, { identifier: app.admin.username, password: app.admin.password });
    await enterGame(page, 'minecraft');

    await appShell(page).navItem('servers').click();
    await expect(page).toHaveURL(/\/games\/minecraft\/servers$/);

    // Come back to a URL that names nothing at all.
    await page.goto('/');

    await expect(page).toHaveURL(/\/games\/minecraft\/servers$/);
    await expect(appShell(page).header).toBeVisible();
  });

  test('drops a deep link taken before sign-in', async ({ page, app }) => {
    await page.goto('/games/minecraft/dashboard');

    // Signed out, any path is the sign-in screen.
    await expect(loginScreen(page).heading).toBeVisible();

    await submitLogin(page, { identifier: app.admin.username, password: app.admin.password });

    // Signing in hands over to the hub rather than the link that was asked
    // for. Worth knowing about: it is the current behaviour, not an accident
    // of this test.
    await expect(page).toHaveURL(/\/games$/);
    await expect(gamesHub(page).carousel).toBeVisible();
  });

  test('skips sign-in entirely when the panel has it switched off', async ({ page, newApp }) => {
    const guestPanel = await newApp({ requireAuth: false });

    await page.goto(`${guestPanel.url}/`);

    // Straight into the panel, with no login screen flashing on the way.
    await expect(gamesHub(page).carousel).toBeVisible();
    await expect(loginScreen(page).heading).toBeHidden();

    await enterGame(page, 'minecraft');
    const shell = appShell(page);
    await shell.profileButton.click();

    // A guest has no session to end, so the menu offers no way out - only
    // settings.
    await expect(shell.menuSettings).toBeVisible();
    await expect(shell.menuLogout).toHaveCount(0);
    await expect(page.getByText(en('security.guestDesc'))).toBeVisible();
  });

  test.describe('pre-sign-in language', () => {
    // Let the panel choose the language instead of pinning English.
    test.use({ uiLanguage: null });

    test('follows the panel-wide DEFAULT_LANGUAGE', async ({ page, newApp }) => {
      const spanishPanel = await newApp({ env: { DEFAULT_LANGUAGE: 'es' } });

      await page.goto(`${spanishPanel.url}/`);

      await expect(page.getByRole('heading', { name: es('login.heading') })).toBeVisible();
      await expect(page.getByRole('button', { name: es('login.submit'), exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    });
  });
});
