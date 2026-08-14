import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, History, RotateCcw, Search, Shield, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/shared/Loading';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { RestartBanner } from '@/components/configs/RestartBanner';

const CATEGORIES = ['server', 'gameplay', 'combat', 'world', 'network'];

function fieldLabel(t, key) {
  const translated = t(`palworldSettings.fields.${key}`);
  return translated === `palworldSettings.fields.${key}` ? key : translated;
}

function displayValue(value, t) {
  if (value === null || value === undefined || value === '') return t('palworldSettings.notKnown');
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  return String(value);
}

function FieldControl({ field, value, onChange, t }) {
  if (field.type === 'boolean') {
    return (
      <label className="flex h-11 items-center gap-3 rounded-sm border border-input bg-background px-3 text-sm">
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onChange(Boolean(checked))} />
        <span>{value ? t('palworldSettings.enabled') : t('palworldSettings.disabled')}</span>
      </label>
    );
  }
  if (field.options) {
    return (
      <NativeSelect
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        options={field.options.map((option) => ({ value: option, label: option }))}
      />
    );
  }
  return (
    <Input
      type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
      min={field.min ?? undefined}
      max={field.max ?? undefined}
      step={field.type === 'integer' ? 1 : (field.type === 'number' ? 0.1 : undefined)}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function PalworldSettingsEditor() {
  const api = useApi();
  const t = useT();
  const [data, setData] = useState(null);
  const [patch, setPatch] = useState({});
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [restoreId, setRestoreId] = useState(null);
  const [restartRequired, setRestartRequired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api('/api/palworld/settings');
      setData(next);
      setRestartRequired(next.restartRequired);
      setPatch({});
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const issues = useMemo(() => {
    if (!data) return [];
    const byKey = new Map(data.fields.map((field) => [field.key, field]));
    return Object.entries(patch).flatMap(([key, raw]) => {
      if (raw === null) return [];
      const field = byKey.get(key);
      const value = field.type === 'integer' || field.type === 'number' ? Number(raw) : raw;
      if ((field.type === 'integer' && !Number.isInteger(value)) || (field.type === 'number' && !Number.isFinite(value))) {
        return [{ key, message: t('palworldSettings.invalidNumber') }];
      }
      if (field.min != null && value < field.min) return [{ key, message: t('palworldSettings.minimum', { value: field.min }) }];
      if (field.max != null && value > field.max) return [{ key, message: t('palworldSettings.maximum', { value: field.max }) }];
      return [];
    });
  }, [data, patch, t]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.fields.filter((field) => {
      if (changedOnly && !(field.key in patch)) return false;
      return !needle || field.key.toLowerCase().includes(needle) || fieldLabel(t, field.key).toLowerCase().includes(needle);
    });
  }, [data, patch, query, changedOnly, t]);

  async function openPreview() {
    try {
      const result = await api('/api/palworld/settings/preview', {
        method: 'POST',
        body: { revision: data.revision, patch },
      });
      setPreview(result);
      setPreviewOpen(true);
    } catch (error) {
      toast.error(error.message);
      if (/changed/i.test(error.message)) load();
    }
  }

  async function apply() {
    try {
      const result = await api('/api/palworld/settings', {
        method: 'PUT',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: { revision: data.revision, previewToken: preview.previewToken },
      });
      setPreviewOpen(false);
      setRestartRequired(result.restartRequired);
      toast.success(t('palworldSettings.saved'));
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function openHistory() {
    try {
      const result = await api('/api/palworld/settings/history');
      setHistory(result.history || []);
      setHistoryOpen(true);
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function restore() {
    try {
      await api(`/api/palworld/settings/history/${encodeURIComponent(restoreId)}/restore`, { method: 'POST' });
      setRestoreId(null);
      setHistoryOpen(false);
      setRestartRequired(true);
      toast.success(t('palworldSettings.restored'));
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  }

  if (loading && !data) {
    return <Loading />;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {restartRequired && <RestartBanner file={data.file} onDismiss={() => setRestartRequired(false)} />}
      {!data.editable && (
        <Alert variant="error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{t('palworldSettings.rawRequired')}</p>
            <p className="mt-1 opacity-80">{data.errors.join(' ')}</p>
          </div>
        </Alert>
      )}
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('palworldSettings.search')}
            className="pl-9"
          />
        </div>
        <label className="flex h-11 items-center gap-2 border border-border px-3 text-xs font-semibold uppercase tracking-wide">
          <Checkbox checked={changedOnly} onCheckedChange={setChangedOnly} />
          {t('palworldSettings.changedOnly')}
        </label>
        <Button variant="glass" onClick={openHistory}><History className="h-4 w-4" />{t('configs.historyTitle')}</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={data.editable ? 'online' : 'destructive'}>
          {data.editable ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {data.editable ? t('palworldSettings.syntaxValid') : t('palworldSettings.syntaxInvalid')}
        </Badge>
        <span>{t('palworldSettings.schema', { version: data.schemaVersion })}</span>
        <span>·</span>
        <span>{t('palworldSettings.unknownCount', { count: data.unknown.length })}</span>
        <span>·</span>
        <span>{t('palworldSettings.verified', { date: data.source.verifiedAt })}</span>
      </div>
      {CATEGORIES.map((category) => {
        const fields = filtered.filter((field) => field.category === category);
        if (!fields.length) return null;
        return (
          <section key={category} className="space-y-2">
            <div className="flex items-center gap-2 border-b-2 border-border pb-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-extrabold uppercase">{t(`palworldSettings.categories.${category}`)}</h3>
              <span className="text-xs text-muted-foreground">{fields.length}</span>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => setPatch((current) => ({
                  ...current,
                  ...Object.fromEntries(data.fields.filter((field) => field.category === category).map((field) => [field.key, null])),
                }))}
              >
                <RotateCcw className="h-3 w-3" />{t('palworldSettings.resetSection')}
              </Button>
            </div>
            <div className="grid gap-2 xl:grid-cols-2">
              {fields.map((field) => {
                const changed = field.key in patch;
                const value = changed ? patch[field.key] : field.value;
                const issue = issues.find((item) => item.key === field.key);
                return (
                  <Card key={field.key} className={changed ? 'border-primary/50' : ''}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <label htmlFor={`pal-${field.key}`} className="text-sm font-semibold">{fieldLabel(t, field.key)}</label>
                          <p className="mt-0.5 text-label text-muted-foreground">{field.key}</p>
                        </div>
                        <Badge variant="starting">{t('configs.badgeRestart')}</Badge>
                      </div>
                      <div id={`pal-${field.key}`}>
                        <FieldControl field={field} value={value} onChange={(next) => setPatch((current) => ({ ...current, [field.key]: next }))} t={t} />
                      </div>
                      {issue && <p className="text-xs text-status-error">{issue.message}</p>}
                      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-label">
                        <div>
                          <span className="block uppercase tracking-wide text-muted-foreground">{t('palworldSettings.current')}</span>
                          <span className="tabular-nums">{displayValue(field.value, t)}</span>
                        </div>
                        <div>
                          <span className="block uppercase tracking-wide text-muted-foreground">{t('palworldSettings.effective')}</span>
                          <span className="tabular-nums">{displayValue(field.effectiveValue, t)}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label text-muted-foreground">{t('palworldSettings.officialSource')}</span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPatch((current) => ({ ...current, [field.key]: null }))}
                          disabled={field.state === 'inherited' && !changed}
                        >
                          <RotateCcw className="h-3 w-3" />{t('palworldSettings.inherit')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
      {data.unknown.length > 0 && (
        <Alert variant="info">
          <Shield className="h-4 w-4 shrink-0" />
          <span>{t('palworldSettings.unknownPreserved', { count: data.unknown.length })}</span>
        </Alert>
      )}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 border-2 border-border bg-card p-3">
        <div className="text-xs">
          <strong>{Object.keys(patch).length}</strong> {t('palworldSettings.pending')}
          {issues.length > 0 && <span className="ml-2 text-status-error">{t('palworldSettings.issueCount', { count: issues.length })}</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="glass" onClick={() => setPatch({})} disabled={!Object.keys(patch).length}>{t('configs.resetChanges')}</Button>
          <Button onClick={openPreview} disabled={!data.editable || !Object.keys(patch).length || issues.length > 0}>{t('palworldSettings.review')}</Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{t('palworldSettings.previewTitle')}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            {preview?.changes.map((change) => (
              <div key={change.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border py-2 text-sm">
                <div><span className="block text-label uppercase text-muted-foreground">{t('palworldSettings.before')}</span><code>{displayValue(change.before, t)}</code></div>
                <span>→</span>
                <div><span className="block text-label uppercase text-muted-foreground">{t('palworldSettings.after')}</span><code>{displayValue(change.after, t)}</code></div>
                <strong className="col-span-3">{fieldLabel(t, change.key)}</strong>
              </div>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="glass" onClick={() => setPreviewOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={apply}>{t('palworldSettings.apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('palworldSettings.historyTitle')}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2">
            {history.length === 0 ? <p className="text-sm text-muted-foreground">{t('configs.historyEmpty')}</p> : history.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setRestoreId(entry.id)} className="w-full border border-border p-3 text-left hover:bg-secondary">
                <span className="block text-sm font-semibold">{new Date(entry.createdAt).toLocaleString()}</span>
                <span className="text-label text-muted-foreground">{entry.id}</span>
              </button>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(restoreId)}
        onOpenChange={(open) => { if (!open) setRestoreId(null); }}
        title={t('palworldSettings.restoreTitle')}
        description={t('palworldSettings.restoreDescription')}
        confirmLabel={t('configs.historyRestore')}
        onConfirm={restore}
      />
    </div>
  );
}
