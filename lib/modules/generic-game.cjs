'use strict';

const fs = require('fs');
const { parseCommand } = require('./custom/manager.cjs');

// Dedicated games live under lib/modules/<game>. This table remains for
// genuinely generic definitions only.
const DEFINITIONS = {};

function createGenericGameModule(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown game module: ${id}`);
  return {
    id,
    capabilities: definition.capabilities,
    metadata: {
      automaticInstallHosts: definition.automaticHosts,
      manualRegistration: true,
      creationAvailable: definition.automaticHosts.includes(process.platform),
    },
    start(manager) {
      const desc = manager.desc();
      const cwd = String(desc.cwd || desc.dir || '').trim();
      if (!cwd || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
        return { ok: false, error: `Working directory not found: ${cwd}` };
      }
      let argv;
      try { argv = desc.executable ? [desc.executable, ...(Array.isArray(desc.args) ? desc.args : [])] : parseCommand(desc.startCommand); }
      catch (err) { return { ok: false, error: err.message }; }
      if (!argv.length) return { ok: false, error: 'No start command configured' };
      return manager._launch(argv[0], argv.slice(1));
    },
    preLaunch() { return { ok: true }; },
    displayLaunchArgs(args) {
      if (id !== 'valheim') return args;
      return args.map((arg, index) => args[index - 1] === '-password' ? '********' : arg);
    },
    detectOnline(line) { return definition.ready.test(String(line || '')); },
    buildStopSequence() {
      return definition.stopCommand ? { command: definition.stopCommand } : { signal: definition.stopSignal };
    },
    statusFields() { return {}; },
    backupSelection() { return ['.']; },
  };
}

module.exports = { createGenericGameModule, DEFINITIONS };
