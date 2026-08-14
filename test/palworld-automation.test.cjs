'use strict';

const assert = require('assert');
const automation = require('../lib/palworld-automation.cjs');

const MINUTE = 60_000;

function online(extra = {}) {
  return { status: 'online', healthy: true, playerCount: 0, startedAt: 0, ...extra };
}

// ---------------------------------------------------------------------------
// Migration: existing cron tasks keep their behaviour
// ---------------------------------------------------------------------------

function testMigration() {
  const legacy = { id: 'a', serverId: 's1', name: 'nightly', type: 'restart', cron: '0 4 * * *', enabled: true };
  const migrated = automation.migrateTask(legacy);
  assert.strictEqual(migrated.version, 2);
  assert.deepStrictEqual(migrated.trigger, { kind: 'cron', expression: '0 4 * * *' });
  assert.deepStrictEqual(migrated.action, { kind: 'restart' });
  assert.strictEqual(migrated.cron, '0 4 * * *');
  assert.strictEqual(migrated.type, 'restart');

  const command = automation.migrateTask({ type: 'command', command: 'say hi', cron: '*/5 * * * *' });
  assert.deepStrictEqual(command.action, { kind: 'command', command: 'say hi' });

  const normalized = automation.normalizeTask(legacy, { serverType: 'minecraft', validateCron: () => true });
  assert.strictEqual(normalized.value.cron, '0 4 * * *');
  assert.strictEqual(normalized.value.type, 'restart');
  assert.strictEqual(normalized.value.trigger.kind, 'cron');
  // Re-normalizing a versioned task is a no-op.
  const again = automation.normalizeTask(normalized.value, { serverType: 'minecraft', validateCron: () => true });
  assert.deepStrictEqual(again.value.trigger, normalized.value.trigger);
  assert.deepStrictEqual(again.value.action, normalized.value.action);

  // Palworld actions/triggers are rejected on other games, and Palworld never
  // gets a raw console command.
  assert.strictEqual(
    automation.normalizeTask({ trigger: { kind: 'cron', expression: '0 4 * * *' }, action: { kind: 'announce', message: 'hi' }, version: 2 },
      { serverType: 'minecraft', validateCron: () => true }).error,
    'errors.palworldActionOnly',
  );
  assert.strictEqual(
    automation.normalizeTask({ version: 2, trigger: { kind: 'cron', expression: '0 4 * * *' }, action: { kind: 'command', command: 'save' } },
      { serverType: 'palworld', validateCron: () => true }).error,
    'errors.palworldUseAdapter',
  );
  assert.strictEqual(
    automation.normalizeTask({ version: 2, trigger: { kind: 'interval', minutes: 1 }, action: { kind: 'restart' } },
      { serverType: 'palworld', validateCron: () => true }).error,
    'errors.intervalTooShort',
  );
  assert.strictEqual(automation.capabilityForAction({ kind: 'apply-update-policy' }), 'updates.apply');
  assert.strictEqual(automation.capabilityForAction('announce'), 'announcements.send');
}

// ---------------------------------------------------------------------------
// Stop when empty
// ---------------------------------------------------------------------------

