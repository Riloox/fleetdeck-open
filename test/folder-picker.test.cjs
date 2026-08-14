'use strict';

/*
 * The folder picker module: the one-at-a-time guard, the per-platform result
 * handling, and the Windows DLL-cache script shape. The native dialogs
 * themselves cannot run here, so every spawn is injected; the Windows compile
 * path is pinned by the shape of the script it produces rather than by running
 * PowerShell.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const {
  pickFolder,
  PICKER_BUSY,
  PICKER_UNAVAILABLE,
  PICKER_TIMEOUT,
  buildWindowsScript,
  buildWindowsLegacyScript,
  cacheDllPath,
  psQuote,
  __resetInFlight,
} = require('../lib/folderPicker.cjs');

const tick = () => new Promise((resolve) => setImmediate(resolve));

// A spawn stand-in that records every invocation and lets the test resolve each
// child by hand, mirroring the real contract: stdout/stderr drain before
// 'close', and 'error' fires instead of 'close' when the command never starts.
function makeFakeSpawn() {
  const spawned = [];
  function fakeSpawn(cmd, args) {
    const child = new EventEmitter();
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.killed = false;
    child.kill = () => { child.killed = true; return true; };
    spawned.push({ child, cmd, args });
    return child;
  }
  async function close(index, code, stdout) {
    const { child } = spawned[index];
    if (stdout !== undefined) child.stdout.push(stdout);
    child.stdout.push(null);
    child.stderr.push(null);
    await tick(); // let the 'data' events drain, like a real child close
    child.emit('close', code);
  }
  function error(index, err) {
    spawned[index].child.emit('error', err);
  }
  return { fakeSpawn, spawned, close, error };
}

test('refuses a second picker while one is open, then releases the guard', async () => {
  __resetInFlight();
  const { fakeSpawn, spawned, close } = makeFakeSpawn();

  const first = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });
  await tick();
  assert.strictEqual(spawned.length, 1, 'the first dialog is open');

  await assert.rejects(
    pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn }),
    (err) => err.code === PICKER_BUSY,
  );
  assert.strictEqual(spawned.length, 1, 'no second dialog was opened');

  await close(0, 0, '/home/user/server\n');
  assert.deepStrictEqual(await first, { path: '/home/user/server' });

  const third = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });
  await tick();
  assert.strictEqual(spawned.length, 2, 'the guard released once the dialog closed');
  await close(1, 2, '');
  assert.deepStrictEqual(await third, { cancelled: true });
});

test('returns the chosen path on success and cancels when the user dismisses it', async () => {
  __resetInFlight();
  const { fakeSpawn, spawned, close } = makeFakeSpawn();

  const picked = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });
  await tick();
  await close(0, 0, '/srv/games\n');
  assert.deepStrictEqual(await picked, { path: '/srv/games' });

  const cancelled = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });
  await tick();
  assert.strictEqual(spawned.length, 2);
  await close(1, 2, '');
  assert.deepStrictEqual(await cancelled, { cancelled: true });
});

test('an empty selection with exit 0 is a cancel, not a broken path', async () => {
  __resetInFlight();
  const { fakeSpawn, close } = makeFakeSpawn();
  const p = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });
  await tick();
  await close(0, 0, '');
  assert.deepStrictEqual(await p, { cancelled: true });
});

test('reports unavailable when no chooser command exists', async () => {
  __resetInFlight();
  const { fakeSpawn, spawned, error } = makeFakeSpawn();
  const pending = pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn });

  // zenity, then kdialog, then the python3/tkinter fallback all ENOENT.
  await tick();
  assert.strictEqual(spawned.length, 1);
  error(0, Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' }));
  await tick();
  assert.strictEqual(spawned.length, 2);
  error(1, Object.assign(new Error('spawn kdialog ENOENT'), { code: 'ENOENT' }));
  await tick();
  assert.strictEqual(spawned.length, 3);
  error(2, Object.assign(new Error('spawn python3 ENOENT'), { code: 'ENOENT' }));

  await assert.rejects(pending, (err) => err.code === PICKER_UNAVAILABLE);
});

test('Windows falls back to the legacy dialog when the modern one errors', async () => {
  __resetInFlight();
  const { fakeSpawn, spawned, close } = makeFakeSpawn();
  const p = pickFolder('', 't', { platform: 'win32', spawn: fakeSpawn });

  await tick();
  assert.strictEqual(spawned.length, 1);
  assert.strictEqual(spawned[0].cmd, 'powershell.exe');

  await close(0, 1, ''); // modern IFileOpenDialog failed -> legacy fallback
  await tick();
  assert.strictEqual(spawned.length, 2, 'legacy dialog opened');
  assert.strictEqual(spawned[1].cmd, 'powershell.exe');

  await close(1, 0, 'C:\\servers\n');
  assert.deepStrictEqual(await p, { path: 'C:\\servers' });
});

test('the modern dialog DLL is cached at a stable, source-hashed path', () => {
  assert.strictEqual(cacheDllPath(), cacheDllPath());
  assert.match(cacheDllPath(), /ModernFolderDialog-[0-9a-f]{12}\.dll$/);
});

test('the Windows script compiles once to the cache and reuses it afterwards', () => {
  const dll = cacheDllPath();
  const script = buildWindowsScript({ dll, title: 'Pick a folder', defaultPath: '' });

  // First run compiles the C# into the cache...
  assert.match(script, /Add-Type -TypeDefinition \$src -Language CSharp -OutputAssembly/);
  // ...and later runs load the cached assembly instead of recompiling it.
  assert.match(script, /Test-Path -LiteralPath/);
  assert.match(script, /Add-Type -Path \$run/);
  assert.ok(script.includes(psQuote(dll)), 'the cached DLL path is the one checked');
});

test('the Windows script is deterministic, so the cache hash stays stable', () => {
  const options = { dll: cacheDllPath(), title: 'Pick', defaultPath: 'C:\\x' };
  assert.strictEqual(
    buildWindowsScript(options),
    buildWindowsScript({ ...options }),
  );
});

/*
 * The first pick on a machine is the one that compiles the helper, and it was
 * also the one that never opened a dialog: `Add-Type -OutputAssembly` writes
 * the DLL but does not load the type into the session, so the compile run fell
 * straight through to "Unable to find type [ModernFolderDialog]". Loading has
 * to happen on both runs, not only on the cached one.
 */
