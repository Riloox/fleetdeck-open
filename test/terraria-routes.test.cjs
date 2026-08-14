'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CAPABILITIES } = require('../lib/capabilities.cjs');
const { matchTerrariaRoute } = require('../lib/modules/terraria/routes.cjs');

const ROOT = path.join(__dirname, '..');

function registrations(file, mount) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const routes = [];
  const pattern = /\b(?:app|router)\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;
  let match;
  while ((match = pattern.exec(source))) {
    const local = match[2];
    if (file === 'server.js' && !local.startsWith('/api/terraria')) continue;
    routes.push({
      method: match[1].toUpperCase(),
      path: file === 'server.js' ? local.slice(4) : `${mount}${local === '/' ? '' : local}`,
      source: file,
    });
  }
  return routes;
}

function main() {
  const routes = [
    ...registrations('server.js', ''),
    ...registrations('lib/routes/terraria.cjs', '/terraria/worlds'),
    ...registrations('lib/routes/terraria-mods.cjs', '/terraria/mods'),
    ...registrations('lib/routes/terraria-tshock.cjs', '/terraria/tshock'),
  ];
  assert(routes.length >= 35, `only ${routes.length} Terraria routes were discovered`);

  const unique = new Set();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    assert(!unique.has(key), `duplicate route registration: ${key}`);
    unique.add(key);
    const result = matchTerrariaRoute(route.path, route.method);
    assert(result, `${key} is outside the Terraria capability surface`);
    assert(result.explicit, `${key} in ${route.source} has no explicit capability mapping`);
    assert.notStrictEqual(result.capability, undefined, `${key} has no capability`);
  }

  assert.strictEqual(matchTerrariaRoute('/terraria/config', 'GET').capability, CAPABILITIES.CONFIGS_VIEW);
  assert.strictEqual(matchTerrariaRoute('/terraria/config', 'PUT').capability, CAPABILITIES.CONFIGS_EDIT);
  assert.strictEqual(matchTerrariaRoute('/terraria/worlds/x.wld', 'DELETE').capability, CAPABILITIES.WORLDS_MANAGE);
  assert.strictEqual(matchTerrariaRoute('/terraria/mods/x.tmod', 'DELETE').capability, CAPABILITIES.PLUGINS_MANAGE);
  assert.strictEqual(matchTerrariaRoute('/terraria/tshock/groups', 'POST').capability, CAPABILITIES.SERVER_MANAGE);
  assert.strictEqual(matchTerrariaRoute('/terraria/new-surface', 'GET').explicit, false);
  assert.strictEqual(matchTerrariaRoute('/terraria/new-surface', 'GET').capability, CAPABILITIES.SERVER_MANAGE);
  assert.strictEqual(matchTerrariaRoute('/palworld/status', 'GET'), null);

  console.log(`PASS  terraria-routes (${routes.length} registered routes mapped explicitly)`);
}

main();
