'use strict';

/*
 * Safe path resolution.
 *
 * Spec contract (docs/roadmap/README.md "Important guardrails"):
 *   - "Path traversal: the file manager and configs editor resolve user
 *      paths through safeResolve(root, rel) / resolveEditable(...), which
 *      refuse anything escaping the server folder. Keep every new filesystem
 *      route behind one of these."
 *
 * The current server.js inlines the same logic in many places. This module
 * is the shared, testable home for it.
 */

const path = require('path');
const fs = require('fs');

const MAX_PATH_LENGTH = 4096;

/*
 * Resolve `rel` against `root` and refuse anything that escapes. Returns the
 * absolute, normalized path on success; throws on absolute paths, traversal,
 * NUL bytes, or non-string inputs. Symlinks that point outside the root are
 * allowed at resolve time (you usually want to read through them) but
 * resolved-real path is exposed separately so callers can verify.
 */
function safeResolve(root, rel) {
  if (typeof root !== 'string' || !root) throw new Error('safeResolve: root required');
  if (typeof rel !== 'string') throw new Error('safeResolve: rel must be a string');
  if (rel.length > MAX_PATH_LENGTH) throw new Error('safeResolve: path too long');
  if (rel.length === 0) throw new Error('safeResolve: rel required');
  if (rel.includes('\u0000')) throw new Error('safeResolve: NUL in path');

  const absRoot = path.resolve(root);
  // Reject absolute paths outright: the user should never hand us one, and
  // on POSIX the leading "/" could disguise an attempt to climb out.
  if (path.isAbsolute(rel) || /^[a-zA-Z]:[\\/]/.test(rel)) {
    throw new Error('safeResolve: absolute path not allowed');
  }
  // path.resolve handles ".." segments but not absolute roots embedded in
  // the middle. Split on separators, drop any leading "/" (POSIX) or
  // drive-letter pieces, then re-resolve.
  const normalized = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(absRoot, normalized);
  const relToRoot = path.relative(absRoot, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('safeResolve: path escapes root');
  }
  return abs;
}

/*
 * Same as safeResolve, but also reject symlinks pointing outside the root.
 * Use this for paths you intend to write to (upload, mkdir, rename).
 */
function safeResolveNoFollow(root, rel) {
  const abs = safeResolve(root, rel);
  // path.relative from a symlink target to the root is the same as the
  // target's real path; if a directory component along the way is a symlink
  // to outside, we want to refuse.
  let cur = absRoot(root);
  const parts = abs.slice(cur.length).split(path.sep).filter(Boolean);
  for (const part of parts) {
    cur = path.join(cur, part);
    try {
      const lst = fs.lstatSync(cur);
      if (lst.isSymbolicLink()) {
        const real = fs.realpathSync(cur);
        const rel = path.relative(absRoot(root), real);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error('safeResolveNoFollow: symlink escapes root');
        }
      }
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  return abs;
}

function absRoot(root) {
  return path.resolve(root);
}

module.exports = { safeResolve, safeResolveNoFollow, MAX_PATH_LENGTH };
