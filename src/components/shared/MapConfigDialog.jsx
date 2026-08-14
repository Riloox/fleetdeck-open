import { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';
import { Check, Map } from 'lucide-react';
import { cn } from '@/lib/utils';

// Common map plugins and their default ports. Keep the host portion inferred
// from the panel so the suggestion works whether the user is on
// localhost, a LAN IP, or a reverse-proxied hostname.
function buildPreset(t, labelKey, port) {
  const origin = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return {
    key: labelKey,
    label: t(labelKey),
    url: `http://${origin}:${port}`,
  };
}

export function MapConfigDialog({ open, onOpenChange, server }) {
  const api = useApi();
  const { setServers } = useServer();
  const t = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activePreset, setActivePreset] = useState('presetCustom');

  const presets = useMemo(() => ([
    buildPreset(t, 'minecraft.mapView.presetBlueMap', 8100),
    buildPreset(t, 'minecraft.mapView.presetDynmap', 8123),
    buildPreset(t, 'minecraft.mapView.presetSquaremap', 8080),
    buildPreset(t, 'minecraft.mapView.presetPl3xMap', 8080),
  ]), [t]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setValue(server?.mapUrl || '');
    // Pick the active preset by URL match so the chip stays in sync when
    // the user reopens the dialog after editing.
    const match = presets.find((p) => p.url === (server?.mapUrl || ''));
    setActivePreset(match ? match.key : 'presetCustom');
  }, [open, server, presets]);

  function applyPreset(preset) {
    setActivePreset(preset.key);
    setValue(preset.url);
    setError('');
  }

  async function save() {
    if (!server) return;
    setSaving(true);
    setError('');
    try {
      const res = await api(`/api/servers/${server.id}/map`, {
        method: 'PUT',
        body: { mapUrl: value.trim() },
      });
      // Keep the local server list in sync (the WebSocket broadcast will
      // also reach this client, but doing it explicitly avoids a one-frame
      // delay and gives a clean optimistic update).
      if (res?.server) {
        setServers((prev) => prev.map((s) => s.id === res.server.id ? { ...s, ...res.server } : s));
      }
      toast.success(t('minecraft.mapView.saved'));
      onOpenChange(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Map className="h-4 w-4" />
            </span>
            {t('minecraft.mapView.settings')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {server && (
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground/90 font-medium">{server.name}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label>{t('minecraft.mapView.urlLabel')}</Label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setActivePreset('presetCustom'); }}
              placeholder={t('minecraft.mapView.urlPlaceholder')}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-label text-muted-foreground/80">{t('minecraft.mapView.urlHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('minecraft.mapView.presetHeading')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <Button
                  key={p.key}
                  type="button"
                  variant={activePreset === p.key ? 'default' : 'glass'}
                  size="sm"
                  onClick={() => applyPreset(p)}
                  className={cn('justify-between px-3', activePreset !== p.key && 'text-muted-foreground')}
                >
                  <span className="font-medium">{p.label}</span>
                  {activePreset === p.key && <Check className="h-3.5 w-3.5" />}
                </Button>
              ))}
              <Button
                type="button"
                variant={activePreset === 'presetCustom' ? 'default' : 'glass'}
                size="sm"
                onClick={() => setActivePreset('presetCustom')}
                className={cn('justify-between px-3', activePreset !== 'presetCustom' && 'text-muted-foreground')}
              >
                <span className="font-medium">{t('minecraft.mapView.presetCustom')}</span>
                {activePreset === 'presetCustom' && <Check className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          {error && <p className="text-xs text-status-error">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)} disabled={saving}>{t('common.cancel')}</Button>
          <Button variant="default" onClick={save} disabled={saving}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
