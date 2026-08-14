import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogFooter } from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { useApiStream } from '@/hooks/useApiStream';
import { useFolderPicker } from '@/hooks/useFolderPicker';
import { useT } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';
import { cn } from '@/lib/utils';
import { SERVER_NAME_MAX_LENGTH } from '@/lib/limits';
import { FolderBrowserModal } from './FolderBrowserModal';

const DEFAULTS = {
  terraria: { port: 7777, maxPlayers: 8 },
  valheim: { port: 2456, maxPlayers: 10 },
  palworld: { port: 8211, maxPlayers: 32 },
};

// One game type, three variants (docs/terraria/README.md). The wizard picks
// which one to install; the descriptor keeps it, and it cannot be changed
// afterwards, so the choice is made here with its trade-off spelled out.
const TERRARIA_VARIANTS = ['vanilla', 'tshock', 'tmodloader'];

export function GameServerWizard({ onBack, onCreated }) {
  const api = useApi();
  const stream = useApiStream();
  const t = useT();
  const { picking, pick } = useFolderPicker(api);
  const { currentGame } = useServer();
  const gameType = ['terraria', 'valheim', 'palworld'].includes(currentGame) ? currentGame : 'terraria';
  const defaults = DEFAULTS[gameType];
  const [form, setForm] = useState({
    automatic: true, gameType, type: gameType, name: '', parentDir: '', serverName: '',
    worldName: 'Dedicated', password: '', port: defaults.port, maxPlayers: defaults.maxPlayers,
    public: true, worldSize: 2, difficulty: 0, terrariaVariant: 'vanilla', versionId: '', seed: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(null);
  const [fsOpen, setFsOpen] = useState(false);
  const [versions, setVersions] = useState(null);
  const [versionsError, setVersionsError] = useState('');
  const [versionsLoading, setVersionsLoading] = useState(false);
  const field = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const phaseLabel = useMemo(() => phase ? t(`servers.installPhase.${phase}`) : '', [phase, t]);

  /*
   * The installable builds of the selected variant, resolved upstream on every
   * variant change. Unsupported entries are kept and disabled with their
   * reason: "TShock publishes no build for this architecture" is an answer, an
   * empty dropdown is not.
   */
  const loadVersions = useCallback(async (variant, force = false) => {
    setVersionsLoading(true);
    setVersionsError('');
    try {
      const data = await api(`/api/terraria/versions?variant=${encodeURIComponent(variant)}${force ? '&force=1' : ''}`);
      setVersions(data);
      const first = (data.versions || []).find((entry) => entry.supported) || null;
      setForm((current) => ({ ...current, versionId: first ? first.id : '' }));
    } catch (err) {
      setVersions(null);
      setVersionsError(err.message);
    } finally {
      setVersionsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (gameType !== 'terraria') return;
    loadVersions(form.terrariaVariant);
  }, [gameType, form.terrariaVariant, loadVersions]);

  const selectedVersion = useMemo(
    () => (versions?.versions || []).find((entry) => entry.id === form.versionId) || null,
    [versions, form.versionId],
  );
  const blocked = gameType === 'terraria' && (versionsLoading || !selectedVersion || !selectedVersion.supported);

  async function create() {
    setLoading(true);
    setError('');
    setPhase('resolving');
    try {
      await stream('/api/create', {
        body: { ...form, serverName: form.serverName || form.name },
        onEvent(event) {
          if (event.type === 'phase') setPhase(event.phase);
          if (event.type === 'progress') setProgress({ received: event.received, total: event.total });
          if (event.type === 'error') setError(event.error);
        },
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickFolder() {
    try {
      const picked = await pick(form.parentDir);
      if (picked) setForm((current) => ({ ...current, parentDir: picked }));
    } catch {
      setFsOpen(true);
    }
  }

  function versionLabel(entry) {
    const game = entry.gameVersion || t('terraria.create.versionUnknown');
    const build = t('terraria.create.versionOption', { build: entry.id, game });
    return entry.supported ? build : `${build} — ${entry.reason}`;
  }

  return <>
    <div className="px-5 py-4 space-y-4">
      <p className="text-xs text-muted-foreground">{t('servers.gameInstallIntro', { game: t(`games.${gameType}`) })}</p>
      {gameType === 'terraria' && <div className="space-y-1.5">
        <Label>{t('terraria.create.variant')}</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TERRARIA_VARIANTS.map((variant) => (
            <button
              key={variant}
              type="button"
              disabled={loading}
              aria-pressed={form.terrariaVariant === variant}
              onClick={() => setForm((current) => ({ ...current, terrariaVariant: variant, versionId: '' }))}
              className={cn(
                'rounded-md border border-input bg-background/60 px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                form.terrariaVariant === variant && 'border-primary ring-1 ring-primary',
              )}
            >
              <span className="block text-sm font-medium">{t(`terraria.variant.${variant}`)}</span>
              <span className="block text-label leading-tight text-muted-foreground">{t(`terraria.variantHint.${variant}`)}</span>
            </button>
          ))}
        </div>
      </div>}
      {gameType === 'terraria' && <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="terraria-version">{t('terraria.create.version')}</Label>
          <Button variant="glass" size="sm" type="button" disabled={loading || versionsLoading} onClick={() => loadVersions(form.terrariaVariant, true)}>
            <RefreshCw className={cn('h-3.5 w-3.5', versionsLoading && 'animate-spin')} />{t('terraria.create.checkAgain')}
          </Button>
        </div>
        <select
          id="terraria-version"
          className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 text-sm disabled:opacity-50"
          value={form.versionId}
          onChange={field('versionId')}
          disabled={loading || versionsLoading || !versions?.versions?.length}
        >
          {versionsLoading && <option value="">{t('terraria.create.versionsLoading')}</option>}
          {!versionsLoading && !versions?.versions?.length && <option value="">{t('terraria.create.versionsEmpty')}</option>}
          {(versions?.versions || []).map((entry) => (
            <option key={entry.id} value={entry.id} disabled={!entry.supported}>{versionLabel(entry)}</option>
          ))}
        </select>
        {versions?.stale && <p className="text-label text-status-warn">{versions.error || t('terraria.create.versionsStale')}</p>}
        {versionsError && <p className="text-label text-status-error">{versionsError}</p>}
        {selectedVersion && !selectedVersion.supported && <p className="text-label text-status-error">{selectedVersion.reason}</p>}
      </div>}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{t('servers.fieldName')}</Label><Input value={form.name} onChange={field('name')} maxLength={SERVER_NAME_MAX_LENGTH} disabled={loading} /></div>
        <div className="space-y-1.5"><Label>{t('servers.fieldServerName')}</Label><Input value={form.serverName} onChange={field('serverName')} placeholder={form.name || t('servers.optional')} disabled={loading} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>{t('servers.fieldParent')}</Label>
        <div className="flex gap-2"><Input value={form.parentDir} onChange={field('parentDir')} disabled={loading} className="flex-1" /><Button variant="glass" size="sm" type="button" disabled={loading || picking} className="h-11 shrink-0" onClick={pickFolder}><FolderOpen className="h-3.5 w-3.5" />{t('servers.browse')}</Button></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5"><Label>{t('servers.fieldWorldName')}</Label><Input value={form.worldName} onChange={field('worldName')} disabled={loading} /></div>
        <div className="space-y-1.5"><Label>{t('servers.fieldPort')}</Label><Input type="number" min="1" max={gameType === 'valheim' ? 65533 : (gameType === 'palworld' ? 65534 : 65535)} value={form.port} onChange={field('port')} disabled={loading} /></div>
        <div className="space-y-1.5"><Label>{t('servers.fieldMaxPlayers')}</Label><Input type="number" min="1" max={gameType === 'terraria' ? 255 : (gameType === 'valheim' ? 10 : 32)} value={form.maxPlayers} onChange={field('maxPlayers')} disabled={loading || gameType === 'valheim'} /></div>
      </div>
      <div className="space-y-1.5"><Label>{t('servers.fieldPassword')}{gameType === 'valheim' ? '' : ` (${t('servers.optional')})`}</Label><Input type="password" value={form.password} onChange={field('password')} minLength={gameType === 'valheim' ? 5 : undefined} disabled={loading} /></div>
      {gameType === 'terraria' && <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>{t('servers.fieldWorldSize')}</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.worldSize} onChange={field('worldSize')} disabled={loading}><option value="1">{t('servers.worldSmall')}</option><option value="2">{t('servers.worldMedium')}</option><option value="3">{t('servers.worldLarge')}</option></select></div>
        <div className="space-y-1.5"><Label>{t('servers.fieldDifficulty')}</Label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.difficulty} onChange={field('difficulty')} disabled={loading}><option value="0">{t('servers.difficultyClassic')}</option><option value="1">{t('servers.difficultyExpert')}</option><option value="2">{t('servers.difficultyMaster')}</option><option value="3">{t('servers.difficultyJourney')}</option></select></div>
      </div>}
      {gameType === 'terraria' && <div className="space-y-1.5">
        <Label>{t('terraria.create.seed')} ({t('servers.optional')})</Label>
        <Input value={form.seed} onChange={field('seed')} maxLength={64} disabled={loading} placeholder={t('terraria.create.seedPlaceholder')} />
      </div>}
      {gameType === 'valheim' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.public} onChange={(event) => setForm(current => ({ ...current, public: event.target.checked }))} disabled={loading} />{t('servers.fieldPublic')}</label>}
      {loading && <div className="rounded-md border border-border bg-secondary/20 p-3 text-xs"><p>{phaseLabel}</p>{progress?.total > 0 && <progress className="mt-2 w-full" max={progress.total} value={progress.received} />}</div>}
      {error && <p className="text-xs text-status-error">{error}</p>}
    </div>
    <DialogFooter><Button variant="glass" onClick={onBack} disabled={loading}>{t('common.back')}</Button><Button onClick={create} disabled={loading || blocked}>{loading ? t('servers.installingServer') : t('servers.installServer')}</Button></DialogFooter>
    <FolderBrowserModal open={fsOpen} onOpenChange={setFsOpen} initial={form.parentDir} onSelect={(parentDir) => setForm(current => ({ ...current, parentDir }))} />
  </>;
}