function testEmptyCountdown() {
  const policy = { minimumEmptyMinutes: 10, graceSeconds: 60, minimumUptimeMinutes: 0 };
  const start = Date.UTC(2026, 0, 10, 12, 0, 0);

  let step = automation.emptyDecision({ policy, state: null, observation: online(), now: start });
  assert.strictEqual(step.action, 'none');
  assert.strictEqual(step.reason, 'counting');

  // REST uncertainty pauses the countdown: five unknown minutes never count.
  step = automation.emptyDecision({ policy, state: step.state, observation: online({ healthy: false, playerCount: null }), now: start + 5 * MINUTE });
  assert.strictEqual(step.reason, 'rest_uncertain');
  step = automation.emptyDecision({ policy, state: step.state, observation: online(), now: start + 10 * MINUTE });
  assert.strictEqual(step.reason, 'counting', 'paused time must not count as empty');

  // Ten *observed* empty minutes: the grace announcement fires once.
  step = automation.emptyDecision({ policy, state: step.state, observation: online(), now: start + 15 * MINUTE });
  assert.strictEqual(step.action, 'announce');
  assert.ok(step.message.includes('60'));
  const announced = step.state;
  const repeat = automation.emptyDecision({ policy, state: announced, observation: online(), now: start + 15 * MINUTE + 1000 });
  assert.strictEqual(repeat.action, 'none', 'the grace announcement is not repeated');

  // A player joining during the grace period cancels the pending shutdown.
  const cancelled = automation.emptyDecision({ policy, state: announced, observation: online({ playerCount: 1 }), now: start + 15 * MINUTE + 30_000 });
  assert.strictEqual(cancelled.action, 'none');
  assert.strictEqual(cancelled.reason, 'player_online');
  assert.strictEqual(cancelled.state.pendingStopAt, null);
  assert.strictEqual(cancelled.state.cancelledReason, 'player_online');

  // Otherwise the stop happens when the grace expires.
  const stopped = automation.emptyDecision({ policy, state: announced, observation: online(), now: start + 16 * MINUTE + 1000 });
  assert.strictEqual(stopped.action, 'stop');

  // A restart resets everything, and minimum uptime holds the countdown back.
  const offline = automation.emptyDecision({ policy, state: announced, observation: { status: 'offline', healthy: false }, now: start + 16 * MINUTE });
  assert.strictEqual(offline.state.emptySince, null);
  const young = automation.emptyDecision({
    policy: { ...policy, minimumUptimeMinutes: 30 },
    state: null,
    observation: online({ startedAt: start }),
    now: start + MINUTE,
  });
  assert.strictEqual(young.reason, 'minimum_uptime');

  // Outside an active window the countdown pauses rather than progressing.
  const windowed = { ...policy, windows: [{ start: '02:00', end: '04:00' }] };
  const local = new Date(2026, 0, 10, 12, 0, 0).getTime();
  const paused = automation.emptyDecision({ policy: windowed, state: null, observation: online(), now: local });
  assert.strictEqual(paused.reason, 'outside_window');

  // Manual sessions can be excluded from automatic shutdown.
  const manual = automation.emptyDecision({
    policy: { ...policy, sessions: 'automatic' },
    state: null,
    observation: online({ sessionOrigin: 'manual' }),
    now: start,
  });
  assert.strictEqual(manual.reason, 'session_excluded');
}

// ---------------------------------------------------------------------------
// Join trigger
// ---------------------------------------------------------------------------

function testJoinTrigger() {
  const trigger = { kind: 'player-joined', playerId: null, delaySeconds: 30, cooldownMinutes: 60 };
  const action = { kind: 'announce', message: 'Welcome {player}!' };
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);
  const observe = (players, extra = {}) => ({ status: 'online', healthy: true, players, ...extra });

  // First observation after a panel start is a baseline, not a wave of joins.
  let step = automation.joinDecision({ trigger, action, state: null, observation: observe([{ userId: 'u1', name: 'Ana' }]), now });
  assert.strictEqual(step.reason, 'baseline');
  assert.deepStrictEqual(step.due, []);

  // A real join schedules a delayed message; duplicates do not re-schedule.
  step = automation.joinDecision({ trigger, action, state: step.state, observation: observe([{ userId: 'u1', name: 'Ana' }, { userId: 'u2', name: 'Bo' }]), now: now + 1000 });
  assert.deepStrictEqual(step.due, []);
  assert.strictEqual(step.state.pending.length, 1);
  assert.strictEqual(step.state.pending[0].message, 'Welcome Bo!');
  const duplicate = automation.joinDecision({ trigger, action, state: step.state, observation: observe([{ userId: 'u1', name: 'Ana' }, { userId: 'u2', name: 'Bo' }]), now: now + 2000 });
  assert.strictEqual(duplicate.state.pending.length, 1);

  // REST uncertainty is neither a join nor a departure.
  const uncertain = automation.joinDecision({ trigger, action, state: step.state, observation: { status: 'online', healthy: false }, now: now + 3000 });
  assert.deepStrictEqual(uncertain.cancelled, []);
  assert.strictEqual(uncertain.state.pending.length, 1);

  // Leaving before the delay elapses cancels the message.
  const left = automation.joinDecision({ trigger, action, state: step.state, observation: observe([{ userId: 'u1', name: 'Ana' }]), now: now + 5000 });
  assert.strictEqual(left.cancelled.length, 1);
  assert.strictEqual(left.cancelled[0].reason, 'player_left');
  assert.strictEqual(left.state.pending.length, 0);

  // Staying long enough delivers it exactly once.
  const delivered = automation.joinDecision({ trigger, action, state: step.state, observation: observe([{ userId: 'u1', name: 'Ana' }, { userId: 'u2', name: 'Bo' }]), now: now + 40_000 });
  assert.strictEqual(delivered.due.length, 1);
  assert.strictEqual(delivered.due[0].message, 'Welcome Bo!');
  assert.strictEqual(delivered.state.pending.length, 0);

  // Rejoining inside the cooldown does not fire again.
  const gone = automation.joinDecision({ trigger, action, state: delivered.state, observation: observe([{ userId: 'u1', name: 'Ana' }]), now: now + 60_000 });
  const rejoined = automation.joinDecision({ trigger, action, state: gone.state, observation: observe([{ userId: 'u1', name: 'Ana' }, { userId: 'u2', name: 'Bo' }]), now: now + 70_000 });
  assert.strictEqual(rejoined.state.pending.length, 0);

  // A server stop cancels pending messages and clears the baseline, so a
  // panel reboot cannot deliver stale greetings.
  const stopped = automation.joinDecision({ trigger, action, state: step.state, observation: { status: 'offline', healthy: false }, now: now + 6000 });
  assert.strictEqual(stopped.cancelled[0].reason, 'server_offline');
  assert.strictEqual(stopped.state.present, null);
  const afterReboot = automation.joinDecision({ trigger, action, state: stopped.state, observation: observe([{ userId: 'u2', name: 'Bo' }]), now: now + 7000 });
  assert.strictEqual(afterReboot.reason, 'baseline');
  assert.deepStrictEqual(afterReboot.due, []);

  // Only `{player}` expands, and a hostile name cannot expand again.
  assert.strictEqual(automation.renderTemplate('Hi {player} {other}', { player: '{player}' }), 'Hi {player} {other}');

  // A trigger scoped to one identity ignores everybody else.
  const scoped = automation.joinDecision({
    trigger: { ...trigger, playerId: 'u3', delaySeconds: 0 },
    action,
    state: { present: ['u1'], cooldowns: {}, pending: [] },
    observation: observe([{ userId: 'u1', name: 'Ana' }, { userId: 'u2', name: 'Bo' }]),
    now,
  });
  assert.deepStrictEqual(scoped.due, []);
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

