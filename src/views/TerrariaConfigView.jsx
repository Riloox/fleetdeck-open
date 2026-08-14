import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Eye, FileCode2, History, RotateCcw, Search, Shield, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Loading } from '@/components/shared/Loading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfigRaw } from '@/components/configs/ConfigRaw';
import { RestartBanner } from '@/components/configs/RestartBanner';
import { DiffPreview } from '@/components/configs/DiffPreview';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const GROUPS = ['network', 'world', 'presentation', 'moderation', 'performance'];

function label(t, key) {
  const value = t(`terraria.config.fields.${key}`);
  return value === `terraria.config.fields.${key}` ? key : value;
}

function FieldControl({ field, value, onChange, t }) {
  const id = `terraria-config-${field.key}`;
  if (field.secret) {
    return (
      <div className="flex items-center gap-2">
        <Input id={id} type="password" value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={field.isSet ? t('terraria.config.passwordSet') : t('terraria.config.passwordNotSet')} />
        {field.isSet && <Button variant="glass" onClick={() => onChange(null)}>{t('terraria.config.clear')}</Button>}
      </div>
    );
  }
  if (field.type === 'boolean') {
    const checked = ['1', 'true', true].includes(value);
    return <label className="flex h-11 items-center gap-3 border border-input bg-background px-3"><Checkbox checked={checked} onCheckedChange={(next) => onChange(Boolean(next))} />{checked ? t('common.yes') : t('common.no')}</label>;
  }
  if (field.constraints?.options) {
    return <NativeSelect id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} options={field.constraints.options.map((option) => ({ value: option, label: t(`terraria.config.options.${field.key}.${option}`) }))} />;
  }
  return <Input id={id} type={field.type === 'integer' ? 'number' : 'text'} min={field.constraints?.min} max={field.constraints?.max} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={field.managedBy === 'worlds'} />;
}

