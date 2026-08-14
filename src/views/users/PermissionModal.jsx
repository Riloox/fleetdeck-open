import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loading } from '@/components/shared/Loading';
import { useApi } from '@/hooks/useApi';
import { useServer } from '@/context/ServerContext';
import { useT } from '@/context/I18nContext';
import { toast } from 'sonner';

/**
 * Grant editor for one principal.
 *
 * Users and API keys are both principals in capability_grants, and their
 * permission endpoints are the same contract under a different path - so this
 * takes the path rather than assuming a user, and neither caller has to know
 * what the other one is.
 *
 * @param {string} basePath  e.g. `/api/users/abc` or `/api/api-keys/key:ab12`
 * @param {string} subject   Name shown in the title.
 */
export function PermissionModal({ open, onOpenChange, basePath, subject, onSaved }) {
  const api = useApi();
  const t = useT();
  const { servers } = useServer();
  const [catalog, setCatalog] = useState({ perServer: [], global: [] });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const key = (serverId, capability) => `${serverId || ''}\0${capability}`;

  useEffect(() => {
    if (!open || !basePath) return;
    setLoading(true);
    api(`${basePath}/permissions`)
      .then((data) => {
        setCatalog(data.capabilities);
        setSelected(new Set(data.permissions.grants.map((grant) => key(grant.serverId, grant.capability))));
      })
      .catch((error) => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [open, basePath]);

  function toggle(serverId, capability, checked) {
    setSelected((previous) => {
      const next = new Set(previous);
      const value = key(serverId, capability);
      if (checked) next.add(value); else next.delete(value);
      return next;
    });
  }

  async function save() {
    const grants = [];
    for (const capability of catalog.global) if (selected.has(key(null, capability))) grants.push({ serverId: null, capability });
    for (const server of servers) for (const capability of catalog.perServer) {
      if (selected.has(key(server.id, capability))) grants.push({ serverId: server.id, capability });
    }
    try {
      await api(`${basePath}/permissions`, { method: 'PUT', body: { grants } });
      toast.success(t('users.permissionsSaved'));
      onSaved();
      onOpenChange(false);
    } catch (error) { toast.error(error.message); }
  }

  const permissionLabel = (capability) => capability.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  const group = (title, serverId, capabilities) => (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <label key={capability} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-xs">
            <Checkbox checked={selected.has(key(serverId, capability))} onCheckedChange={(checked) => toggle(serverId, capability, checked === true)} />
            {permissionLabel(capability)}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('users.permissionsTitle', { user: subject || '' })}</DialogTitle></DialogHeader>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-xs text-muted-foreground">{t('users.permissionsHint')}</p>
          {loading ? <Loading /> : <>
            {group(t('users.globalPermissions'), null, catalog.global)}
            {servers.map((server) => <div key={server.id}>{group(server.name, server.id, catalog.perServer)}</div>)}
          </>}
        </div>
        <DialogFooter>
          <Button variant="glass" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={save} disabled={loading}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
