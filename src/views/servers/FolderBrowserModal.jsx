import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApi } from '@/hooks/useApi';
import { useT } from '@/context/I18nContext';

export function FolderBrowserModal({ open, onOpenChange, onSelect, initial = '' }) {
  const api = useApi();
  const t = useT();
  const [current, setCurrent] = useState('');
  const [entries, setEntries] = useState({ path: '', dirs: [], drives: [], jars: [] });

  useEffect(() => { if (open) navigate(initial); }, [open]);

  async function navigate(target) {
    try {
      const data = await api(`/api/fs?path=${encodeURIComponent(target)}`);
      setCurrent(data.path || '');
      setEntries(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  function joinPath(base, name) {
    if (!base) return name;
    return base.replace(/[\\/]+$/, '') + (entries.sep || '/') + name;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('servers.pickFolderTitle')}</DialogTitle></DialogHeader>
        <div className="px-5 pt-2 pb-0">
          <p className="text-xs text-muted-foreground mb-3 truncate">{current || t('servers.thisPcDrives')}</p>
          <div className="border border-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
            {entries.path && <button type="button" onClick={() => navigate(entries.parent || '')} className="flex w-full px-3 py-2 text-sm text-muted-foreground hover:bg-secondary border-b border-border">{t('servers.up')}</button>}
            {(entries.drives || []).map((drive) => <button key={drive} type="button" onClick={() => navigate(drive)} className="flex w-full px-3 py-2 text-sm hover:bg-secondary border-b border-border">💽 {drive}</button>)}
            {(entries.dirs || []).map((dir) => <button key={dir} type="button" onClick={() => navigate(joinPath(entries.path, dir))} className="flex w-full px-3 py-2 text-sm hover:bg-secondary border-b border-border">📁 {dir}</button>)}
          </div>
          {!!entries.jars?.length && <p className="mt-2 text-xs text-muted-foreground">{t('servers.jarsHere', { list: entries.jars.join(', ') })}</p>}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => {
            if (!current) return toast.error(t('servers.navigateFirst'));
            onSelect(current, entries.jars || []);
            onOpenChange(false);
          }}>{t('servers.useThisFolder')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
