'use strict';

const assert = require('assert');
const config = require('../lib/terraria-config.cjs');

const fixtures = [
  '\ufeff# Terraria\r\nport = 7777\r\n\r\nmotd=Olá = mundo\r\nfuture-key=yes\r\n',
  '# Terraria\nport=7777\npassword=\n# comment\n',
  'port=7777',
  '',
];

for (const text of fixtures) {
  assert.strictEqual(config.serialize(config.parse(text)), text, 'parse/serialize must be byte-identical');
}

{
  const text = '\ufeff# header\r\n  port = 7777\r\nfuture=value\r\nmotd=hello\r\n';
  const result = config.patch(config.parse(text), { port: '7778' });
  assert.strictEqual(config.serialize(result.document), '\ufeff# header\r\n  port = 7778\r\nfuture=value\r\nmotd=hello\r\n');
  assert.deepStrictEqual(result.diff, [{ key: 'port', from: '7777', to: '7778' }]);
}

{
  const document = config.parse('port=7777\nport=7778\n');
  assert.throws(() => config.patch(document, { port: '7779' }), (error) => error.code === 'duplicate_key');
}

{
  const text = '# port=7777\r\nmotd=hello\r\nfuture-setting=kept\r\n';
  const reset = config.patch(config.parse(text), { motd: null });
  assert.strictEqual(config.serialize(reset.document), '# port=7777\r\nfuture-setting=kept\r\n');
}

{
  assert.throws(() => config.patch(config.parse('motd=ok\n'), { motd: 'bad\nvalue' }), (error) => error.code === 'invalid_value');
  assert.throws(() => config.validateRaw('serverconfig.txt', 'not a setting\n'), (error) => error.code === 'parse_error' && /line 1/.test(error.message));
  assert.throws(() => config.validateRaw('tshock/config.json', '{\n  "bad":\n}'), (error) => error.code === 'parse_error' && /line/.test(error.message));
}

for (const field of [...config.SCHEMA, ...config.TSHOCK_SCHEMA]) {
  assert.ok(field.defaultSource?.url);
  assert.ok(field.defaultSource?.verifiedAt);
  assert.ok(field.defaultSource?.observedDefault);
}

assert.strictEqual(config.SCHEMA.find((field) => field.key === 'password').secret, true);
assert.strictEqual(config.SCHEMA.find((field) => field.key === 'world').managedBy, 'worlds');
console.log('PASS  terraria-config');
