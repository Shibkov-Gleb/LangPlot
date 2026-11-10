'use client';
import { useEffect } from 'react';
let pending: Promise<void> | undefined;
export function trackVisit() {
  if (!pending) {
    const campaign = new URLSearchParams(location.search).get('utm_source');
    let source = campaign && /^[a-z0-9._-]{1,64}$/i.test(campaign) ? campaign : 'direct';
    if (source === 'direct' && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.host !== location.host) source = ref.hostname.slice(0, 64);
      } catch {}
    }
    const send = () =>
      fetch('/api/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
        credentials: 'same-origin',
      }).then((r) => {
        if (!r.ok) throw Error('visit');
      });
    pending = (
      navigator.locks ? navigator.locks.request('langplot-first-visit', send) : send()
    ).catch(() => {
      pending = undefined;
    });
  }
  return pending;
}
export function VisitTracker() {
  useEffect(() => {
    void trackVisit();
  }, []);
  return null;
}
