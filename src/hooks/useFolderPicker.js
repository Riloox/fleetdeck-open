import { useCallback, useRef, useState } from 'react';

/*
 * The native folder picker round-trip, with two rules every Browse button must
 * follow:
 *   - one dialog at a time per component - a second click while the request is
 *     in flight is ignored (the ref guard covers clicks that land in the same
 *     render frame, before the disabled attribute can take effect), and
 *   - the button is disabled for the whole request, so the UI shows the picker
 *     is busy instead of silently swallowing clicks.
 *
 * Returns `picking` for the button and `pick(defaultPath)` which resolves to
 * the chosen path, or null when the dialog was cancelled. Errors propagate to
 * the caller, which falls back to the in-browser folder browser.
 */
export function useFolderPicker(api) {
  const busyRef = useRef(false);
  const [picking, setPicking] = useState(false);

  const pick = useCallback(async (defaultPath = '', title = '') => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setPicking(true);
    try {
      const params = new URLSearchParams({ defaultPath: defaultPath || '' });
      if (title) params.set('title', title);
      const data = await api(`/api/pick-folder?${params.toString()}`);
      return data?.path || null;
    } finally {
      busyRef.current = false;
      setPicking(false);
    }
  }, [api]);

  return { picking, pick };
}
