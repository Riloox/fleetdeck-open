const assert = require('node:assert/strict');
const { test } = require('node:test');

const { appendConsoleLine, normalizeConsoleText } = require('../lib/consoleHistory.cjs');

test('console history suppresses duplicate adjacent lines', () => {
  const history = [];
  const first = appendConsoleLine(history, { ts: 1000, text: 'There are 1 of a max of 20 players online: pq6', level: 'info' });
  const duplicate = appendConsoleLine(history, { ts: 1001, text: 'There are 1 of a max of 20 players online: pq6', level: 'info' });

  assert.equal(first, true);
  assert.equal(duplicate, false);
  assert.deepEqual(history.map((line) => line.text), ['There are 1 of a max of 20 players online: pq6']);
});

test('console history keeps repeated commands after another line', () => {
  const history = [];
  appendConsoleLine(history, { ts: 1000, text: '> say caca', level: 'cmd' });
  appendConsoleLine(history, { ts: 1001, text: '[Server] caca', level: 'info' });
  const repeatedLater = appendConsoleLine(history, { ts: 1002, text: '> say caca', level: 'cmd' });

  assert.equal(repeatedLater, true);
  assert.deepEqual(history.map((line) => line.text), ['> say caca', '[Server] caca', '> say caca']);
});

test('console history suppresses a duplicate separated by another recent line', () => {
  const history = [];
  appendConsoleLine(history, { ts: 1000, text: 'There are 0 of a max of 20 players online:', level: 'info' });
  appendConsoleLine(history, { ts: 1001, text: 'TPS from last 1m, 5m, 15m: 20.0', level: 'info' });
  const duplicate = appendConsoleLine(history, { ts: 1002, text: 'There are 0 of a max of 20 players online:', level: 'error' });

  assert.equal(duplicate, false);
  assert.equal(history.length, 2);
});

test('console history strips terminal escape codes before storing and comparing lines', () => {
  const history = [];
  const coloured = '\u001b[38;2;255;170;0mTPS from last 1m: 20.0\u001b[0m';

  assert.equal(normalizeConsoleText(coloured), 'TPS from last 1m: 20.0');
  appendConsoleLine(history, { ts: 1000, text: coloured, level: 'info' });
  const duplicate = appendConsoleLine(history, { ts: 1001, text: 'TPS from last 1m: 20.0', level: 'info' });

  assert.equal(duplicate, false);
  assert.deepEqual(history.map((line) => line.text), ['TPS from last 1m: 20.0']);
});

test('console history treats equivalent Minecraft logger prefixes as duplicates', () => {
  const history = [];
  appendConsoleLine(history, { ts: 1000, text: '[12:41:01 INFO]: [spark] Starting background profiler...', level: 'info' });
  const duplicate = appendConsoleLine(history, { ts: 1001, text: '[12:41:01] [Server thread/INFO]: [spark] Starting background profiler...', level: 'info' });

  assert.equal(duplicate, false);
  assert.deepEqual(history.map((line) => line.text), ['[spark] Starting background profiler...']);
});
