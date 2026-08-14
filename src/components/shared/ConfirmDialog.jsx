import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/context/I18nContext';

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, destructive = false }) {
  const t = useT();
  const label = confirmLabel != null ? confirmLabel : t('common.confirm');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className={cn('flex items-center gap-2', destructive && 'text-status-error')}>
            {destructive && <AlertTriangle className="h-4 w-4" />}
            {title}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm text-muted-foreground">{description}</DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => { onConfirm(); onOpenChange(false); }}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
