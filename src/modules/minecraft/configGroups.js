// File group definitions for the left-rail nav. Each group has an i18n
// label key (looked up by the view), and a list of files that should
// appear in that group. `groupFile()` returns the group id for a given
// filename, or 'other' if no group matches. Matching is
// case-insensitive to stay forgiving of the file system.
//
// 'advanced' is the catch-all bucket for editable text configs that
// don't have a hand-curated group: .xml files (Forge / modded servers),
// any .properties file other than server.properties, and any .json file
// that isn't one of the curated world lists (ops/whitelist/bans). They
// are always edited in raw mode.

const ADVANCED_PROPS = new Set(['server.properties']);
const YAML_EXTS = ['.yml', '.yaml'];
const XML_EXTS = ['.xml'];
const PROPS_EXTS = ['.properties'];
const JSON_EXTS = ['.json'];

function isAdvancedFile(name) {
  const lower = String(name || '').toLowerCase();
  if (XML_EXTS.some((ext) => lower.endsWith(ext))) return true;
  if (JSON_EXTS.some((ext) => lower.endsWith(ext))) return true;
  if (PROPS_EXTS.some((ext) => lower.endsWith(ext)) && !ADVANCED_PROPS.has(lower)) return true;
  return false;
}

export const FILE_GROUPS = [
  { id: 'gameplay',    labelKey: 'configs.groupGameplay',    files: ['server.properties', 'bukkit.yml'] },
  { id: 'performance', labelKey: 'configs.groupPerformance', files: ['spigot.yml', 'paper-world-defaults.yml', 'paper-global.yml', 'paper-global-defaults.yml'] },
  { id: 'world',       labelKey: 'configs.groupWorld',       files: ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'] },
  { id: 'advanced',    labelKey: 'configs.groupAdvanced',    files: [], alwaysShow: true },
  { id: 'other',       labelKey: 'configs.groupOther',       files: [] },
];

const GROUPS_BY_FILE = (() => {
  const map = new Map();
  for (const g of FILE_GROUPS) {
    for (const f of g.files) {
      map.set(String(f).toLowerCase(), g.id);
    }
  }
  return map;
})();

export function groupFile(name) {
  if (!name) return 'other';
  // Curated groups win first, so the well-known world lists (ops.json,
  // whitelist.json, banned-*.json) stay in 'world' instead of being
  // swept into the advanced .json catch-all.
  const curated = GROUPS_BY_FILE.get(String(name).toLowerCase());
  if (curated) return curated;
  if (isAdvancedFile(name)) return 'advanced';
  return 'other';
}
