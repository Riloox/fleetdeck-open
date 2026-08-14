// Pure line-diff helpers, no dependencies. `joinDiff` is the renderer input
// (a sequence of {kind, text} the UI can color); `diffLines` returns just the
// added/removed line sets, useful when the UI only needs a summary count.

function splitLines(text) {
  // Preserve line content but normalize the line break. We split on \n and
  // strip a trailing \r so Windows-style "line\r\n" comes through as "line".
  if (text == null) return [];
  return String(text).split('\n').map((s) => s.replace(/\r$/, ''));
}

export function diffLines(a, b) {
  const aLines = splitLines(a);
  const bLines = splitLines(b);
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);
  const added = bLines.filter((l) => !aSet.has(l));
  const removed = aLines.filter((l) => !bSet.has(l));
  return { added, removed };
}

export function joinDiff(a, b) {
  const aLines = splitLines(a);
  const bLines = splitLines(b);
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);
  const out = [];
  let i = 0;
  let j = 0;
  // Walk both lists. Lines present in both files are "same"; lines unique to
  // a or b are "removed"/"added". This is a set-based diff, not a true LCS:
  // it's intentionally simple and produces stable, predictable output that
  // round-trips byte-for-byte for files with no real changes.
  while (i < aLines.length && j < bLines.length) {
    if (aLines[i] === bLines[j]) {
      out.push({ kind: 'same', text: aLines[i] });
      i++;
      j++;
    } else if (aSet.has(bLines[j]) && !bSet.has(aLines[i])) {
      out.push({ kind: 'removed', text: aLines[i] });
      i++;
    } else if (!aSet.has(bLines[j])) {
      out.push({ kind: 'added', text: bLines[j] });
      j++;
    } else {
      // Fallback: emit a removed+added pair to make progress.
      out.push({ kind: 'removed', text: aLines[i] });
      out.push({ kind: 'added', text: bLines[j] });
      i++;
      j++;
    }
  }
  while (i < aLines.length) {
    out.push({ kind: 'removed', text: aLines[i++] });
  }
  while (j < bLines.length) {
    out.push({ kind: 'added', text: bLines[j++] });
  }
  return out;
}
