'use strict';

const createMinecraftModule = require('./minecraft/manager.cjs');
const createCustomModule = require('./custom/manager.cjs');
const { createGenericGameModule } = require('./generic-game.cjs');
const createPalworldModule = require('./palworld/manager.cjs');
const createTerrariaModule = require('./terraria/manager.cjs');
const createValheimModule = require('./valheim/manager.cjs');

// Resolves config.servers[].type to a module object (see lib/modules/base.cjs
// for the module contract). `deps` are the server.js helpers Minecraft's
// module needs (Java resolution, port probing, config access, ...) — see the
// createRegistry(...) call in server.js for what's passed.
function createRegistry(deps) {
  const modules = new Map();
  const unsupported = Object.freeze({
    id: 'unsupported',
    capabilities: [],
    metadata: { automaticInstallHosts: [], manualRegistration: false, creationAvailable: false },
    start() { return { ok: false, error: 'Unsupported game type' }; },
    detectOnline() { return false; },
    buildStopSequence() { return { signal: 'SIGTERM' }; },
    statusFields() { return { degraded: true, moduleError: 'unsupported_game_type' }; },
    backupSelection() { return []; },
  });
  modules.set('minecraft', createMinecraftModule(deps));
  modules.set('custom', createCustomModule(deps));
  modules.set('valheim', createValheimModule(deps));
  modules.set('palworld', createPalworldModule(deps));
  modules.set('terraria', createTerrariaModule(deps));

  return {
    get(type) {
      // Only the legacy absence of a type means Minecraft. An explicit,
      // unknown type must not silently acquire Minecraft behavior.
      return type == null || type === '' ? modules.get('minecraft') : (modules.get(type) || unsupported);
    },
    list() {
      return [...modules.entries()].map(([type, module]) => ({
        id: type,
        type,
        capabilities: [...module.capabilities],
        createWizard: !!module.createWizard,
        automaticInstallHosts: module.metadata?.automaticInstallHosts || [],
        manualRegistration: module.metadata?.manualRegistration !== false,
        creationAvailable: module.metadata?.creationAvailable ?? !!module.createWizard,
      }));
    },
    register(type, module) {
      modules.set(type, module);
    },
  };
}

module.exports = { createRegistry };
