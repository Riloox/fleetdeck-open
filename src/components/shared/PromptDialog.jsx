import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/context/I18nContext';

// A small text-input dialog that replaces the browser's native prompt().
// Submits the trimmed value (Enter or the confirm button); empty is ignored.
export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  placeholder,
  defaultValue = '',
  confirmLabel,
  onSubmit,
}) {
  const t = useT();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const submit = (e) => {
    e?.preventDefault?.();
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="space-y-2">
            {label && <label className="block text-xs text-muted-foreground">{label}</label>}
            <Input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="default" disabled={!value.trim()}>{confirmLabel || t('common.confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
