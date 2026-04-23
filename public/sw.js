// Service Worker for JournalCoach PWA.
// Sprint 1: basic install + fetch cache.
// Sprint 3: push + notificationclick handlers for task reminders.

const CACHE_NAME = 'journalcoach-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first — always try fresh, fall back to cache.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Web Push handler ─────────────────────────────────────────────
// The edge function POSTs a payload like:
//   { title, body, data: { task_id, snooze_token, done_token } }
// iOS Safari and Chrome Android BOTH require every push to show a
// user-visible notification. Never skip showNotification() or the
// OS may revoke permission.
self.addEventListener('push', (event) => {
  let payload = { title: 'Reminder', body: '' };
  try {
    if (event.data) {
      const json = event.data.json();
      payload = { ...payload, ...json };
    }
  } catch {
    // Fall back to the text form.
    try {
      payload.body = event.data ? event.data.text() : '';
    } catch {}
  }

  const { title, body, data } = payload;
  const actions = [
    { action: 'snooze10', title: 'Snooze 10 min' },
    { action: 'done', title: 'Done' },
  ];

  event.waitUntil(
    self.registration.showNotification(title || 'Reminder', {
      body: body || '',
      icon: '/icon',
      badge: '/icon',
      tag: data && data.task_id ? `task-${data.task_id}` : undefined,
      data: data || {},
      actions,
      requireInteraction: false,
    })
  );
});

// ── Notification click / action handler ──────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const taskId = data.task_id;

  const handle = async () => {
    // Action taps don't need to focus the app — the backend call is
    // enough. Plain taps (no action) open the app focused on the
    // relevant entry point.
    if (action === 'snooze10' && data.snooze_token) {
      try {
        await fetch('/api/reminders/snooze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            minutes: 10,
            token: data.snooze_token,
          }),
        });
      } catch {}
      return;
    }
    if (action === 'done' && data.done_token) {
      try {
        await fetch('/api/tasks/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: taskId,
            token: data.done_token,
          }),
        });
      } catch {}
      return;
    }

    // Plain tap → focus an existing client or open the app at /today
    // (task view) so the user lands on something actionable.
    const target = taskId ? '/today' : '/home';
    const winClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const c of winClients) {
      if (c.url.includes(target) && 'focus' in c) {
        return c.focus();
      }
    }
    if (winClients[0] && 'navigate' in winClients[0]) {
      try {
        await winClients[0].navigate(target);
        return winClients[0].focus();
      } catch {}
    }
    return self.clients.openWindow(target);
  };

  event.waitUntil(handle());
});

// ── Push subscription renewal ────────────────────────────────────
// Browsers rotate endpoints occasionally. When that happens we try
// to re-subscribe with the same applicationServerKey. The actual
// key comes from an env var baked in at build time — we read it via
// the page-registered module, which POSTs the new subscription to
// /api/push/subscribe.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        // Notify any open tabs; they'll re-subscribe with the key
        // they have access to. If no tabs are open the next visit
        // will naturally subscribe.
        const winClients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const c of winClients) {
          c.postMessage({ type: 'pushsubscriptionchange' });
        }
      } catch {}
    })()
  );
});