export function TerrariaConfigView() {
  const api = useApi();
  const t = useT();
  const [data, setData] = useState(null);
  const [patch, setPatch] = useState({});
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [restoreId, setRestoreId] = useState(null);
  const [rawFile, setRawFile] = useState('serverconfig.txt');
  const [raw, setRaw] = useState(null);
  const [rawOriginal, setRawOriginal] = useState('');
  const [rawPreviewOpen, setRawPreviewOpen] = useState(false);
  const [rawError, setRawError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api('/api/terraria/config'));
      setPatch({});
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const loadRaw = useCallback(async (file) => {
    setRawError('');
    try {
      const result = await api(`/api/terraria/config/raw?file=${encodeURIComponent(file)}`);
      setRaw(result);
      setRawOriginal(result.content);
    }
    catch (error) { setRaw(null); setRawError(error.message); }
  }, [api]);

  useEffect(() => { if (data?.files?.includes(rawFile)) loadRaw(rawFile); }, [data, rawFile, loadRaw]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.fields || []).filter((field) => {
      if (changedOnly && !(field.key in patch)) return false;
      return !needle || field.key.toLowerCase().includes(needle) || label(t, field.key).toLowerCase().includes(needle);
    });
  }, [data, patch, query, changedOnly, t]);

  async function review() {
    try {
      setPreview(await api('/api/terraria/config/preview', { method: 'POST', body: { revision: data.revision, changes: patch } }));
    } catch (error) { toast.error(error.message); }
  }

  async function apply() {
    try {
      await api('/api/terraria/config', {
        method: 'PUT', headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { revision: data.revision, previewToken: preview.previewToken },
      });
      setPreview(null);
      toast.success(t('terraria.config.saved'));
      await load();
    } catch (error) { toast.error(error.message); }
  }

  async function openHistory() {
    try { setHistory((await api('/api/terraria/config/history')).history || []); }
    catch (error) { toast.error(error.message); }
  }

  async function restore() {
    try {
      await api(`/api/terraria/config/history/${encodeURIComponent(restoreId)}/restore`, { method: 'POST' });
      setRestoreId(null);
      toast.success(t('terraria.config.restored'));
      await load();
    } catch (error) { toast.error(error.message); }
  }

  async function saveRaw() {
    setRawError('');
    try {
      const result = await api('/api/terraria/config/raw', { method: 'PUT', body: { file: raw.file, revision: raw.revision, content: raw.content } });
      setRaw((current) => ({ ...current, revision: result.revision }));
      setRawOriginal(raw.content);
      setRawPreviewOpen(false);
      toast.success(t('terraria.config.saved'));
      await load();
    } catch (error) { setRawError(error.message); }
  }

  if (loading && !data) return <Loading />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {data.restartRequired && <RestartBanner file={data.file} />}
      {!data.editable && <Alert variant="error"><AlertTriangle className="h-4 w-4" /><div><strong>{t('terraria.config.duplicates')}</strong><p>{data.errors.join(' ')}</p></div></Alert>}
      <Tabs defaultValue="friendly">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <TabsList><TabsTrigger value="friendly"><SlidersHorizontal className="mr-2 h-4 w-4" />{t('terraria.config.friendly')}</TabsTrigger><TabsTrigger value="raw"><FileCode2 className="mr-2 h-4 w-4" />{t('terraria.config.raw')}</TabsTrigger><TabsTrigger value="history" onClick={openHistory}><History className="mr-2 h-4 w-4" />{t('terraria.config.history')}</TabsTrigger></TabsList>
          <Badge variant={data.editable ? 'online' : 'destructive'}>{data.editable ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{data.editable ? t('terraria.config.valid') : t('terraria.config.needsRepair')}</Badge>
        </div>

        <TabsContent value="friendly" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1"><label htmlFor="terraria-config-search" className="sr-only">{t('terraria.config.search')}</label><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input id="terraria-config-search" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('terraria.config.search')} /></div>
            <label className="flex h-11 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wide"><Checkbox checked={changedOnly} onCheckedChange={setChangedOnly} />{t('terraria.config.changedOnly')}</label>
          </div>
          {GROUPS.map((group) => {
            const fields = filtered.filter((field) => field.group === group);
            if (!fields.length) return null;
            return (
              <section key={group}>
                <div className="mb-2 flex items-center border-b-2 border-border pb-2"><h3 className="font-display text-sm font-extrabold uppercase">{t(`terraria.config.groups.${group}`)}</h3><span className="ml-2 text-xs text-muted-foreground">{fields.length}</span><Button className="ml-auto" variant="ghost" size="xs" onClick={() => setPatch((current) => ({ ...current, ...Object.fromEntries(fields.filter((field) => !field.managedBy).map((field) => [field.key, field.defaultValue])) }))}><RotateCcw className="h-3 w-3" />{t('terraria.config.resetGroup')}</Button></div>
                <div className="grid gap-2 xl:grid-cols-2">
                  {fields.map((field) => {
                    const changed = field.key in patch;
                    return <Card key={field.key} className={changed ? 'border-primary/50' : ''}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between"><div><label htmlFor={`terraria-config-${field.key}`} className="font-semibold">{label(t, field.key)}</label><p className="text-label text-muted-foreground">{field.key} · {field.file}</p></div><Badge variant="starting">{t('configs.badgeRestart')}</Badge></div><FieldControl field={field} value={changed ? patch[field.key] : (field.secret ? '' : field.value)} onChange={(value) => setPatch((current) => ({ ...current, [field.key]: value }))} t={t} />{field.managedBy && <p className="text-xs text-status-warn">{t('terraria.config.worldsManaged')}</p>}<div className="flex items-center justify-between border-t border-border pt-2 text-label text-muted-foreground"><span>{t('terraria.config.default')}: <code>{field.defaultValue ?? t('terraria.config.notAvailable')}</code></span><Button variant="ghost" size="xs" disabled={field.managedBy || field.defaultValue == null} onClick={() => setPatch((current) => ({ ...current, [field.key]: field.defaultValue }))}><RotateCcw className="h-3 w-3" />{t('terraria.config.reset')}</Button></div></CardContent></Card>;
                  })}
                </div>
              </section>
            );
          })}
          {data.unknown.length > 0 && <Alert variant="info"><Shield className="h-4 w-4" />{t('terraria.config.other', { count: data.unknown.length })}: {data.unknown.map((item) => item.key).join(', ')}</Alert>}
          <div className="sticky bottom-3 flex items-center justify-between border-2 border-border bg-card p-3"><span className="text-xs">{t('terraria.config.pending', { count: Object.keys(patch).length })}</span><div className="flex gap-2"><Button variant="glass" onClick={() => setPatch({})}>{t('configs.resetChanges')}</Button><Button onClick={review} disabled={!data.editable || !Object.keys(patch).length}><Eye className="h-4 w-4" />{t('terraria.config.review')}</Button></div></div>
        </TabsContent>

        <TabsContent value="raw">
          <div className="mb-3 flex flex-wrap gap-2">{data.files.map((file) => <Button key={file} variant={rawFile === file ? 'default' : 'glass'} onClick={() => setRawFile(file)}>{file}</Button>)}</div>
          {raw ? <><ConfigRaw value={raw.content} filename={raw.file} onChange={(content) => setRaw((current) => ({ ...current, content }))} onValidation={() => {}} /><div className="mt-3 flex justify-end"><Button onClick={() => setRawPreviewOpen(true)} disabled={raw.content === rawOriginal}>{t('terraria.config.review')}</Button></div></> : <Alert variant="info">{rawError}</Alert>}
          {rawError && raw && <Alert className="mt-3" variant="error"><AlertTriangle className="h-4 w-4" />{rawError}</Alert>}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {!history.length ? <p className="text-sm text-muted-foreground">{t('configs.historyEmpty')}</p> : history.map((entry) => <button key={entry.id} type="button" className="flex w-full items-center justify-between border border-border p-3 text-left hover:bg-secondary" onClick={() => setRestoreId(entry.id)}><span><strong className="block">{new Date(entry.createdAt).toLocaleString()}</strong><span className="text-xs text-muted-foreground">{entry.changedKeys.join(', ') || entry.reason}</span></span><RotateCcw className="h-4 w-4" /></button>)}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{t('terraria.config.previewTitle')}</DialogTitle></DialogHeader><DialogBody>{preview?.changes.map((change) => <div key={change.key} className="grid grid-cols-[1fr_auto_1fr] gap-3 border-b border-border py-3"><code>{change.secret ? t('terraria.config.redacted') : (change.before ?? '—')}</code><span>→</span><code>{change.secret ? t('terraria.config.redacted') : (change.after ?? '—')}</code><strong className="col-span-3">{label(t, change.key)}</strong></div>)}</DialogBody><DialogFooter><Button variant="glass" onClick={() => setPreview(null)}>{t('common.cancel')}</Button><Button onClick={apply}>{t('terraria.config.apply')}</Button></DialogFooter></DialogContent></Dialog>
      <ConfirmDialog open={Boolean(restoreId)} onOpenChange={(open) => { if (!open) setRestoreId(null); }} title={t('terraria.config.restoreTitle')} description={t('terraria.config.restoreHelp')} confirmLabel={t('configs.historyRestore')} onConfirm={restore} />
      <DiffPreview open={rawPreviewOpen} onOpenChange={setRawPreviewOpen} before={rawOriginal} after={raw?.content || ''} filename={raw?.file || ''} onConfirm={saveRaw} />
    </div>
  );
}
