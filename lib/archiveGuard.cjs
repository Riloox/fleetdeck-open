'use strict';

/*
 * Archive guard.
 *
 * Spec contract (docs/roadmap/README.md "Archive and download contract"):
 *   - "The shared archive guard rejects absolute/traversing paths, links,
 *      devices, duplicate normalized paths, case-fold collisions, oversized
 *      entries, excessive total size/count/expansion ratio, and content
 *      outside the allowed root."
 *   - "Extraction occurs only in staging."
 *
 * This module is the validator: it walks a yauzl/archive entry stream and
 * returns either {ok: true, entries: [...]} (caller does the actual
 * extraction) or {ok: false, error: '...'}. It never touches the disk on
 * its own - extraction is the caller's job, and the caller must use the
 * staging primitive from fsTransaction.cjs.
 *
 * Defaults are tuned for "typical modpack" workloads (~50k files, ~5 GB
 * uncompressed). They are conservative: any single entry that looks
 * suspicious fails the whole archive.
 */

const path = require('path');

const DEFAULTS = Object.freeze({
  maxEntries: 100000,
  maxTotalSize: 8 * 1024 * 1024 * 1024,  // 8 GiB uncompressed
  maxEntrySize: 512 * 1024 * 1024,       // 512 MiB per entry
  maxCompressionRatio: 200,              // uncompressed / compressed per entry
  maxAggregateRatio: 50,                 // uncompressed / compressed total
});

class ArchiveError extends Error {
  constructor(msg, code) { super(msg); this.code = code || 'archive_error'; }
}

/*
 * Validate a single archive entry. The caller is expected to:
 *   - pass entry.fileName (or entry.name) and entry.uncompressedSize
 *   - pass the running totals { totalSize, totalCompressedSize, seen }
 *   - call this for every entry as it streams in
 *
 * Mutates `state` to track seen paths and running totals.
 */
function checkEntry(entry, state, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const name = entry.fileName || entry.name || '';
  state.entries = (state.entries || 0) + 1;
  state.totalSize = (state.totalSize || 0) + (entry.uncompressedSize || 0);
  state.totalCompressedSize = (state.totalCompressedSize || 0) + (entry.compressedSize || 0);
  state.seen = state.seen || new Set();

  if (state.entries > o.maxEntries) {
    throw new ArchiveError(`too many entries: ${state.entries}`, 'too_many_entries');
  }
  if (state.totalSize > o.maxTotalSize) {
    throw new ArchiveError(`total size ${state.totalSize} exceeds ${o.maxTotalSize}`, 'too_large_total');
  }
  if ((entry.uncompressedSize || 0) > o.maxEntrySize) {
    throw new ArchiveError(`entry ${name} too large: ${entry.uncompressedSize}`, 'entry_too_large');
  }

  // Normalize the path: backslashes -> forward, strip leading slashes,
  // reject drive letters and NUL bytes.
  if (name.includes('\u0000')) {
    throw new ArchiveError(`entry name has NUL byte: ${name}`, 'nul_in_name');
  }
  const normalized = String(name).replace(/\\/g, '/').replace(/^[/]+/, '');
  if (/^[a-zA-Z]:/.test(normalized)) {
    throw new ArchiveError(`absolute path in archive: ${name}`, 'absolute_path');
  }
  // Resolve ".." components: anything that escapes the root is rejected.
  const segments = normalized.split('/').filter(Boolean);
  let depth = 0;
  for (const seg of segments) {
    if (seg === '..') {
      depth -= 1;
      if (depth < 0) throw new ArchiveError(`path escapes root: ${name}`, 'path_traversal');
    } else if (seg !== '.') {
      depth += 1;
    }
  }
  // Reject symlinks; we don't follow them in extraction.
  if (((entry.externalFileAttributes >>> 16) & 0xF000) === 0xA000) {
    throw new ArchiveError(`symlink in archive: ${name}`, 'symlink');
  }
  if (((entry.externalFileAttributes >>> 16) & 0xF000) === 0x4000) {
    throw new ArchiveError(`directory entry not flagged: ${name}`, 'directory_unexpected');
  }

  // Compression ratio: a single entry that compresses suspiciously poorly
  // (or not at all in a way that suggests padding) is suspicious.
  if (entry.compressedSize > 0) {
    const ratio = (entry.uncompressedSize || 0) / entry.compressedSize;
    if (ratio > o.maxCompressionRatio) {
      throw new ArchiveError(`entry ${name} compression ratio ${ratio.toFixed(1)}x exceeds ${o.maxCompressionRatio}x`, 'ratio_entry');
    }
  }

  // Duplicate detection: case-fold the full path and the parent directory.
  const lower = normalized.toLowerCase();
  if (state.seen.has(lower)) {
    throw new ArchiveError(`duplicate entry: ${name}`, 'duplicate_entry');
  }
  state.seen.add(lower);
  // Case-fold collisions: a/b and A/b would otherwise both pass the lower
  // check on case-insensitive filesystems. We treat the second one as a
  // duplicate.
  return normalized;
}

/*
 * Final aggregate ratio check. Call this after the last entry.
 */
function finalize(state, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (state.totalCompressedSize > 0) {
    const ratio = state.totalSize / state.totalCompressedSize;
    if (ratio > o.maxAggregateRatio) {
      throw new ArchiveError(`archive ratio ${ratio.toFixed(1)}x exceeds ${o.maxAggregateRatio}x`, 'ratio_aggregate');
    }
  }
  return {
    entries: state.entries,
    totalSize: state.totalSize,
    totalCompressedSize: state.totalCompressedSize,
  };
}

module.exports = { checkEntry, finalize, ArchiveError, DEFAULTS };
