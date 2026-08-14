// Which kind of addon a server accepts, worked out from its jar/loader the same
// way the backend's detectCompat() does: mod loaders read mods/, the Bukkit
// family reads plugins/.

export function jarIsModLoader(jar, loader) {
  const l = String(loader || '').toLowerCase();
  if (['fabric', 'quilt', 'neoforge', 'forge'].includes(l)) return true;
  const j = String(jar || '').toLowerCase();
  return /fabric|quilt|neoforge|forge/.test(j) && !/paper|spigot|bukkit|vanilla|minecraft_server/.test(j);
}

// The folder a server's own content lands in: 'mods' or 'plugins'.
export function serverAddonKind(server) {
  if (!server) return 'plugins';
  return jarIsModLoader(server.jar, server.loader) ? 'mods' : 'plugins';
}
