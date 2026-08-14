import { useT } from '@/context/I18nContext';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ErrorState({ error, onRetry, action, compact = false, className = '' }) {
  const t = useT();
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? 'py-6' : 'py-10'} ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-error/15 text-status-error">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="text-sm text-foreground">{t('common.loadFailed')}</p>
      {error && <p className="text-xs text-status-error/80 max-w-xs">{error}</p>}
      {onRetry && (
        <Button variant="glass" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
      {action}
    </div>
  );
}

export { ErrorState };
