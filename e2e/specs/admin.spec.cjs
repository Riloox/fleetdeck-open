'use strict';

/*
 * The panel-wide admin surfaces: accounts, capability grants, the sign-in
 * switch, the audit trail, schedules, and the update centre.
 *
 * Everything here writes to the instance's own config or database, so each
 * mutating test takes a private panel.
 */

const { test, expect, en } = require('../support/fixtures.cjs');
const { toasts, dialog, appShell, userRow } = require('../support/pages.cjs');
const { signInFast, openView } = require('../support/actions.cjs');
const { client } = require('../support/api.cjs');

test.describe('users', () => {
  test('lists the accounts and marks which one is you', async ({ page, app }) => {
    await signInFast(page, app);
    await openView(page, 'minecraft', 'users');

    // Exact: the username is also a prefix of the seeded email address.
    await expect(page.getByText(app.admin.username, { exact: true })).toBeVisible();
    await expect(page.getByText(app.operator.username, { exact: true })).toBeVisible();
    await expect(userRow(page, app.admin.username).root).toContainText(en('users.youBadge'));
    await expect(userRow(page, app.admin.username).root).toContainText(en('users.roleAdmin'));
    await expect(userRow(page, app.operator.username).root).toContainText(en('users.roleOperator'));
  });

  test('adds an account', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await page.getByRole('button', { name: en('users.addUser') }).click();
    const form = dialog(page, en('users.addTitle'));
    await form.root.getByRole('textbox').nth(1).fill('newcomer');
    await form.root.locator('input[type="password"]').fill('Str0ngEnough!');
    await form.root.getByRole('button', { name: en('common.save') }).click();

    await expect(toasts(page).withText(en('users.createdToast'))).toBeVisible();
    await expect(page.getByText('newcomer')).toBeVisible();
    // New accounts are operators by default - least privilege.
    expect(panel.readConfig().users.find((u) => u.username === 'newcomer').role).toBe('operator');
  });

  test('refuses a password the policy will not accept', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await page.getByRole('button', { name: en('users.addUser') }).click();
    const form = dialog(page, en('users.addTitle'));
    await form.root.getByRole('textbox').nth(1).fill('weakling');
    await form.root.locator('input[type="password"]').fill('short');
    await form.root.getByRole('button', { name: en('common.save') }).click();

    await expect(form.root).toContainText('Password must be at least');
    expect(panel.readConfig().users.some((u) => u.username === 'weakling')).toBe(false);
  });

  test('refuses a username that is already taken', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await page.getByRole('button', { name: en('users.addUser') }).click();
    const form = dialog(page, en('users.addTitle'));
    await form.root.getByRole('textbox').nth(1).fill(panel.operator.username);
    await form.root.locator('input[type="password"]').fill('Str0ngEnough!');
    await form.root.getByRole('button', { name: en('common.save') }).click();

    await expect(form.root).toContainText(en('errors.usernameTaken'));
  });

  test('will not let you delete yourself', async ({ page, app }) => {
    await signInFast(page, app);
    await openView(page, 'minecraft', 'users');

    await expect(userRow(page, app.admin.username).root).toContainText(en('users.youBadge'));
    await expect(userRow(page, app.admin.username).remove).toBeDisabled();
  });

  test('deletes another account after confirming', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await userRow(page, panel.operator.username).remove.click();

    const confirm = dialog(page, en('users.deleteTitle'));
    await expect(confirm.root).toContainText(panel.operator.username);
    await confirm.root.getByRole('button', { name: en('common.delete') }).click();

    await expect(toasts(page).withText(en('users.deletedToast'))).toBeVisible();
    expect(panel.readConfig().users.some((u) => u.username === panel.operator.username)).toBe(false);
  });

  test('grants a capability to an operator and stores it', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await userRow(page, panel.operator.username).permissions.click();

    const grants = dialog(page, `Permissions for ${panel.operator.username}`);
    await expect(grants.root).toBeVisible();
    // Global capabilities are offered without a server; per-server ones are
    // grouped under the server they belong to. The dialog humanizes the
    // capability id, so audit.view is offered as "Audit View".
    await expect(grants.root).toContainText(en('users.globalPermissions'));
    await expect(grants.root).toContainText('Survival');
    await grants.root.getByText('Audit View', { exact: true }).click();
    await grants.root.getByRole('button', { name: en('common.save') }).click();

    await expect(toasts(page).withText(en('users.permissionsSaved'))).toBeVisible();

    // Read it back the way the panel would.
    const api = await client(panel);
    const operatorId = await api.userId(panel.operator.username);
    const { permissions } = await api.get(`/api/users/${operatorId}/permissions`);
    expect(permissions.grants).toContainEqual({ serverId: null, capability: 'audit.view' });
  });

  test('turning sign-in off asks first, then opens the panel to anyone', async ({ page, newApp }) => {
    const panel = await newApp();
    await signInFast(page, panel);
    await openView(page, 'minecraft', 'users', { origin: panel.url });

    await expect(page.getByRole('heading', { name: en('security.title') })).toBeVisible();
    // The sign-in toggle is a checkbox, currently ticked.
    const requireSignIn = page.getByRole('checkbox').last();
    await expect(requireSignIn).toBeChecked();
    await requireSignIn.click();

    const confirm = dialog(page, en('security.disableTitle'));
    await confirm.root.getByRole('button', { name: en('common.save') }).click();

    await expect(toasts(page).withText(en('security.disabledToast'))).toBeVisible();
    expect(panel.readConfig().requireAuth).toBe(false);
  });
});

