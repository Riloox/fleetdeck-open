'use strict';

// A "server module" encapsulates everything that's specific to one kind of
// managed process (Minecraft, a custom command, ...). ServerManager (in
// server.js) owns process lifecycle mechanics that are the same for every
// module (spawn/kill, watchdog, adoption, console framing) and delegates
// anything module-specific to the object returned by a module factory below.
//
// A module is a plain object (matches the rest of the codebase's style of
// exporting plain functions from .cjs files rather than class hierarchies).
// Hooks are optional only when metadata/capabilities explicitly decline the
// feature. A module must never fall back to another game's behavior.
//
// Shape (see lib/modules/minecraft/manager.cjs for a full implementation):
//
// {
//   id: 'minecraft',                       // matches config.servers[].type
//   capabilities: ['players', 'addons', 'content-install', 'worlds', 'map'],
//   metadata: {
//     automaticInstallHosts: ['win32', 'linux'],
//     manualRegistration: true,
//     creationAvailable: true
//   },
//
//   // -- process lifecycle --
//   start(manager)                         // replaces the old start()'s jar/java resolution
//   preLaunch(manager) -> {ok,error}|Promise  // pre-flight check before spawn (e.g. port probe)
//   resetState(manager)                    // reset module-owned per-launch state
//   detectOnline(line, manager) -> boolean  // "the process is ready" detection
//   onOnline(manager)                       // fired once when detectOnline first matches
//   inspectLine(line, manager)              // parse console output for module-owned stats
//   pollCommands(manager) -> string[]|null  // stdin commands to poll on an interval
//   buildStopSequence(manager) -> {execute}|{command}|{signal}|null
//   onExit(manager)                         // clear module-owned state on process exit
//   statusFields(manager) -> object         // merged into the generic status payload
//   crashEvidence(desc) -> [{id,relativePath|glob,maxAgeMs?}]
//   crashRules(desc) -> [{id,category,pattern,confidence,reasoning,suggestions,action?}]
//
//   // -- normalized parsing/actions --
//   listPlayers(manager) -> [{id,name}]|unsupported
//   playerAction(manager, action, target) -> {ok,...}|unsupported
//   normalizeStatus(manager) -> {version,players,performance,world}|object
//
//   // -- configuration and filesystem --
//   addonsDir(desc, kind) -> string|null
//   configSchema(desc) -> {files,fields}|null
//   readConfig/writeConfig(manager, name, value) -> result|unsupported
//
//   // -- backups --
//   backupPrepare(manager) -> state|Promise
//   backupSelection(desc) -> string[]        // paths relative to installation
//   backupCleanup(manager, state, outcome) -> void|Promise
//   backupRestartPolicy(manager, state) -> boolean
//
//   // -- update/install lifecycle --
//   discoverUpdate(desc) -> plan|unsupported
//   applyUpdate(manager, plan, progress, signal) -> result|Promise
//   rollbackUpdate(manager, plan, cause) -> result|Promise
//   validateRegistration(input, host) -> normalized descriptor
//   buildLaunch(desc, host) -> {executable,args,cwd}
//   contentInstall: {...}|null
//   createWizard: {...}|null
// }

module.exports = {};
