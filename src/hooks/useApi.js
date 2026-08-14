import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useServer } from '@/context/ServerContext';

export function useApi() {
  const { token, logout } = useAuth();
  const { t } = useI18n();
  const { activeServerId } = useServer();

  const api = useCallback(async (path, opts = {}) => {
    const headers = { ...opts.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    if (activeServerId && opts.serverScoped !== false) headers['X-Fleetdeck-Server-Id'] = activeServerId;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts = { ...opts, body: JSON.stringify(opts.body) };
    }
    const r = await fetch(path, { ...opts, headers });
    if (r.status === 401 && !opts.silent) {
      logout();
      throw new Error(t('common.sessionExpired'));
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const error = data.error;
      const translated = typeof error === 'string' ? t(error) : '';
      throw new Error(error && translated !== error ? translated : (error || t('common.httpError', { status: r.status })));
    }
    return data;
  }, [token, logout, t, activeServerId]);

  return api;
}
