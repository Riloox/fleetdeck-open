'use strict';

const { CAPABILITIES } = require('../../capabilities.cjs');

function requireValheim(req, res, next) {
  const server = req.fleetdeckServer || req.server;
  if (!server || server.type !== 'valheim') return res.status(404).json({ error: 'not_supported' });
  next();
}

/*
 * Capability mapping for `/api/valheim/*` (docs/valheim/03-worlds.md "API").
 *
 * Mirrors lib/modules/terraria/routes.cjs: one table a test can enumerate,
 * so an unmapped Valheim path fails closed onto server.manage rather than
 * silently inheriting a weaker capability from a fall-through.
 */
const RULES = Object.freeze([
  { pattern: /^\/valheim\/worlds\/[^/]+\/download(?:\/|$)/, get: CAPABILITIES.WORLDS_VIEW, mutate: null },
  { pattern: /^\/valheim\/worlds(?:\/|$)/, get: CAPABILITIES.WORLDS_VIEW, mutate: CAPABILITIES.WORLDS_MANAGE },
]);

const FALLBACK_CAPABILITY = CAPABILITIES.SERVER_MANAGE;

function matchValheimRoute(path, method = 'GET') {
  const p = String(path || '');
  if (!/^\/valheim(?:\/|$)/.test(p)) return null;
  const rule = RULES.find((entry) => entry.pattern.test(p));
  if (!rule) return null; // /valheim/updates/* etc. are not this table's job
  const read = method === 'GET' || method === 'HEAD';
  const capability = read ? rule.get : rule.mutate;
  return { capability: capability || FALLBACK_CAPABILITY, explicit: !!capability };
}

function valheimRouteCapability(path, method) {
  const match = matchValheimRoute(path, method);
  return match ? match.capability : null;
}

module.exports = { requireValheim, RULES, FALLBACK_CAPABILITY, matchValheimRoute, valheimRouteCapability };
