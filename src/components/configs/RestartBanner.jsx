import { useState } from 'react';
import { useT } from '@/context/I18nContext';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

// Top-of-card banner that appears after a config save to remind the user
// to restart. "Restart now" calls the existing /api/server/restart action
// (the same one the header Restart button uses). On success the banner
// auto-dismisses; on failure the error is shown but the banner stays.

export function RestartBanner({ file, onDismiss }) {
  const t = useT();
  const api = useApi();
  const [busy, setBusy] = useState(false);

  async function restart() {
    setBusy(true);
    try {
      await api('/api/server/restart', { method: 'POST' });
      toast.success(t('configs.restartSuccessToast'));
      onDismiss?.();
    } catch (e) {
      toast.error(t('configs.restartErrorToast', { error: e.message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Alert variant="warn" className="mb-4 items-center">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-xs font-semibold">
          {t('configs.bannerRestart', { file })}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <Button
          variant="default"
          size="xs"
          onClick={restart}
          disabled={busy}
        >
          <RefreshCw className={busy ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          {t('configs.bannerRestartNow')}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onDismiss}
          aria-label={t('configs.bannerDismiss')}
          title={t('configs.bannerDismiss')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Alert>
  );
}
