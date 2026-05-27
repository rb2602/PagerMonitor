import { useState, useEffect, useCallback } from 'react';

const supported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

function urlBase64ToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const [subscribed, setSubscribed] = useState(false);

  // Check initial subscription state on mount.
  // If the browser dropped the subscription (common on Android after OS kills Chrome),
  // automatically re-subscribe so future pushes keep arriving.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then(async reg => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Subscription exists — re-register it with the server in case the server
          // lost it (e.g. DB was wiped or endpoint changed after a browser update)
          setSubscribed(true);
          const tok = localStorage.getItem('pm_token') || '';
          await fetch('/api/push/subscribe', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
            body:    JSON.stringify(sub.toJSON()),
          }).catch(() => {});
        } else {
          setSubscribed(false);
        }
      })
      .catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!supported) return;
    try {
      const res = await fetch('/api/push/vapid-public-key');
      if (!res.ok) return;
      const { publicKey } = await res.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pm_token') || ''}` },
        body:    JSON.stringify(sub.toJSON()),
      });

      setSubscribed(true);
    } catch (err) {
      console.warn('Push subscribe failed:', err);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setSubscribed(false); return; }

      await fetch('/api/push/subscribe', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pm_token') || ''}` },
        body:    JSON.stringify({ endpoint: sub.endpoint }),
      });

      await sub.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      console.warn('Push unsubscribe failed:', err);
    }
  }, []);

  return { supported, subscribed, subscribe, unsubscribe };
}
