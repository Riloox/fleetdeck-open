import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { isJwtExpired } from '@/lib/utils';
import { applyBranding } from '@/lib/branding';

const AuthContext = createContext(null);

// What the panel calls itself before /api/auth-mode answers, and if it ever
// fails to. Keeping the shape complete means no consumer needs a null check.
const NO_BRANDING = Object.freeze({ name: '', logoUrl: '', faviconUrl: '', supportUrl: '', legalFooter: '', accent: null });

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('fleetdeck_token') || '');
  const [user, setUser] = useState(null);
  // Discovered once on boot from the unauthenticated /api/auth-mode endpoint.
  // authChecked gates the whole app so the login screen never flashes while
  // we find out sign-in is off.
  const [authDisabled, setAuthDisabled] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  // Pre-login default language (server's DEFAULT_LANGUAGE env, "en"/"es"),
  // discovered from the same bootstrap call. Only used before sign-in and
  // only when the browser has no explicitly-saved language preference.
  const [defaultLanguage, setDefaultLanguage] = useState(null);
  // Branding comes from the same bootstrap call because the login screen needs
  // it: it renders before any token exists, and a white-labelled panel must not
  // flash someone else's wordmark on the way in.
  const [branding, setBranding] = useState(NO_BRANDING);
  // When false (the default) the login page will NOT call ipify.org or any
  // external service to auto-detect the client's IP / language.  The backend
  // exposes this as config.geoLanguageDetection (default false) through
  // GET /api/auth-mode.
  const [geoLanguageDetection, setGeoLanguageDetection] = useState(false);
  const [gameThemes, setGameThemes] = useState({});
  const [gameAccents, setGameAccents] = useState({});

  useEffect(() => {
    let alive = true;
    fetch('/api/auth-mode')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        if (data.authRequired === false) setAuthDisabled(true);
        if (data.defaultLanguage) setDefaultLanguage(data.defaultLanguage);
        if (data.branding) {
          setBranding({ ...NO_BRANDING, ...data.branding });
          applyBranding(data.branding);
        }
        if (data.geoLanguageDetection === true) setGeoLanguageDetection(true);
        if (data.gameThemes) setGameThemes(data.gameThemes);
        if (data.gameAccents) setGameAccents(data.gameAccents);
      })
      .catch(() => {})
      .finally(() => { if (alive) setAuthChecked(true); });
    return () => { alive = false; };
  }, []);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('fleetdeck_token', newToken);
    setToken(newToken);
    setUser(newUser || null);
  }, []);

  // Clears the guest flag too: a 401 means sign-in is back on server-side,
  // so the next render must send the visitor to the login screen.
  const logout = useCallback(() => {
    localStorage.removeItem('fleetdeck_token');
    setToken('');
    setUser(null);
    setAuthDisabled(false);
  }, []);

  const isLoggedIn = authDisabled || (!!token && !isJwtExpired(token));
  const hasCapability = useCallback((capability, serverId = null) => {
    if (user?.role === 'admin' || user?.permissions?.admin) return true;
    return !!user?.permissions?.grants?.some((grant) => grant.capability === capability && (grant.serverId || null) === (serverId || null));
  }, [user]);

  return (
    <AuthContext.Provider value={{ token, user, setUser, login, logout, isLoggedIn, hasCapability, authDisabled, authChecked, defaultLanguage, branding, gameThemes, setGameThemes, gameAccents, setGameAccents, geoLanguageDetection }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/*
 * Branding is not authentication, but it arrives on the auth bootstrap call and
 * splitting it into its own provider would mean fetching /api/auth-mode twice.
 * This hook is the seam: everything that renders the panel's identity asks for
 * it here and never learns where it came from.
 */
export function useBranding() {
  return useContext(AuthContext)?.branding || NO_BRANDING;
}
export function useGameThemes() { return useContext(AuthContext)?.gameThemes || {}; }
export function useGameAccents() { return useContext(AuthContext)?.gameAccents || {}; }
