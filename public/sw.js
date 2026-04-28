// Service Worker for JournalCoach PWA.
// Sprint 1: basic install + fetch cache.
// Sprint 3: push + notificationclick handlers for task reminders.

// Bumped to v4: shared-grocery release ships a new fetch rule that
// bypasses cache for /share/grocery/ accept routes — invalidate any
// clients still serving the v3 worker.
const CACHE_NAME = 'journalcoach-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop old caches when the new SW activates so users on the
  // previous version pick up fresh HTML on next reload.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ).then(() => clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Share-accept routes must always hit the network — a cached page
  // would serve stale "invite invalid" or skip the RPC entirely.
  try {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/share/grocery/')) {
      event.respondWith(fetch(event.request));
      return;
    }
  } catch {}
  // Network-first — always try fresh, fall back to cache.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ── Web Push handler ─────────────────────────────────────────────
// Three archive payload kinds + reminders travel through this pipe:
//   * Reminders — { title, body, data: { task_id, snooze_token, done_token } }
//   * Weekly letters — { kind: 'weekly_letter', data: { letter_id, url } }
//   * Monthly patterns — { kind: 'monthly_pattern', data: { pattern_id, url } }
//   * Quarterly letters — { kind: 'quarterly_letter', data: { quarterly_id, url } }
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

  const { title, body, data, kind } = payload;

  // Letters / monthly patterns / quarterly letters / pulse reminders
  // don't get action buttons — there's nothing to snooze or mark
  // done. One-tap open.
  const isLetter = kind === 'weekly_letter';
  const isPattern = kind === 'monthly_pattern';
  const isQuarterly = kind === 'quarterly_letter';
  const isPulse = kind === 'pulse_reminder';
  const isArchiveItem = isLetter || isPattern || isQuarterly || isPulse;
  const actions = isArchiveItem
    ? []
    : [
        { action: 'snooze10', title: 'Snooze 10 min' },
        { action: 'done', title: 'Done' },
      ];

  // Coalesce notifications by a deterministic tag so a second fire
  // replaces the first instead of stacking.
  let tag;
  if (isLetter) {
    tag = data && data.letter_id ? `letter-${data.letter_id}` : 'weekly-letter';
  } else if (isPattern) {
    tag = data && data.pattern_id ? `pattern-${data.pattern_id}` : 'monthly-pattern';
  } else if (isQuarterly) {
    tag = data && data.quarterly_id ? `quarterly-${data.quarterly_id}` : 'quarterly-letter';
  } else if (isPulse) {
    // Per-mode tag so a morning reminder can't replace an evening
    // reminder later in the same day (and vice versa).
    tag = `pulse-${(data && data.mode) || 'reminder'}`;
  } else if (data && data.task_id) {
    tag = `task-${data.task_id}`;
  }

  const fallbackTitle = isLetter
    ? 'New letter'
    : isPattern
    ? 'Monthly pattern'
    : isQuarterly
    ? 'Quarterly letter'
    : isPulse
    ? (data && data.mode === 'evening' ? 'Evening pulse' : 'Morning pulse')
    : 'Reminder';

  event.waitUntil(
    self.registration.showNotification(title || fallbackTitle, {
      body: body || '',
      icon: '/icon',
      badge: '/icon',
      tag,
      data: { ...(data || {}), kind },
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
  const isLetter = data.kind === 'weekly_letter';
  const isPattern = data.kind === 'monthly_pattern';
  const isQuarterly = data.kind === 'quarterly_letter';
  const isPulse = data.kind === 'pulse_reminder';

  const handle = async () => {
    // Pulse reminders open /home so the user lands directly on the
    // DailyPulseCard. Same nav pattern as letters: try to focus an
    // existing window before opening a new one.
    if (isPulse) {
      const target = data.url || '/home';
      const winClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of winClients) {
        if ('focus' in c) {
          if ('navigate' in c) {
            try { await c.navigate(target); } catch {}
          }
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }

    // Letters, monthly patterns, and quarterly letters have no
    // actions — any tap opens the archive (or the specific item if
    // we know its id). This branch runs before the reminder action
    // branches so archive taps never accidentally fall through.
    if (isLetter || isPattern || isQuarterly) {
      const itemId = data.letter_id || data.pattern_id || data.quarterly_id;
      const target = itemId
        ? `/letters/${itemId}`
        : (data.url || '/letters');
      const winClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of winClients) {
        if (c.url.includes('/letters') && 'focus' in c) {
          if ('navigate' in c) {
            try { await c.navigate(target); } catch {}
          }
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
    }

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
