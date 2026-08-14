import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ViewHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Loading } from '@/components/shared/Loading';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT, useI18n } from '@/context/I18nContext';
import { serverAddonKind } from '@/lib/compat';
import { fmtBytes } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Upload, Package } from 'lucide-react';
import { PalworldModsView } from '@/views/PalworldModsView';

const HINT_EM = {
  en: 'restart the server',
  es: 'reinicia el servidor',
};

export function AddonsView() {
  const api = useApi();
  const t = useT();
  const { lang } = useI18n();
  const { servers, activeServerId } = useServer();
  const [kind, setKind] = useState(null);
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const activeServer = useMemo(
    () => servers.find(s => s.id === activeServerId) || null,
    [servers, activeServerId]
  );
  // Start on whichever folder this server actually loads from, but leave the
  // other tab reachable: a folder can hold leftovers after a loader change.
  // Palworld has its own package model (paks, script mods, frameworks); the
  // jar-folder view does not apply to it.
  const isPalworld = activeServer?.type === 'palworld';
  const defaultKind = serverAddonKind(activeServer);
  const currentKind = kind || defaultKind;

  useEffect(() => { setKind(null); }, [activeServerId]);

  async function load(k = currentKind) {
    setLoading(true);
    setError('');
    try {
      const { addons: list } = await api(`/api/addons?kind=${k}`);
      setAddons(list);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { if (!isPalworld) load(currentKind); }, [currentKind, activeServerId, isPalworld]);

  async function deleteAddon(name) {
    try {
      await api(`/api/addons/${encodeURIComponent(name)}?kind=${currentKind}`, { method: 'DELETE' });
      toast.success(t('minecraft.addons.deletedToast'));
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('addon', file);
    try {
      await api(`/api/addons/upload?kind=${currentKind}`, { method: 'POST', body: fd });
      toast.success(t('minecraft.addons.uploadedToast'));
      load();
    } catch (e) { toast.error(e.message); }
    e.target.value = '';
  }

  const isMods = currentKind === 'mods';

  const hint = (() => {
    const h = t('minecraft.addons.hint', { folder: currentKind });
    const tag = HINT_EM[lang] || HINT_EM.en;
    const i = h.toLowerCase().indexOf(tag);
    if (i < 0) return h;
    return <>{h.slice(0, i)}<strong className="text-foreground">{h.slice(i, i + tag.length)}</strong>{h.slice(i + tag.length)}</>;
  })();

  if (isPalworld) return <PalworldModsView />;

  return (
    <>
      <div className="space-y-6">
        <ViewHeader
          title={t('minecraft.addons.title')}
          description={hint}
          actions={
            <>
              <Button variant="default" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  {t('minecraft.addons.uploadJar')}
                  <input type="file" accept=".jar" hidden onChange={upload} />
                </label>
              </Button>
              <Button variant="glass" size="icon-sm" onClick={() => load()} aria-label={t('common.refresh')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </>
          }
        />

        <Tabs value={currentKind} onValueChange={setKind}>
          <TabsList>
            <TabsTrigger value="plugins">{t('minecraft.addons.tabPlugins')}</TabsTrigger>
            <TabsTrigger value="mods">{t('minecraft.addons.tabMods')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load()} />
        ) : addons.length === 0 ? (
          <Card><CardContent className="py-4"><EmptyState icon={Package} title={t('minecraft.addons.title')} message={isMods ? t('minecraft.addons.emptyMods') : t('minecraft.addons.emptyPlugins')} /></CardContent></Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t('minecraft.addons.title')}</TableHead>
                  <TableHead className="text-right">{t('common.size')}</TableHead>
                  <TableHead className="pr-5 text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map(a => (
                  <TableRow key={a.name}>
                    <TableCell className="pl-5">
                      <span className="inline-flex items-center gap-2.5 font-medium text-foreground">
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{fmtBytes(a.size)}</TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button variant="ghost" size="icon-xs" onClick={() => setPendingDelete(a.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={isMods ? t('minecraft.addons.deleteTitleMod') : t('minecraft.addons.deleteTitlePlugin')}
        description={pendingDelete ? t('minecraft.addons.deleteBody', { name: pendingDelete }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => deleteAddon(pendingDelete)}
      />
    </>
  );
}
