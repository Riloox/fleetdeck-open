// server.properties-style file parser/serializer. The pair round-trips
// byte-for-byte for files the friendly form does not touch: feeding the
// output of `serializeProperties(parseProperties(x))` back into the parser
// gives the same { order, values, comments } shape. The form's job is to
// model ~20 known keys, so for those keys we replace the value (and the
// attached comments) intentionally; unknown keys are preserved as-is.

const PROPS_RE = /^([^=:]+?)\s*[=:]\s?(.*)$/;

function splitLines(text) {
  if (text == null) return [];
  return String(text).split('\n').map((s) => s.replace(/\r$/, ''));
}

// Java .properties escape sequences the real server.properties actually
// uses: \: / \= / \\ keep the separator/backslash out of the value, and
// \n/\r/\t are the standard whitespace escapes. We don't decode the long
// \uXXXX form (it never shows up in vanilla server.properties); an
// unrecognised backslash is left as-is so nothing is lost silently.
function unescapeValue(s) {
  if (s == null) return s;
  return String(s).replace(/\\([\\=:nrt])/g, (_, c) => {
    switch (c) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default:  return c;
    }
  });
}

export function parseProperties(text) {
  const order = [];
  const values = {};
  const comments = {};
  let pending = [];
  for (const line of splitLines(text)) {
    if (line === '' || line.startsWith('#')) {
      pending.push(line);
      continue;
    }
    const m = line.match(PROPS_RE);
    if (!m) {
      // Garbage line; treat as a comment so it isn't lost on round-trip.
      pending.push(line);
      continue;
    }
    const key = m[1].trim();
    const value = unescapeValue(m[2]);
    if (!(key in values)) order.push(key);
    values[key] = value;
    if (pending.length) {
      comments[key] = pending.slice();
    }
    pending = [];
  }
  return { order, values, comments };
}

export function serializeProperties({ order = [], values = {}, comments = {} } = {}) {
  const out = [];
  for (const key of order) {
    const pre = comments[key];
    if (pre && pre.length) {
      for (const line of pre) out.push(line);
    }
    out.push(`${key}=${values[key] ?? ''}`);
  }
  // A trailing pending comment block (no following key) is still meaningful;
  // surface it as a header on a no-op marker so it survives the round-trip.
  // The friendly form never produces one (it only edits values), but a
  // hand-edited file might.
  return out.join('\n') + (out.length ? '\n' : '');
}

export function isYamlFilename(name) {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return lower.endsWith('.yml') || lower.endsWith('.yaml');
}

export function isPropertiesFilename(name) {
  if (!name) return false;
  return String(name).toLowerCase().endsWith('.properties');
}

export function isXmlFilename(name) {
  if (!name) return false;
  return String(name).toLowerCase().endsWith('.xml');
}

// Only server.properties has a hand-curated friendly form. Every other
// properties/yml/xml file is raw-only - the schema-driven friendly view
// would just show an empty "Advanced keys" panel for them.
export function hasFriendlyForm(name) {
  if (!name) return false;
  return String(name).toLowerCase() === 'server.properties';
}

// Validates a single schema entry's value. Returns { ok: true } or
// { ok: false, error: '<i18n key, looked up by the view>' }. Range/enum
// violations are blocking; "missing" for a key not in the file is just a
// soft warning surfaced elsewhere.
export function validateValue(schemaKey, value) {
  if (!schemaKey) return { ok: true };
  const v = value == null ? '' : String(value);
  switch (schemaKey.type) {
    case 'bool': {
      if (v === 'true' || v === 'false') return { ok: true };
      return { ok: false, error: 'Must be true or false' };
    }
    case 'number': {
      if (v === '' || !/^-?\d+$/.test(v.trim())) {
        return { ok: false, error: 'Must be a whole number' };
      }
      const n = Number(v);
      if (typeof schemaKey.min === 'number' && n < schemaKey.min) {
        return { ok: false, error: `Must be ≥ ${schemaKey.min}` };
      }
      if (typeof schemaKey.max === 'number' && n > schemaKey.max) {
        return { ok: false, error: `Must be ≤ ${schemaKey.max}` };
      }
      return { ok: true };
    }
    case 'enum': {
      if (schemaKey.options && schemaKey.options.includes(v)) return { ok: true };
      return { ok: false, error: `Must be one of: ${(schemaKey.options || []).join(', ')}` };
    }
    case 'string': {
      if (typeof schemaKey.maxLength === 'number' && v.length > schemaKey.maxLength) {
        return { ok: false, error: `Must be ≤ ${schemaKey.maxLength} characters` };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}
