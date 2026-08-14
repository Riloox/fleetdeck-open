import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';

export const PALWORLD_MESSAGE_LIMIT = 512;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function PalworldAnnouncementDialog({ open, onOpenChange, disabled = false }) {
  const api = useApi();
  const t = useT();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const hasControls = CONTROL_RE.test(message);
  const valid = message.trim() && message.length <= PALWORLD_MESSAGE_LIMIT && !hasControls;

  async function send() {
    if (!valid || sending || disabled) return;
    setSending(true);
    try {
      const result = await api('/api/palworld/announcements', { method: 'POST', body: { message } });
      toast.success(result.accepted ? t('palworld.announcementAccepted') : t('palworld.announcementFailed'));
      setMessage('');
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            {t('palworld.announcementTitle')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <label htmlFor="palworld-announcement" className="mb-2 block text-xs font-semibold text-foreground">
              {t('palworld.announcementMessage')}
            </label>
            <Textarea
              id="palworld-announcement"
              autoFocus
              value={message}
              maxLength={PALWORLD_MESSAGE_LIMIT + 1}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('palworld.announcementPlaceholder')}
              aria-describedby="palworld-announcement-help"
            />
            <div id="palworld-announcement-help" className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
              <span className={hasControls ? 'text-status-error' : ''}>
                {hasControls ? t('palworld.controlCharacters') : t('palworld.announcementLimit', { limit: PALWORLD_MESSAGE_LIMIT })}
              </span>
              <span className="shrink-0 tabular-nums">{message.length}/{PALWORLD_MESSAGE_LIMIT}</span>
            </div>
          </div>
          <div className="border border-border bg-secondary/30 p-3">
            <p className="mb-1 text-label font-semibold uppercase tracking-wider text-muted-foreground">
              {t('palworld.preview')}
            </p>
            <p className="min-h-5 whitespace-pre-wrap break-words text-sm text-foreground">
              {message || t('palworld.previewEmpty')}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={!valid || sending || disabled} onClick={send}>
            <Megaphone className="h-4 w-4" />
            {sending ? t('palworld.sending') : t('palworld.sendAnnouncement')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
