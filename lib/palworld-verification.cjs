'use strict';

const SENSITIVE_KEY = /^(?:adminPassword|passwordHash|jwtSecret|authorization|discordToken|botToken|webhookUrl)$/i;
const SENSITIVE_TEXT = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}/i,
  /https:\/\/(?:discord(?:app)?\.com\/api\/webhooks)\/\d+\/[A-Za-z0-9._-]+/i,
  /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,})\b/,
];

const ROLLOUT_MODULES = Object.freeze({
  status: { order: 1, mutation: false },
  players: { order: 2, mutation: true },
  settings: { order: 3, mutation: true },
  updates: { order: 4, mutation: true },
  map: { order: 5, mutation: false },
  automation: { order: 6, mutation: true },
  portability: { order: 7, mutation: true },
  mods: { order: 8, mutation: true },
  integrations: { order: 9, mutation: true, optional: true },
});

function scanSensitive(value, options = {}, trail = '$', findings = []) {
  const knownSecrets = (options.knownSecrets || []).filter((secret) => typeof secret === 'string' && secret.length >= 6);
  if (typeof value === 'string') {
    for (const pattern of SENSITIVE_TEXT) {
      if (pattern.test(value)) findings.push({ path: trail, reason: 'credential_pattern' });
    }
    for (const secret of knownSecrets) {
      if (value.includes(secret)) findings.push({ path: trail, reason: 'known_secret' });
    }
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, options, `${trail}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, item] of Object.entries(value)) {
    const next = `${trail}.${key}`;
    if (SENSITIVE_KEY.test(key) && item !== null && item !== '' && item !== '[REDACTED]') {
      findings.push({ path: next, reason: 'sensitive_key' });
    }
    scanSensitive(item, options, next, findings);
  }
  return findings;
}

function rolloutState(config = {}) {
  return Object.fromEntries(Object.entries(ROLLOUT_MODULES).map(([id, definition]) => [
    id,
    {
      ...definition,
      enabled: definition.mutation ? config[id] === true : config[id] !== false,
    },
  ]));
}

function assertMutationEnabled(moduleId, config = {}) {
  const module = rolloutState(config)[moduleId];
  if (!module) throw new Error(`Unknown Palworld rollout module: ${moduleId}`);
  if (module.mutation && !module.enabled) {
    const error = new Error(`Palworld ${moduleId} mutations are not enabled`);
    error.code = 'palworld_feature_disabled';
    throw error;
  }
  return module;
}

module.exports = { ROLLOUT_MODULES, assertMutationEnabled, rolloutState, scanSensitive };