function testBackups() {
  const now = Date.UTC(2026, 0, 10, 4, 0, 0);
  const skip = automation.backupDecision({ action: { kind: 'backup', offlineMode: 'skip' }, state: null, observation: { status: 'offline' }, now });
  assert.strictEqual(skip.action, 'skip');
  assert.strictEqual(skip.reason, 'offline_skipped');
  assert.strictEqual(skip.state.missed, false);
  assert.strictEqual(skip.state.lastSkipAt, now);

  const deferred = automation.backupDecision({ action: { kind: 'backup', offlineMode: 'catch-up' }, state: null, observation: { status: 'offline' }, now });
  assert.strictEqual(deferred.state.missed, true);

  // The catch-up waits for a healthy online server and then runs once.
  let catchUp = automation.backupCatchUp({ state: deferred.state, observation: { status: 'offline', healthy: false }, now });
  assert.strictEqual(catchUp.action, 'none');
  catchUp = automation.backupCatchUp({ state: deferred.state, observation: { status: 'online', healthy: true }, now: now + MINUTE });
  assert.strictEqual(catchUp.action, 'run');
  assert.strictEqual(automation.backupCatchUp({ state: catchUp.state, observation: { status: 'online', healthy: true }, now }).action, 'none');

  // Offline runs are opt-in only.
  assert.strictEqual(automation.backupDecision({ action: { kind: 'backup', offlineMode: 'run' }, state: null, observation: { status: 'offline' }, now }).action, 'run');
  assert.strictEqual(automation.backupDecision({ action: { kind: 'backup' }, state: null, observation: { status: 'online' }, now }).action, 'run');

  // Duplicate detection uses verified content metadata, not names or times.
  const manifest = { entries: [{ path: 'Pal/Saved/a.sav', size: 10, sha256: 'aa' }] };
  const state = { lastFingerprint: automation.archiveFingerprint(manifest) };
  assert.strictEqual(automation.isDuplicateArchive({ entries: [...manifest.entries] }, state), true);
  assert.strictEqual(automation.isDuplicateArchive({ entries: [{ path: 'Pal/Saved/a.sav', size: 11, sha256: 'bb' }] }, state), false);

}

// ---------------------------------------------------------------------------
// Cron previews, DST, intervals and boot reconciliation
// ---------------------------------------------------------------------------

