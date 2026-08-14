'use strict';

const assert = require('assert');
const consoleGrammar = require('../lib/modules/valheim/console.cjs');

let state = consoleGrammar.initialState();
const at = Date.parse('2026-01-01T00:00:00Z');

function event(line, type, offset = 0) {
  const result = consoleGrammar.inspectLine(state, line, at + offset);
  state = result.state;
  assert.equal(result.events.some((item) => item.type === type), true, `${type}: ${line}`);
}

event('Game server connected', 'ready');
assert.equal(consoleGrammar.inspectLine(state, 'A player connected to the server', at).events.some((item) => item.type === 'ready'), false);
event('World save writing started', 'save-started', 1);
event('World saved in 234 ms', 'save-complete', 2);
event('Got character ZDOID from Viking-1 : 123', 'connect-observed', 3);
event('Closing socket SteamID: 76561198000000000', 'disconnect-observed', 4);
event('OnApplicationQuit', 'shutdown-started', 5);
event('Game server disconnected', 'shutdown-complete', 6);
event('Failed to bind socket: Address already in use', 'fatal', 7);

assert.equal(state.observed.length <= consoleGrammar.MAX_IDENTITIES, true);
const secret = 'password secret5 join code: ABC123 203.0.113.4 /home/alice/valheim';
const redacted = consoleGrammar.redactLine(secret);
for (const value of ['secret5', 'ABC123', '203.0.113.4', '/home/alice']) assert.equal(redacted.includes(value), false);

console.log('valheim lifecycle tests passed');
