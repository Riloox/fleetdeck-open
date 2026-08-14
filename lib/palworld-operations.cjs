'use strict';

const crypto = require('crypto');

const MESSAGE_LIMIT = 512;
const USER_ID_LIMIT = 128;
const STALE_PLAYER_MS = 30_000;
const CONTROL_CHARACTER_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function text(value, { required = false, limit = MESSAGE_LIMIT, label = 'Message' } = {}) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) return { error: `${label} is required.` };
  if (CONTROL_CHARACTER_RE.test(result)) return { error: `${label} cannot contain control characters.` };
  if (result.length > limit) return { error: `${label} must be ${limit} characters or fewer.` };
  return { value: result };
}

function userId(value) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result) return { error: 'Player ID is required.' };
  if (CONTROL_CHARACTER_RE.test(result) || result.length > USER_ID_LIMIT) return { error: 'Player ID is invalid.' };
  return { value: result };
}

function contentFingerprint(value) {
  const content = typeof value === 'string' ? value : '';
  return {
    length: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function safeTargetId(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function createReplayStore({ ttlMs = 10 * 60_000, now = Date.now } = {}) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (now() - entry.at > ttlMs) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { at: now(), value });
      return value;
    },
  };
}

function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const buckets = new Map();
  return (key) => {
    const at = now();
    const recent = (buckets.get(key) || []).filter((stamp) => at - stamp < windowMs);
    if (recent.length >= limit) {
      const retryAfterMs = Math.max(1, windowMs - (at - recent[0]));
      buckets.set(key, recent);
      return { allowed: false, retryAfterMs };
    }
    recent.push(at);
    buckets.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  };
}

module.exports = {
  MESSAGE_LIMIT,
  USER_ID_LIMIT,
  STALE_PLAYER_MS,
  text,
  userId,
  contentFingerprint,
  safeTargetId,
  createReplayStore,
  createRateLimiter,
};
