'use strict';

const assert = require('assert');
const {
  MESSAGE_LIMIT, text, userId, contentFingerprint, createReplayStore, createRateLimiter,
} = require('../lib/palworld-operations.cjs');

assert.equal(text(' hello ', { required: true }).value, 'hello');
assert.match(text('', { required: true }).error, /required/);
assert.match(text('bad\u0001message').error, /control/);
assert.match(text('x'.repeat(MESSAGE_LIMIT + 1)).error, /512/);
assert.equal(userId(' steam_1 ').value, 'steam_1');
assert.ok(userId('').error);
assert.equal(contentFingerprint('secret').length, 6);
assert.equal(contentFingerprint('secret').sha256.length, 64);

let now = 100;
const replays = createReplayStore({ ttlMs: 10, now: () => now });
replays.set('key', { ok: true });
assert.deepEqual(replays.get('key'), { ok: true });
now = 111;
assert.equal(replays.get('key'), null);

const rate = createRateLimiter({ limit: 2, windowMs: 100, now: () => now });
assert.equal(rate('actor').allowed, true);
assert.equal(rate('actor').allowed, true);
assert.equal(rate('actor').allowed, false);
now += 101;
assert.equal(rate('actor').allowed, true);

console.log('palworld operation tests passed');
