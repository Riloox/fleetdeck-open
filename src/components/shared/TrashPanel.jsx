import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { fmtBytes } from '@/lib/utils';

/*
 * Trash is where a "delete" actually goes. Restoring is one click; deleting
 * permanently is a separate, explicitly confirmed action - the two are never
 * the same button.
 */
export function TrashPanel({ onRestored }) {
  const api = useApi();
  const t = useT();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [purging, setPurging] = useState(null);

  const load = useCallback(async () => {
    try { setState(await api('/api/trash', { serverScoped: false })); }
    catch (error) { toast.error(error.message); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function restore(entry) {
    setBusy(true);
    try {
      await api(`/api/trash/${entry.id}/restore`, { method: 'POST', serverScoped: false });
      toast.success(t('portability.restored'));
      await load();
      onRestored?.();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); }
  }

  async function purge(entry) {
    setBusy(true);
    try {
      await api(`/api/trash/${entry.id}`, { method: 'DELETE', serverScoped: false });
      toast.success(t('portability.purged'));
      await load();
    } catch (error) { toast.error(error.message); }
    finally { setBusy(false); setPurging(null); }
  }

  if (!state || !state.entries.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('portability.trashTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert variant="info">{t('portability.trashNote', { days: state.retentionDays })}</Alert>
        {state.entries.length === 0 ? (
          <EmptyState message={t('portability.trashEmpty')} />
        ) : (
          <div className="space-y-2">
            {state.entries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{entry.label}</span>
                    <Badge variant={entry.restorable ? 'softSuccess' : 'softWarn'} className="text-label">
                      {t(entry.restorable ? 'portability.restorable' : 'portability.notRestorable')}
                    </Badge>
                  </div>
                  <div className="truncate text-label text-muted-foreground">{entry.originalPath}</div>
                  <div className="text-label text-muted-foreground">
                    {fmtBytes(entry.sizeBytes)} · {t('portability.trashedAt', { date: new Date(entry.trashedAt).toLocaleString() })}
                    {' · '}{t('portability.expiresAt', { date: new Date(entry.expiresAt).toLocaleDateString() })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="glass" size="sm" disabled={busy || !entry.restorable} onClick={() => restore(entry)}>
                    <RotateCcw className="h-3.5 w-3.5" />{t('portability.restore')}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPurging(entry)}>
                    <Trash2 className="h-3.5 w-3.5 text-status-error" />{t('portability.purge')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!purging}
        onOpenChange={(value) => { if (!value) setPurging(null); }}
        title={t('portability.purgeTitle')}
        description={t('portability.purgeBody', { name: purging?.label || '' })}
        confirmLabel={t('portability.purge')}
        destructive
        onConfirm={() => purge(purging)}
      />
    </Card>
  );
}
