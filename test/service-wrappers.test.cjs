'use strict';

/*
 * Validate the OS-service wrappers (scripts/install-service.cjs) by inspecting
 * the generated systemd unit and the schtasks command shape. Nothing here
 * executes a service installer: the generators are pure string/argv builders
 * so the test pins exactly what would be written or run.
 */

const assert = require('assert');
const path = require('path');
const {
  DEFAULT_NAME,
  serviceName,
  parseArgs,
  detectInstallDir,
  resolveNodePath,
  systemdUnit,
  schtasksCreateCommand,
  schtasksDeleteCommand,
} = require('../scripts/install-service.cjs');

const tests = [];

// 1. The default name sanitizes into a valid unit/task name.
tests.push(() => {
  assert.strictEqual(serviceName('fleetdeck'), 'fleetdeck');
  assert.strictEqual(serviceName('my panel/1'), 'my panel-1');
  assert.strictEqual(serviceName(''), DEFAULT_NAME);
});

// 2. The install dir is detected from the script location, not CWD.
tests.push(() => {
  assert.strictEqual(detectInstallDir(), path.resolve(__dirname, '..'));
});

// 3. The systemd unit runs node server.js with the right working directory,
//    restarts on failure, and installs to multi-user.target.
tests.push(() => {
  const unit = systemdUnit({
    name: 'fleetdeck',
    installDir: '/opt/fleetdeck',
    nodePath: '/usr/bin/node',
    configPath: '',
  });
  assert.ok(unit.includes('WorkingDirectory=/opt/fleetdeck'), 'unit must pin the working directory');
  assert.ok(unit.includes('ExecStart=/usr/bin/node /opt/fleetdeck/server.js'), 'unit must run node server.js');
  assert.ok(unit.includes('Restart=on-failure'), 'unit must restart on failure');
  assert.ok(unit.includes('WantedBy=multi-user.target'), 'unit must enable for boot');
  assert.ok(unit.includes('[Service]') && unit.includes('[Install]'), 'unit must carry both sections');
});

// 4. A --user lands as User=/Group= so the panel does not run as root.
tests.push(() => {
  const unit = systemdUnit({
    name: 'fleetdeck',
    user: 'fleetdeck',
    installDir: '/opt/fleetdeck',
    nodePath: '/usr/bin/node',
    configPath: '',
  });
  assert.ok(unit.includes('User=fleetdeck\nGroup=fleetdeck'), 'unit must run as the requested user');
});

// 5. FLEETDECK_CONFIG is forwarded when the environment sets it.
tests.push(() => {
  const unit = systemdUnit({
    name: 'fleetdeck',
    installDir: '/opt/fleetdeck',
    nodePath: '/usr/bin/node',
    configPath: '/etc/fleetdeck/config.json',
  });
  assert.ok(unit.includes('Environment=FLEETDECK_CONFIG=/etc/fleetdeck/config.json'), 'unit must forward FLEETDECK_CONFIG');
});

// 6. The schtasks create command runs node server.js from the install dir and
//    registers a logon task, with the env var forwarded when configured.
tests.push(() => {
  const { name, args } = schtasksCreateCommand({
    name: 'fleetdeck',
    installDir: 'C:\\fleetdeck',
    nodePath: 'C:\\node\\node.exe',
    configPath: '',
  });
  assert.strictEqual(name, 'fleetdeck');
  const join = args.join(' ');
  assert.ok(join.includes('/Create /F'), 'create command must force-create');
  assert.ok(join.includes('/SC ONLOGON'), 'windows autostart must be a logon task');
  assert.ok(join.includes('/TN fleetdeck'), 'create command must name the task');
  assert.ok(join.includes('/TR '), 'create command must carry the run line');
  const tr = args[args.indexOf('/TR') + 1];
  assert.ok(tr.includes('cd /d "C:\\fleetdeck"'), 'run line must cd to the install dir');
  assert.ok(tr.includes('"C:\\node\\node.exe" "C:\\fleetdeck\\server.js"'), 'run line must launch node server.js');
});

tests.push(() => {
  const { name, args } = schtasksCreateCommand({
    name: 'fleetdeck',
    installDir: 'C:\\fleetdeck',
    nodePath: 'C:\\node\\node.exe',
    configPath: 'C:\\fleetdeck\\config.json',
  });
  const tr = args[args.indexOf('/TR') + 1];
  assert.ok(tr.includes('set "FLEETDECK_CONFIG=C:\\fleetdeck\\config.json"'), 'run line must forward FLEETDECK_CONFIG');
});

// 7. The delete command only names the task; it touches nothing else.
tests.push(() => {
  const { name, args } = schtasksDeleteCommand({ name: 'fleetdeck' });
  assert.strictEqual(name, 'fleetdeck');
  assert.deepStrictEqual(args, ['/Delete', '/F', '/TN', 'fleetdeck']);
});

// 8. The CLI parses --name and --user without touching anything.
tests.push(() => {
  assert.deepStrictEqual(parseArgs(['--name', 'panel', '--user', 'jane']), { name: 'panel', user: 'jane' });
  assert.strictEqual(parseArgs([]).name, DEFAULT_NAME);
  assert.strictEqual(parseArgs(['--help']).help, true);
});

// 9. resolveNodePath returns a real Node executable for the unit's ExecStart.
tests.push(() => {
  assert.ok(resolveNodePath().length > 0, 'a node path must be resolvable');
});

let failed = 0;
for (let i = 0; i < tests.length; i++) {
  try { tests[i](); console.log(`ok  service-wrapper test ${i + 1}`); }
  catch (e) { failed++; console.error(`FAIL  service-wrapper test ${i + 1}: ${e.message}\n${e.stack}`); }
}
if (failed) { console.error(`FAIL  ${failed} service-wrapper test(s) failed`); process.exit(1); }
console.log('PASS  service-wrappers');
