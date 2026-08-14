import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';
import { cn, fmtBytesRaw } from '@/lib/utils';
import { History, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

// "History" dropdown in the card header. Lists the .bak snapshots for the
// currently-selected config file (newest first) and lets the user restore
// any of them through a confirm dialog. The dropdown also re-fetches after
// every save (caller bumps a `refreshKey` for that).

function relTime(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0 || Number.isNaN(then)) return '-';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function HistoryDropdown({ file, refreshKey, onRestored }) {
  const api = useApi();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setLoading(true);
    api(`/api/configs/${encodeURIComponent(file)}/backups`)
      .then((d) => { if (!cancelled) setBackups(d.backups || []); })
      .catch(() => { if (!cancelled) setBackups([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, file, refreshKey]);

  async function doRestore(backupName) {
    try {
      const r = await api(`/api/configs/${encodeURIComponent(file)}/restore`, {
        method: 'POST',
        body: { backup: backupName },
      });
      toast.success(t('configs.historyRestoredToast', { backup: backupName }));
      onRestored?.(r.content);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <Button variant="glass" size="sm">
            <History className="h-3.5 w-3.5" />
            {t('configs.historyTitle')}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-[260px] max-w-[360px] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur-md"
          >
            {loading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t('common.loading')}</div>
            ) : backups.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{t('configs.historyEmpty')}</div>
            ) : (
              backups.map((b) => (
                <DropdownMenu.Item
                  key={b.name}
                  onSelect={(e) => { e.preventDefault(); setPending(b.name); }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs outline-none',
                    'data-[highlighted]:bg-secondary'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-label">{b.name}</div>
                    <div className="text-muted-foreground text-label mt-0.5">
                      {relTime(b.mtime)} · {fmtBytesRaw(b.size)}
                    </div>
                  </div>
                </DropdownMenu.Item>
              ))
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={t('configs.historyConfirmTitle', { file })}
        description={pending ? t('configs.historyConfirmBody', { backup: pending }) : ''}
        confirmLabel={t('configs.historyRestore')}
        onConfirm={() => doRestore(pending)}
      />
    </>
  );
}
