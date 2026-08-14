'use strict';

const DUPLICATE_WINDOW_MS = 1500;

// Minecraft servers and plugins sometimes write ANSI colour escapes even when
// their output is captured by a web panel. They are terminal instructions, not
// console content, so remove them before storing or comparing a line.
const ANSI_ESCAPE_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~])/g;
const MINECRAFT_TIMESTAMP_RE = /^\[\d{2}:\d{2}:\d{2}(?:\s+\w+)?\](?:\s*\[[^\]]*\])?:\s*/;

function normalizeConsoleText(text) {
  return String(text == null ? '' : text)
    .replace(ANSI_ESCAPE_RE, '')
    .replace(/\r/g, '')
    // Match the display normalisation in ConsoleView. Paper can mirror the
    // same message with two different logger prefixes, which would otherwise
    // evade duplicate detection while looking identical in the panel.
    .replace(MINECRAFT_TIMESTAMP_RE, '');
}

function appendConsoleLine(history, entry, maxLines = 500) {
  const normalized = { ...entry, text: normalizeConsoleText(entry.text) };
  const timestamp = normalized.ts || 0;

  // stdout and stderr can be flushed in a different order, so an identical
  // line is not always adjacent to its duplicate. Search the recent tail
  // rather than only comparing the previous entry.
  if (normalized.level !== 'cmd') {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const previous = history[i];
      const delta = Math.abs(timestamp - (previous.ts || 0));
      if (delta > DUPLICATE_WINDOW_MS && (previous.ts || 0) <= timestamp) break;
      if (previous.text === normalized.text && delta <= DUPLICATE_WINDOW_MS) {
        return false;
      }
    }
  }

  history.push(normalized);
  if (history.length > maxLines) {
    history.splice(0, history.length - maxLines);
  }
  return true;
}

module.exports = {
  appendConsoleLine,
  normalizeConsoleText,
};