function testScheduling() {
  const parsed = automation.parseCron('0 4 * * *');
  assert.ok(parsed);
  assert.strictEqual(automation.parseCron('bogus'), null);
  assert.strictEqual(automation.parseCron('0 4 * *'), null);
  assert.ok(automation.parseCron('0 0 4 * * *'), 'a leading seconds field is accepted');

  const from = new Date(2026, 0, 10, 5, 0, 0).getTime();
  const fires = automation.nextCronFires('0 4 * * *', { from, count: 3 });
  assert.strictEqual(fires.length, 3);
  assert.strictEqual(fires[0].getHours(), 4);
  assert.strictEqual(fires[0].getDate(), 11);
  // Consecutive daily fires stay 24 local hours apart even across a DST jump,
  // which changes the wall clock difference in real time.
  for (let i = 1; i < fires.length; i += 1) {
    const deltaHours = (fires[i] - fires[i - 1]) / 3_600_000;
    assert.ok(deltaHours === 24 || deltaHours === 23 || deltaHours === 25, `unexpected gap ${deltaHours}h`);
  }

  // A clock jump backwards must not replay a fire that already happened.
  const stepped = automation.nextCronFires('0 4 * * *', { from: fires[0].getTime(), count: 1 });
  assert.ok(stepped[0].getTime() > fires[0].getTime());

  // Interval previews are bounded and honour the last fire.
  const preview = automation.previewTrigger({ kind: 'interval', minutes: 30 }, { now: from, lastFireAt: from - 10 * MINUTE, count: 2 });
  assert.strictEqual(preview.next.length, 2);
  assert.strictEqual(new Date(preview.next[0].at).getTime(), from + 20 * MINUTE);
  assert.ok(automation.previewTrigger({ kind: 'server-empty', minimumEmptyMinutes: 20, graceSeconds: 30 }, { now: from }).condition.includes('20'));
  assert.ok(automation.previewTrigger({ kind: 'cron', expression: '0 4 * * *' }, { now: from }).next.length === 3);

  // Duplicate scheduler ticks inside one interval fire once.
  const trigger = { kind: 'interval', minutes: 30 };
  let state = automation.intervalDecision({ trigger, state: {}, now: from }).state;
  assert.strictEqual(automation.intervalDecision({ trigger, state, now: from + MINUTE }).action, 'none');
  const due = automation.intervalDecision({ trigger, state, now: from + 31 * MINUTE });
  assert.strictEqual(due.action, 'run');
  state = due.state;

  // Boot reconciliation: one catch-up at most, and only for recent misses.
  assert.strictEqual(automation.reconcile({ trigger, state: { lastFireAt: from }, now: from + 10 * MINUTE }).reason, 'nothing_missed');
  assert.strictEqual(automation.reconcile({ trigger, state: { lastFireAt: from }, now: from + 90 * MINUTE }).action, 'skip');
  const caught = automation.reconcile({ trigger: { ...trigger, catchUp: true, maxCatchUpMinutes: 120 }, state: { lastFireAt: from }, now: from + 90 * MINUTE });
  assert.strictEqual(caught.action, 'run');
  assert.strictEqual(automation.reconcile({ trigger: { ...trigger, catchUp: true, maxCatchUpMinutes: 30 }, state: { lastFireAt: from }, now: from + 300 * MINUTE }).reason, 'missed_too_old');
  // Many missed cron occurrences still produce a single decision.
  const cronCatch = automation.reconcile({
    trigger: { kind: 'cron', expression: '0 4 * * *', catchUp: true, maxCatchUpMinutes: 10080 },
    state: { lastFireAt: from - 7 * 24 * 60 * MINUTE },
    now: from,
  });
  assert.strictEqual(cronCatch.action, 'run');
}

// ---------------------------------------------------------------------------
// Update trigger + persisted state
// ---------------------------------------------------------------------------

function testUpdatesAndState() {
  const now = Date.UTC(2026, 0, 10, 4, 0, 0);
  let step = automation.updateDecision({ state: null, updateState: 'current', buildId: null, now });
  assert.strictEqual(step.action, 'none');
  step = automation.updateDecision({ state: step.state, updateState: 'update-ready', buildId: '900', now });
  assert.strictEqual(step.action, 'run');
  // Level, not edge: the same available build never re-fires.
  assert.strictEqual(automation.updateDecision({ state: step.state, updateState: 'update-ready', buildId: '900', now }).action, 'none');
  assert.strictEqual(automation.updateDecision({ state: step.state, updateState: 'update-ready', buildId: '901', now }).action, 'run');

  const persisted = automation.safeState({
    lastFireAt: now,
    empty: { emptySince: now, pendingStopAt: now + 1000, announced: true },
    join: { present: ['u1'], cooldowns: { u1: now }, pending: [] },
    backup: { missed: true },
    update: { lastBuildId: '900' },
    cancelledReason: 'player_online',
    junk: 'dropped',
  });
  assert.strictEqual(persisted.junk, undefined);
  assert.strictEqual(persisted.empty.emptySince, now);
  assert.strictEqual(persisted.backup.missed, true);
  assert.strictEqual(persisted.update.lastBuildId, '900');
  assert.deepStrictEqual(automation.safeState(JSON.parse(JSON.stringify(persisted))), persisted);
}

testMigration();
testEmptyCountdown();
testJoinTrigger();
testBackups();
testScheduling();
testUpdatesAndState();
console.log('palworld automation tests passed');
