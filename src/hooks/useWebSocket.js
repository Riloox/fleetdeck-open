import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useServer } from '@/context/ServerContext';

export function useWebSocket({ onLine, onHistory, onStatus, onStats, onServer, onNotification, onConnChange } = {}) {
  const { token, authDisabled } = useAuth();
  const { updateStatus, activeServerId, setServers, setNotifications, pushNotification, wsRef } = useServer();
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  // Keep latest callbacks in refs so the WS handler always calls current version
  const callbacksRef = useRef({ onLine, onHistory, onStatus, onStats, onServer, onNotification, onConnChange });
  useEffect(() => {
    callbacksRef.current = { onLine, onHistory, onStatus, onStats, onServer, onNotification, onConnChange };
  });

  const sendMessage = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  useEffect(() => {
    mountedRef.current = true;
    // No token is needed while sign-in is off: the server upgrades the socket
    // as the guest session.
    if (!token && !authDisabled) return;

    function connect() {
      if (!mountedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      const ws = new WebSocket(`${proto}://${location.host}/ws${query}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        callbacksRef.current.onConnChange?.('ok');
        if (activeServerId) ws.send(JSON.stringify({ type: 'selectServer', serverId: activeServerId }));
      };

      ws.onmessage = (ev) => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }

        if (msg.type === 'history') {
          callbacksRef.current.onHistory?.(msg);
        } else if (msg.type === 'line') {
          callbacksRef.current.onLine?.(msg);
        } else if (msg.type === 'status') {
          updateStatus(msg.status);
          callbacksRef.current.onStatus?.(msg.status);
        } else if (msg.type === 'stats') {
          callbacksRef.current.onStats?.(msg.stats);
        } else if (msg.type === 'server' && msg.server) {
          // Server metadata (name, dir, mapUrl, ...) changed on another
          // client or in the backend. Merge it into the local list so
          // derived state (active server, mapUrl) updates without a refetch.
          setServers((prev) => prev.map((s) => s.id === msg.server.id ? { ...s, ...msg.server } : s));
          callbacksRef.current.onServer?.(msg.server);
        } else if (msg.type === 'notifications') {
          // Full list sent once on connect.
          setNotifications(Array.isArray(msg.notifications) ? msg.notifications : []);
        } else if (msg.type === 'notification' && msg.notification) {
          // A single new notification pushed live.
          pushNotification(msg.notification);
          callbacksRef.current.onNotification?.(msg.notification);
        }
      };

      ws.onclose = () => {
        // Ignore stale sockets: StrictMode's dev-only mount/cleanup/mount cycle
        // can fire the old socket's close after the new socket took over, and
        // reconnecting from the stale handler used to orphan the live socket.
        if (!mountedRef.current || wsRef.current !== ws) return;
        callbacksRef.current.onConnChange?.('bad');
        if (token || authDisabled) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (!ws) return;
      if (ws.readyState === WebSocket.CONNECTING) {
        // Never hard-abort a socket mid-handshake. React StrictMode (dev) runs
        // this cleanup and immediately re-runs the effect, and aborting the
        // half-open connection made the Vite proxy log "ws proxy socket error:
        // ECONNABORTED" on every dev boot. Wait for the handshake to finish,
        // then close cleanly; the guards above make the stale socket a no-op.
        ws.addEventListener('open', () => ws.close(1000, 'unmount'), { once: true });
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'unmount');
      }
    };
  }, [token, authDisabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeServerId) sendMessage({ type: 'selectServer', serverId: activeServerId });
  }, [activeServerId, sendMessage]);

  return { sendMessage };
}
