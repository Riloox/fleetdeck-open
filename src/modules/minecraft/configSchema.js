// Schema for the friendly form on server.properties. Each entry describes
// one modeled key: what kind of control to render, the validation range,
// whether the server needs a restart for the change to take effect, and
// which group the field belongs to. Labels and descriptions live in
// i18n.json under `minecraft.configs.field.<key>.label` / `.description` so the
// form can stay English-only without hardcoding strings.

export const SERVER_PROPERTIES_SCHEMA = [
  { key: 'max-players',          type: 'number', min: 1, max: 1_000_000, restartRequired: true,  group: 'gameplay' },
  { key: 'gamemode',             type: 'enum',   options: ['survival', 'creative', 'adventure', 'spectator'], restartRequired: true, group: 'gameplay' },
  { key: 'difficulty',           type: 'enum',   options: ['peaceful', 'easy', 'normal', 'hard'], restartRequired: true, group: 'gameplay' },
  { key: 'pvp',                  type: 'bool',   restartRequired: true,  group: 'gameplay' },
  { key: 'hardcore',             type: 'bool',   restartRequired: true,  group: 'gameplay' },
  { key: 'motd',                 type: 'string', maxLength: 59,          restartRequired: false, group: 'gameplay' },
  { key: 'white-list',           type: 'bool',   restartRequired: false, group: 'gameplay' },
  { key: 'allow-flight',         type: 'bool',   restartRequired: false, group: 'gameplay' },
  { key: 'spawn-protection',     type: 'number', min: 0, max: 100,       restartRequired: false, group: 'gameplay' },

  { key: 'view-distance',        type: 'number', min: 2, max: 32,        restartRequired: false, group: 'performance' },
  { key: 'simulation-distance',  type: 'number', min: 2, max: 32,        restartRequired: false, group: 'performance' },
  { key: 'max-tick-time',        type: 'number', min: 0, max: 2_000_000, restartRequired: true,  group: 'performance' },
  { key: 'max-world-size',       type: 'number', min: 1, max: 29999984,  restartRequired: true,  group: 'performance' },

  { key: 'server-port',          type: 'number', min: 1, max: 65535,     restartRequired: true,  group: 'world' },
  { key: 'online-mode',          type: 'bool',   restartRequired: true,  group: 'world' },
  { key: 'enable-command-block', type: 'bool',   restartRequired: true,  group: 'world' },
  { key: 'level-name',           type: 'string', restartRequired: true,  group: 'world' },
  { key: 'level-seed',           type: 'string', restartRequired: false, group: 'world' },
  // Minecraft 1.19+ writes the namespaced form (minecraft:normal, etc.)
  // into the generated server.properties; the legacy values are still
  // accepted as aliases by the server, so we list both so the friendly
  // form can display and round-trip whichever one the file actually uses.
  // `labels` is a value -> display-name map so the dropdown shows the
  // real world-type names instead of the raw enum strings.
  { key: 'level-type',           type: 'enum',   options: [
      'default', 'minecraft:normal',
      'flat', 'minecraft:flat',
      'largeBiomes', 'minecraft:large_biomes',
      'amplified', 'minecraft:amplified',
      'customized',
      'buffet', 'minecraft:single_biome_surface',
      'default_1_1'
    ], labels: {
      'default': 'Default',
      'minecraft:normal': 'Normal',
      'flat': 'Flat',
      'minecraft:flat': 'Flat',
      'largeBiomes': 'Large Biomes',
      'minecraft:large_biomes': 'Large Biomes',
      'amplified': 'Amplified',
      'minecraft:amplified': 'Amplified',
      'customized': 'Customized',
      'buffet': 'Buffet',
      'minecraft:single_biome_surface': 'Single Biome Surface',
      'default_1_1': 'Default 1.1'
    },
    // Surfaced in the save summary when the value actually changes, so
    // the user is warned before regenerating their world.
    warning: 'minecraft.configs.field.level-type.warning',
    restartRequired: true, group: 'world' },
  { key: 'generate-structures',  type: 'bool',   restartRequired: true,  group: 'world' },
];

export const SCHEMA_BY_KEY = Object.fromEntries(
  SERVER_PROPERTIES_SCHEMA.map((entry) => [entry.key, entry])
);
