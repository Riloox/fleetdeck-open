'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

/*
 * The WebSocket command handler is embedded in the large server module and
 * cannot be required in isolation, so - like the terraria suite - assert the
 * authorization is actually wired in by inspecting the source.
 */
const SERVER_JS = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');

const tests = [];

// 1. The upgrade resolves the caller and carries it onto the socket.
tests.push(() => {
  assert.ok(/ws\.fleetdeckUser = user;/.test(SERVER_JS), 'upgrade must carry the resolved user onto the socket');
});

// 2. The command branch gates on commands.run and answers with command_forbidden.
tests.push(() => {
  const ws = SERVER_JS.slice(SERVER_JS.indexOf("wss.on('connection', (ws, req) => {"));
  const handler = ws.slice(0, ws.indexOf("  ws.on('close'"));
  assert.ok(/foundationCapabilities\.has\(user, serverId, foundationCapabilities\.CAPABILITIES\.COMMANDS_RUN\)/.test(handler),
    'the command branch must require commands.run');
  assert.ok(/code: 'command_forbidden'/.test(handler), 'a denied command must answer with command_forbidden');
});

// 3. A command that runs is audited the same way the REST route is.
tests.push(() => {
  const ws = SERVER_JS.slice(SERVER_JS.indexOf("wss.on('connection', (ws, req) => {"));
  const handler = ws.slice(0, ws.indexOf("  ws.on('close'"));
  assert.ok(/action: 'console\.command'/.test(handler), 'a run command must be audited');
  assert.ok(/actorUsername: user\.username/.test(handler), 'the audit must name the actor');
  assert.ok(/outcome: result && result\.ok \? 'success' : 'failure'/.test(handler), 'the audit must record the outcome');
});

let failed = 0;
for (let i = 0; i < tests.length; i++) {
  try { tests[i](); console.log(`ok  ws-command test ${i + 1}`); }
  catch (e) { failed++; console.error(`FAIL  ws-command test ${i + 1}: ${e.message}\n${e.stack}`); }
}
if (failed) { console.error(`FAIL  ${failed} ws-command test(s) failed`); process.exit(1); }
console.log('PASS  foundation-ws-command');
