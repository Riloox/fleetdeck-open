import { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useServer } from '@/context/ServerContext';
import { StatusDot } from '@/components/shared/StatusPill';
import { useT } from '@/context/I18nContext';
import { cn, fmtUptime } from '@/lib/utils';
import { gameForServer } from '@/lib/games';

function serverStatus(server, statuses) {
  const raw = statuses[server.id] || server.status;
  if (typeof raw === 'string') return { status: raw };
  return raw || { status: 'offline', playerCount: 0, maxPlayers: 0 };
}

function statusLabel(t, status) {
  const key = `status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

export function ServerSelector({ onSwitch, placement = 'bottom' }) {
  const { servers, activeServerId, statuses, currentGame } = useServer();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc); };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const active = servers.find(s => s.id === activeServerId);
  const opensUp = placement === 'top';
  const normalizedQuery = query.trim().toLowerCase();
  const filteredServers = useMemo(() => {
    const gameServers = currentGame ? servers.filter(server => gameForServer(server) === currentGame) : servers;
    if (!normalizedQuery) return gameServers;
    return gameServers.filter(s => {
      const st = serverStatus(s, statuses).status || 'offline';
      return [
        s.name,
        s.mcVersion,
        s.type,
        statusLabel(t, st),
      ].filter(Boolean).some(value => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [normalizedQuery, servers, statuses, t, currentGame]);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm border border-border/60 bg-secondary/40 hover:bg-secondary',
          'transition-colors max-w-[320px] font-medium'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active && <StatusDot status={serverStatus(active, statuses).status || 'offline'} />}
        <span className="truncate text-foreground" title={active?.name || undefined}>{active ? active.name : t('serverSelector.noServers')}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute left-0 w-[280px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover shadow-xl z-50',
            'animate-in fade-in-0 zoom-in-95',
            opensUp
              ? 'bottom-full mb-2 slide-in-from-bottom-2'
              : 'top-full mt-1 slide-in-from-top-2'
          )}
        >
          {servers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{t('serverSelector.noServers')}</div>
          ) : (
            <>
              <div className="border-b border-border/60 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('serverSelector.searchPlaceholder')}
                    className="h-8 w-full rounded-md border border-input bg-background/60 pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring/50"
                  />
                </div>
              </div>
              <div role="listbox" className="max-h-72 overflow-y-auto py-1">
                {filteredServers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{t('serverSelector.noResults')}</div>
                ) : filteredServers.map(s => {
                  const status = serverStatus(s, statuses);
                  const st = status.status || 'offline';
                  const running = st !== 'offline';
                  const isActive = s.id === activeServerId;
                  const meta = [
                    statusLabel(t, st),
                    running ? `${status.playerCount || 0}/${status.maxPlayers || '?'}` : null,
                    running ? fmtUptime(status.uptimeMs) : null,
                    s.mcVersion,
                  ].filter(Boolean);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => { setOpen(false); if (!isActive) onSwitch(s.id); }}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                        isActive ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-secondary'
                      )}
                    >
                      <StatusDot status={st} className="mt-1.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className={cn('block truncate text-xs', isActive ? 'text-primary/75' : 'text-muted-foreground')}>
                          {meta.join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
