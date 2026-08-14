import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/context/I18nContext';
import { Sparkles } from 'lucide-react';

export function FirstStartDialog({ open, onOpenChange, serverName, starting, onStartNow, onContinueAnyway }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('firstStart.title')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm text-muted-foreground">
          {t('firstStart.description', { name: serverName || '' })}
        </DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={onContinueAnyway} disabled={starting}>
            {t('firstStart.continueAnyway')}
          </Button>
          <Button onClick={onStartNow} disabled={starting}>
            {t('firstStart.startNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
