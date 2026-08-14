'use strict';

/*
 * API keys: a non-interactive principal.
 *
 * Every route but /api/login wanted a JWT obtained by a human typing a
 * password, which left a provider automating provisioning with one option -
 * store an admin password in their billing system and script a login. Nobody
 * should propose that and no provider would accept it.
 *
 * A key is deliberately *just another principal*, not a parallel permission
 * system: its id goes in capability_grants.user_id exactly like a user's, so
 * `capabilities.has()` and every `requireCap()` on every route already work
 * against it with no changes. The id is prefixed `key:` so an audit row makes
 * it obvious a machine did this, and so the two id spaces can never collide.
 *
 * Token shape: fdk_<id>_<secret>
 *   - <id> is the lookup handle and is stored in the clear. It is also what the
 *     UI shows after creation, so a key can be identified in a log or revoked
 *     from a leaked fragment without the secret ever being recoverable.
 *   - <secret> is 32 random bytes. Only its SHA-256 is stored. A slow KDF buys
 *     nothing here: unlike a password this has full entropy, so there is no
 *     dictionary to run and the per-request cost would be paid on every call.
 */

const crypto = require('crypto');
const { open } = require('./db.cjs');

const TOKEN_PREFIX = 'fdk';
const ID_PREFIX = 'key:';
const ROLES = Object.freeze(['admin', 'operator']);

// last_used_at exists to answer "is this key still in use?" before revoking it.
// That question does not need minute-level accuracy, and writing on every
// request would put a DB write in front of every provisioning call.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

/*
 * Matched rather than split: base64url's alphabet includes "_", so about half
 * of all secrets contain one and splitting on the separator would truncate
 * them. The handle is fixed-width hex, so anchoring on that is unambiguous.
 */
const TOKEN_PATTERN = new RegExp(`^${TOKEN_PREFIX}_([0-9a-f]{16})_(.+)$`);

function parseToken(token) {
  const match = TOKEN_PATTERN.exec(String(token == null ? '' : token));
  if (!match) return null;
  return { id: ID_PREFIX + match[1], secret: match[2] };
}

/** True for a string shaped like one of our tokens - used to route auth. */
function looksLikeApiKey(token) {
  return parseToken(token) !== null;
}

function row2key(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  };
}

/**
 * Mint a key. The plaintext token is returned exactly once, here; it is not
 * recoverable afterwards and no code path stores it.
 *
 * @returns {{ key: object, token: string }}
 */
function create({ name, role = 'operator', createdBy = null, expiresAt = null } = {}) {
  const label = String(name == null ? '' : name).trim();
  if (!label) throw new Error('apiKeys.create: name required');
  if (!ROLES.includes(role)) throw new Error(`apiKeys.create: unknown role ${role}`);
  if (expiresAt != null && !Number.isFinite(expiresAt)) {
    throw new Error('apiKeys.create: expiresAt must be a timestamp or null');
  }

  const handle = crypto.randomBytes(8).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');
  const id = ID_PREFIX + handle;

  open().prepare(`
    INSERT INTO api_keys (id, name, role, secret_hash, created_at, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, label.slice(0, 80), role, hashSecret(secret), Date.now(), createdBy, expiresAt);

  return { key: get(id), token: `${TOKEN_PREFIX}_${handle}_${secret}` };
}

function get(id) {
  return row2key(open().prepare('SELECT * FROM api_keys WHERE id = ?').get(id));
}

function list({ includeRevoked = true } = {}) {
  const sql = includeRevoked
    ? 'SELECT * FROM api_keys ORDER BY created_at DESC'
    : 'SELECT * FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC';
  return open().prepare(sql).all().map(row2key);
}

/**
 * Resolve a token to the principal behind it, or null. Returns an object
 * shaped like a user because that is what the auth middleware, the capability
 * layer, and the audit recorder all consume.
 */
function verify(token) {
  const parsed = parseToken(token);
  if (!parsed) return null;

  const row = open().prepare('SELECT * FROM api_keys WHERE id = ?').get(parsed.id);
  if (!row) return null;

  const expected = Buffer.from(row.secret_hash, 'hex');
  const actual = Buffer.from(hashSecret(parsed.secret), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  // Checked after the compare so a revoked or expired key cannot be told apart
  // from a wrong secret by how long the answer takes.
  if (row.revoked_at) return null;
  if (row.expires_at && row.expires_at <= Date.now()) return null;

  touch(row);

  return {
    id: row.id,
    username: row.name,
    name: row.name,
    role: row.role,
    // The one thing that distinguishes a key from a user downstream. Routes
    // that must stay human-only test this rather than guessing from the id.
    apiKey: true,
  };
}

function touch(row) {
  const now = Date.now();
  if (row.last_used_at && now - row.last_used_at < LAST_USED_WRITE_INTERVAL_MS) return;
  open().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now, row.id);
}

/**
 * Revoke a key. Grants are dropped with it: a revoked key's id must not sit in
 * capability_grants where it could be re-attached by a later bug.
 */
function revoke(id, revokedBy = null) {
  const db = open();
  let changed = 0;
  db.transaction(() => {
    changed = db.prepare(`
      UPDATE api_keys SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL
    `).run(Date.now(), revokedBy, id).changes;
    if (changed) db.prepare('DELETE FROM capability_grants WHERE user_id = ?').run(id);
  })();
  return changed > 0;
}

function isApiKeyPrincipal(user) {
  return !!user && user.apiKey === true;
}

module.exports = {
  create, get, list, verify, revoke,
  looksLikeApiKey, isApiKeyPrincipal,
  ROLES, ID_PREFIX, TOKEN_PREFIX,
};
