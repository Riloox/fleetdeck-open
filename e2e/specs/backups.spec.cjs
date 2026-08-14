'use strict';

/*
 * Backups. Creating one really archives the seeded server folder into the
 * instance's temp backup directory, so the assertions can look at the zip on
 * disk as well as the row on screen.
 */

const fs = require('fs');
const { test, expect, en } = require('../support/fixtures.cjs');
const { toasts, dialog } = require('../support/pages.cjs');
const { signInFast, openView } = require('../support/actions.cjs');

const backupRows = (page) => page.getByRole('row').filter({ hasText: '.zip' });

test.describe('backups', () => {
  test('starts empty and says so', async ({ page, app }) => {
    await signInFast(page, app);
    await openView(page, 'minecraft', 'backups');

    await expect(page.getByText(en('backups.empty'))).toBeVisible();
  });

  test('creates a backup of the server folder', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'backups', { origin: panel.url });

    await page.getByRole('button', { name: en('backups.backupNow') }).click();

    await expect(toasts(page).withText(en('backups.createdToast'))).toBeVisible();
    await expect(backupRows(page)).toHaveCount(1);

    // A real archive, in the configured backup directory.
    const written = fs.readdirSync(panel.dirs.backups, { recursive: true })
      .filter((name) => String(name).endsWith('.zip'));
    expect(written.length).toBe(1);
  });

  test('verifies a backup it just made', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'backups', { origin: panel.url });

    await page.getByRole('button', { name: en('backups.backupNow') }).click();
    await expect(backupRows(page)).toHaveCount(1);

    await backupRows(page).first().getByTitle(en('backups.verify')).click();

    await expect(toasts(page).withText(en('backups.verifiedToast'))).toBeVisible();
    await expect(backupRows(page).first()).toContainText(en('backups.verified'));
  });

  test('lists what is inside a backup', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'backups', { origin: panel.url });

    await page.getByRole('button', { name: en('backups.backupNow') }).click();
    await expect(backupRows(page)).toHaveCount(1);

    await backupRows(page).first().getByTitle(en('backups.contents')).click();

    const contents = dialog(page, en('backups.contents'));
    await expect(contents.root).toBeVisible();
    // The seeded world went into the archive.
    await expect(contents.root).toContainText('world');
  });

  test('deletes a backup, but asks first', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'backups', { origin: panel.url });

    await page.getByRole('button', { name: en('backups.backupNow') }).click();
    await expect(backupRows(page)).toHaveCount(1);

    await backupRows(page).first().getByRole('button').last().click();
    const confirm = dialog(page, en('backups.deleteTitle'));
    await confirm.root.getByRole('button', { name: en('common.delete') }).click();

    await expect(toasts(page).withText(en('backups.deletedToast'))).toBeVisible();
    await expect(page.getByText(en('backups.empty'))).toBeVisible();
    expect(fs.readdirSync(panel.dirs.backups, { recursive: true })
      .filter((name) => String(name).endsWith('.zip')).length).toBe(0);
  });

  test('keeps the retention limits it is given', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'backups', { origin: panel.url });

    const retention = page.getByText(en('backups.retentionTitle')).first();
    await expect(retention).toBeVisible();

    const maxCount = page.locator('input[type="number"]').first();
    await maxCount.fill('3');
    await page.getByRole('button', { name: en('common.save') }).first().click();

    await expect(toasts(page).withText(en('backups.savedToast'))).toBeVisible();
    expect(panel.readConfig().backups.maxCount).toBe(3);
  });
});