test('the run that compiles the helper also loads it, so the first pick opens a dialog', () => {
  const script = buildWindowsScript({ dll: cacheDllPath(), title: 'Pick', defaultPath: '' });

  const compileAt = script.indexOf('-OutputAssembly');
  const loadAt = script.indexOf('Add-Type -Path $run');
  const pickAt = script.indexOf('[ModernFolderDialog]::Pick');

  assert.ok(compileAt > -1, 'a missing cache still compiles the helper');
  assert.ok(loadAt > compileAt, 'the assembly is loaded after the compile branch, not inside its else');
  assert.ok(pickAt > loadAt, 'the type is loaded before it is used');
  // The compile is still conditional: a warm cache must not recompile.
  assert.match(script, /if \(-not \(Test-Path -LiteralPath/);
});

/*
 * Cancelling is not an error and not a path. The sentinel used to be caught by
 * the success branch ahead of its own test, so pressing Cancel printed
 * `__CANCELLED__` on stdout with exit 0 and the panel answered
 * "Picked path is not a folder: __CANCELLED__".
 */
test('a cancelled dialog exits 2 and never writes the sentinel to stdout', () => {
  const script = buildWindowsScript({ dll: cacheDllPath(), title: 'Pick', defaultPath: '' });

  const cancelAt = script.indexOf("$p -eq '__CANCELLED__'");
  const printAt = script.indexOf('[Console]::Out.WriteLine($p)');

  assert.ok(cancelAt > -1, 'cancellation is tested for');
  assert.ok(cancelAt < printAt, 'cancellation is decided before anything reaches stdout');
});

/*
 * The legacy fallback is the one that hung: spawned windowless, its dialog was
 * created but never came to the front, so the request never returned. It gets
 * an off-screen top-most owner so the dialog cannot end up behind the panel.
 */
test('the legacy dialog is owned by a top-most window so it cannot open behind the panel', () => {
  const script = buildWindowsLegacyScript({ title: 'Pick', defaultPath: '' });

  assert.match(script, /TopMost = \$true/);
  assert.match(script, /ShowDialog\(\$owner\)/);
  assert.match(script, /ShowInTaskbar = \$false/);
});

/*
 * Whatever goes wrong at the OS end, the guard must come back: a dialog that
 * never returns used to leave `inFlight` true for the life of the process, so
 * every later Browse anywhere in the panel answered 409 and its button stayed
 * disabled for good.
 */
test('a dialog that never returns is killed, and the guard is released', async () => {
  __resetInFlight();
  const { fakeSpawn, spawned } = makeFakeSpawn();

  // The picker's timeout timer is unref'd on purpose (a wedged dialog must
  // never delay panel shutdown), so it only fires while something else keeps
  // the event loop alive. The fake spawn never emits anything, so this 5ms
  // timer is the only handle pending - on a quiet runner the loop drains
  // before it lands and node:test cancels the test as unresolved. Hold the
  // loop open explicitly for the duration of the test.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(
      pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn, timeoutMs: 5 }),
      (err) => err.code === PICKER_TIMEOUT,
    );
    assert.strictEqual(spawned[0].child.killed, true, 'the wedged dialog process was killed');

    // The next pick is allowed through instead of inheriting a stuck guard;
    // it too times out (nothing will ever answer the fake spawn).
    await assert.rejects(
      pickFolder('', 't', { platform: 'linux', spawn: fakeSpawn, timeoutMs: 5 }),
      (err) => err.code === PICKER_TIMEOUT,
    );
    assert.strictEqual(spawned.length, 2, 'the guard released after the timeout');
  } finally {
    clearInterval(keepAlive);
    __resetInFlight();
  }
});

test('psQuote escapes quotes but nothing else, keeping injected paths literal', () => {
  assert.strictEqual(psQuote("C:\\a$b`c'd"), "'C:\\a$b`c''d'");
});
