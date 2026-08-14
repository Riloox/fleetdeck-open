'use strict';

const DAY = 24 * 3600 * 1000;

const COMMON_RULES = [
  ['terraria.port.in-use', 'network', /(?:address already in use|only one usage of each socket|failed to bind|port \d+ is already in use)/i, 'high', 'The server could not bind its configured network port.', ['Check which process is using the port.', 'Change the port in the server configuration.'], 'configs'],
  ['terraria.world.missing', 'world', /(?:world|\.wld).{0,100}(?:not found|does not exist|could not find|missing)/i, 'high', 'The configured Terraria world file could not be found.', ['Select an existing world or generate a new one.'], 'worlds'],
  ['terraria.world.corrupt', 'world', /(?:invalid world|failed to load world|world.*(?:corrupt|header)|error loading.*\.wld)/i, 'high', 'Terraria could not read the configured world.', ['Restore the newest usable backup.', 'Check the world .bak companion file.'], 'backups'],
  ['terraria.world.version', 'world', /world.{0,100}(?:newer version|later version|version is newer|unsupported version)/i, 'high', 'The world was saved by a newer Terraria version.', ['Update the server or select a world compatible with this version.'], 'worlds'],
  ['terraria.awaiting-input', 'configuration', /(?:choose world|select world|world selection|n new world|enter world)/i, 'high', 'The server was waiting for interactive world selection, not hung.', ['Configure a world before starting the server.'], 'worlds', (environment) => environment.signal === 'SIGKILL' || environment.lifecycle === 'unclean_stop'],
  ['terraria.memory', 'memory', /(?:outofmemoryexception|out of memory|cannot allocate memory|insufficient memory)/i, 'high', 'The process exhausted available memory.', ['Reduce world size or player count.', 'Check available host memory.'], 'health'],
  ['terraria.unclean-stop', 'lifecycle', /exited without confirming that it saved|stop timed out|sigkill/i, 'high', 'The server did not confirm a clean save and shutdown.', ['Check that the world saved successfully before restarting.'], 'worlds'],
];

/*
 * The .NET host's own failure output, for the two variants that run on it.
 *
 * These fire when the process never reached the game: the apphost writes them
 * and exits, so the console holds nothing else to go on. `.NET location: Not
 * found` and the hostfxr line are the "no runtime anywhere the apphost looks"
 * shape - which on Linux is usually a runtime installed in ~/.dotnet, visible
 * on PATH and invisible to an apphost (lib/dotnetRuntime.cjs sets DOTNET_ROOT
 * for exactly that case). The framework lines are the "wrong major version"
 * shape, and the output names the version needed and the versions present.
 */
const DOTNET_RULES = [
  ['terraria.runtime.missing', 'runtime', /(?:you must install(?: or update)? \.net|failed to (?:resolve|load) libhostfxr|hostfxr\.dll.{0,40}not found|\.net location: not found|(?:you must install|failed to load|not found).{0,80}(?:\.net|hostfxr|coreclr|runtime))/i, 'high', 'The .NET runtime this server needs was not found on the host.', ['Install the .NET runtime version the console output names.', 'If .NET is installed outside the default location, make sure the panel process can see it.'], 'servers'],
  ['terraria.runtime.version', 'runtime', /(?:framework:? '?microsoft\.netcore\.app'?|the following frameworks were found|framework_version=)/i, 'high', 'The installed .NET runtime is not the version this server targets.', ['Install the .NET version named in the console output, then start the server again.'], 'servers'],
];

const VARIANT_RULES = {
  tmodloader: [
    ...DOTNET_RULES,
    ['tmodloader.mod.missing-dependency', 'mod', /(?:missing dependency|depends on|requires mod).{0,120}(?:not found|missing|not enabled|unavailable)/i, 'high', 'A loaded mod has a dependency that is unavailable.', ['Install the named dependency or disable the dependent mod.'], 'addons'],
    ['tmodloader.mod.version', 'mod', /(?:built for|requires|targets).{0,100}(?:tmodloader|tml).{0,80}(?:version|v\d)/i, 'high', 'A mod targets a different tModLoader version.', ['Update the mod or use the matching tModLoader version.'], 'addons'],
    ['tmodloader.mod.exception', 'mod', /(?:modloadingexception|exception loading mod|unhandled exception).{0,160}(?:mod|\.tmod)/i, 'medium', 'An unhandled exception occurred while loading a mod.', ['Disable the named mod and restart the server.'], 'addons'],
  ],
  tshock: [
    ...DOTNET_RULES,
    ['tshock.db.locked', 'database', /(?:database is locked|sqlite_busy|sqlite.*(?:locked|busy))/i, 'high', 'TShock could not use its SQLite database because it is locked.', ['Ensure only one server uses the database and check for a stale process.'], 'servers'],
    ['tshock.config.invalid', 'configuration', /(?:json|config).{0,100}(?:parse|invalid|deserialize|unexpected character)/i, 'high', 'TShock could not parse its configuration.', ['Fix the file in the raw configuration editor or restore its previous revision.'], 'configs'],
  ],
};

function rule(tuple) {
  return { id: tuple[0], category: tuple[1], pattern: tuple[2], confidence: tuple[3], reasoning: tuple[4], suggestions: tuple[5], action: tuple[6], when: tuple[7] };
}

function crashEvidence(desc = {}) {
  const variant = desc.terrariaVariant || 'vanilla';
  if (variant === 'tmodloader') return [
    { id: 'serverLog', relativePath: 'Logs/server.log' },
    { id: 'launchLog', relativePath: 'Logs/Launch.txt' },
    { id: 'latestTerrariaLog', glob: 'Logs/*.log', maxAgeMs: DAY },
  ];
  if (variant === 'tshock') return [{ id: 'tshockLog', glob: 'tshock/logs/*.log', maxAgeMs: DAY }];
  return [{ id: 'serverLog', relativePath: 'ServerLog.txt' }];
}

function crashRules(desc = {}) {
  return [...COMMON_RULES, ...(VARIANT_RULES[desc.terrariaVariant] || [])].map(rule);
}

module.exports = { crashEvidence, crashRules };