test.describe('audit trail', () => {
  test('records what happened, and to whom', async ({ page, newApp }) => {
    const panel = await newApp();
    // Something worth auditing: a sign-in and a server registration.
    const api = await client(panel);
    await api.post('/api/servers', { name: 'Audited', dir: panel.server('Survival').dir, jar: 'server.jar' });

    await signInFast(page, panel);
    await openView(page, 'minecraft', 'audit', { origin: panel.url });

    await expect(page.getByText(en('audit.title'))).toBeVisible();
    await expect(page.getByText(panel.admin.username).first()).toBeVisible();
    await expect(page.getByText('auth.login').first()).toBeVisible();
  });

  test('is closed to an operator without the grant', async ({ page, app }) => {
    await signInFast(page, app, app.operator);
    await openView(page, 'minecraft', 'audit');

    // audit.view is global and ungranted here, so the view bounces.
    await expect(page).toHaveURL(/\/games\/minecraft\/dashboard$/);
  });
});

test.describe('schedules', () => {
  test('opens with nothing scheduled', async ({ page, app }) => {
    await signInFast(page, app);
    await openView(page, 'minecraft', 'tasks');

    await expect(page.getByRole('heading', { name: en('tasks.title') })).toBeVisible();
    await expect(page.getByText(en('tasks.empty'))).toBeVisible();
  });

  test('keeps a task it was given', async ({ page, newApp }) => {
    const panel = await newApp();
    const api = await client(panel);
    await api.post('/api/tasks', {
      serverId: panel.server('Survival').id,
      name: 'Nightly restart',
      action: 'restart',
      cron: '0 4 * * *',
      enabled: true,
    });

    await signInFast(page, panel);
    await openView(page, 'minecraft', 'tasks', { origin: panel.url });

    await expect(page.getByText('Nightly restart')).toBeVisible();
    await expect(page.getByText('0 4 * * *')).toBeVisible();
  });
});

test.describe('updates', () => {
  test('offers the update centre for a game that has one', async ({ page, app }) => {
    await signInFast(page, app);
    await openView(page, 'minecraft', 'updates');

    await expect(page.getByText(en('updates.title'))).toBeVisible();
  });

  test('is not offered for a game with no update path', async ({ page, app }) => {
    await signInFast(page, app);
    // The custom module declares no `updates` capability.
    await openView(page, 'custom', 'updates');

    await expect(page).toHaveURL(/\/games\/custom\/dashboard$/);
    await expect(appShell(page).navItem('updates')).toHaveCount(0);
  });
});
