'use strict';

const path = require('path');

const SENSITIVE_KEY = /^(?:password|passwordHash|jwtSecret|authorization|restToken|token|steamPassword|steamUsername)$/i;
const CREDENTIAL_TEXT = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
  /\bBasic\s+[A-Za-z0-9+/=]{12,}/i,
  /\b(?:steam_(?:login|password)|tshock.*token)\s*[:=]\s*\S+/i,
];
const IP_ADDRESS = /(?:^|[^A-Za-z0-9])(?:\d{1,3}\.){3}\d{1,3}(?=$|[^A-Za-z0-9])/;
const ABSOLUTE_PATH = /(?:^|[\s"'(])(?:[A-Za-z]:[\\/]|\/(?:home|Users|private|tmp|var|opt|srv|mnt)\/)[^\s"',)]*/;

function scanSensitive(value, options = {}, trail = '$', findings = []) {
  const knownSecrets = (options.knownSecrets || [])
    .filter((secret) => typeof secret === 'string' && secret.length >= 6);
  if (typeof value === 'string') {
    for (const pattern of CREDENTIAL_TEXT) {
      if (pattern.test(value)) findings.push({ path: trail, reason: 'credential_pattern' });
    }
    if (options.allowIp !== true && IP_ADDRESS.test(value)) {
      findings.push({ path: trail, reason: 'ip_address' });
    }
    if (options.allowAbsolutePath !== true && ABSOLUTE_PATH.test(value)) {
      findings.push({ path: trail, reason: 'absolute_path' });
    }
    for (const secret of knownSecrets) {
      if (value.includes(secret)) findings.push({ path: trail, reason: 'known_secret' });
    }
    return findings;
  }
  if (Buffer.isBuffer(value)) {
    return scanSensitive(value.toString('utf8'), options, trail, findings);
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

function isInside(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

module.exports = { scanSensitive, isInside };
