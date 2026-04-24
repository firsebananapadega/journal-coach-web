// Client-side Web Push subscription helpers.
// Handles support detection, permission + subscribe flow, and POSTs
// the resulting PushSubscription to /api/push/subscribe.

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export type PushSupport =
  | 'unsupported'      // no ServiceWorker or PushManager
  | 'blocked'          // permission denied
  | 'standalone-required' // iOS: only works in installed PWA
  | 'not-subscribed'   // supported, permission not yet asked
  | 'granted'          // supported, permission granted, may or may not be subscribed
  | 'subscribed'       // fully wired up
  ;

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.platform) ||
    (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform))
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export async function getPushSupport(): Promise<PushSupport> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  // iOS only allows push from installed PWAs.
  if (isIos() && !isStandalone()) return 'standalone-required';

  const perm = Notification.permission;
  if (perm === 'denied') return 'blocked';
  if (perm !== 'granted') return 'not-subscribed';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'granted';
  } catch {
    return 'granted';
  }
}

// URL-safe base64 (no padding) → Uint8Array for applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function subscribeInBrowser(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing');
    return null;
  }
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // `applicationServerKey` accepts BufferSource; cast through
    // Uint8Array<ArrayBuffer> so TS doesn't widen to SharedArrayBuffer.
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
  });
}

// Base64-encode the ArrayBuffer keys returned by subscription.getKey.
function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendSubscription(sub: PushSubscription): Promise<boolean> {
  const p256dhBuf = sub.getKey('p256dh');
  const authBuf = sub.getKey('auth');
  if (!p256dhBuf || !authBuf) return false;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return false;

  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh: bufToBase64Url(p256dhBuf),
        auth: bufToBase64Url(authBuf),
        user_agent: navigator.userAgent,
        user_tz:
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Request notification permission, subscribe in the browser, and
 * POST the subscription to the server. Safe to call multiple times —
 * re-subscribes idempotently.
 * Returns:
 *   'ok'            — subscribed (new or existing)
 *   'denied'        — user said no
 *   'unsupported'   — browser / context doesn't support it
 *   'error'         — something else failed
 */
export async function enablePushReminders(): Promise<
  'ok' | 'denied' | 'unsupported' | 'error'
> {
  const support = await getPushSupport();
  if (support === 'unsupported' || support === 'standalone-required') return 'unsupported';
  if (support === 'blocked') return 'denied';

  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return result === 'denied' ? 'denied' : 'error';
  }

  const sub = await subscribeInBrowser();
  if (!sub) return 'error';
  const sent = await sendSubscription(sub);
  return sent ? 'ok' : 'error';
}

/**
 * Used on visits to re-send the existing subscription (e.g. after a
 * long absence) so the server's last_used_at stays fresh. No-op if
 * the user isn't subscribed.
 */
export async function refreshSubscription(): Promise<void> {
  const support = await getPushSupport();
  if (support !== 'subscribed') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sendSubscription(sub);
  } catch {
    // Best-effort.
  }
}

/**
 * Self-healing wrapper. The problem `enablePushReminders` alone can't
 * solve: if the user previously tapped "Allow" but the /api/push/
 * subscribe POST failed (server was misconfigured), the browser has
 * permission + a subscription object but the server has no row. The
 * app then thinks "already subscribed, nothing to do" and reminders
 * never fire.
 *
 * This function always resyncs. If the browser already has a sub,
 * we re-POST it (server upsert is idempotent). If permission is
 * granted but no sub, we subscribe + POST. If permission is default,
 * we return 'needs-prompt' so the caller can show the bottom sheet
 * within a user gesture. Never throws.
 */
export type EnsureSubscribedResult =
  | 'ok'             // server has our current subscription
  | 'needs-prompt'   // show the PushPermissionSheet to get a user gesture
  | 'needs-install'  // iOS Safari, not installed to home screen
  | 'blocked'        // user denied notification permission
  | 'unsupported'    // browser lacks PushManager / SW
  | 'error';         // network/server failure; try again later

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function ensureSubscribed(): Promise<EnsureSubscribedResult> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'unsupported';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  if (isIos() && !isStandalone()) return 'needs-install';

  const perm = Notification.permission;
  if (perm === 'denied') return 'blocked';
  if (perm === 'default') return 'needs-prompt';

  // perm === 'granted' past here. Make sure we have a browser sub
  // AND the server has a row for it. Timeouts wrap every async step
  // so a hung service worker can't make us silently hang.
  try {
    const reg = await withTimeout(
      navigator.serviceWorker.ready,
      4000,
      'serviceWorker.ready',
    );
    let sub = await withTimeout(
      reg.pushManager.getSubscription(),
      4000,
      'getSubscription',
    );
    if (!sub) {
      sub = await withTimeout(
        subscribeInBrowser(),
        6000,
        'subscribeInBrowser',
      ) as PushSubscription | null;
      if (!sub) return 'error';
    }
    const sent = await withTimeout(sendSubscription(sub), 6000, 'sendSubscription');
    return sent ? 'ok' : 'error';
  } catch (err) {
    // Surface the specific failure on the window object so the
    // caller can render a debug toast if it wants. Safe to inspect
    // with `window.__lastPushError` in Safari's Web Inspector.
    try {
      (window as unknown as { __lastPushError?: string }).__lastPushError =
        err instanceof Error ? err.message : String(err);
    } catch {}
    return 'error';
  }
}

const LS_DISMISS_KEY = 'push_prompt_dismissed_at';

export function markPromptDismissed() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_DISMISS_KEY, new Date().toISOString());
  } catch {}
}

/**
 * "Should we prompt?" — yes if subscribe is reachable (or if iOS is
 * blocking us behind the install-to-home-screen gate — in that case
 * the sheet surfaces a "Install first" hint) AND we haven't been
 * dismissed in the last 30 days.
 */
export async function shouldPromptForPermission(): Promise<boolean> {
  const support = await getPushSupport();
  if (support !== 'not-subscribed' && support !== 'standalone-required') return false;
  if (typeof window === 'undefined') return false;
  try {
    const stamp = localStorage.getItem(LS_DISMISS_KEY);
    if (!stamp) return true;
    const ageDays = (Date.now() - new Date(stamp).getTime()) / 86_400_000;
    return ageDays > 30;
  } catch {
    return true;
  }
}
