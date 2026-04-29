// Service Worker for JournalCoach PWA.
// Sprint 1: basic install + fetch cache.
// Sprint 3: push + notificationclick handlers for task reminders.
// v5: offline shell — pre-cache the app's main routes on install
// and lazily cache successful GET responses so a cold-open with no
// network serves the previously-loaded shell + chunks instead of a
// browser "no internet" page.

const CACHE_NAME = 'journalcoach-v6';

// Routes the user is likely to land on after install. Pre-fetched in
// `install` so the very first offline cold-open has them. Hashed JS
// chunks aren't here because we don't know their names at SW source
// time — those land in the runtime cache below the first time they
// load online.
const PRECACHE_URLS = [
  '/',
  '/today',
  '/home',
  '/pulse',
  '/journal',
  '/lists',
  '/groceries',
  '/settings',
  '/upcoming',
  '/patterns',
  '/notebooks',
  '/letters',
  '/voice',
  '/guided',
  '/intentions',
  '/priorities',
  '/icon',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use individual put-or-skip to avoid one 404 (e.g. a route the
      // user can't reach due to RLS) torpedoing the whole precache.
      Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: 'same-origin' });
            if (res.ok) await cache.put(url, res);
          } catch {
            // Offline at install time — skip. The lazy cache below
            // will fill in once we have network.
          }
        }),
      ),
    ),
  );
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
  const req = event.request;

  // Only handle GET. Mutations (POST/PATCH/DELETE) must always reach
  // the network — they're either Supabase calls (handled by the
  // app's outbox when offline) or Edge Function POSTs.
  if (req.method !== 'GET') return;

  // Share-accept routes must always hit the network — a cached page
  // would serve stale "invite invalid" or skip the RPC entirely.
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.pathname.startsWith('/share/grocery/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Skip cross-origin requests — leave them to the network. We only
  // want to cache our own assets + pages.
  if (url.origin !== self.location.origin) return;

  // Network-first with cache fallback. On success, write the response
  // into the runtime cache so the next offline visit can serve it.
  // Skip caching of API / auth / supabase responses — those are
  // user-state-dependent and we don't want stale credentials served.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (
          fresh.ok &&
          !url.pathname.startsWith('/api/') &&
          !url.pathname.startsWith('/auth/')
        ) {
          // Clone before consuming — Response bodies are single-use.
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        // Network failed. Serve the exact URL from cache if we have
        // it. We deliberately do NOT fall back to a different route's
        // shell (the previous version returned /today for any
        // navigation cache miss) — that caused click-Patterns →
        // see-Today confusion when chunks weren't cached. A clean
        // 503 is more honest; the user can navigate back to a
        // precached route.
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })(),
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

// Append the "from-notification" flag to a target URL. The app's
// (app)/layout.tsx checks for ?n=1 on first render and skips its
// cold-start wallState restore so the user lands on the URL the
// notification actually pointed at, not their last-active wall. The
// layout strips the param after consuming it.
function withNotifFlag(url) {
  if (!url) return url;
  return url + (url.includes('?') ? '&' : '?') + 'n=1';
}

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
      const target = withNotifFlag(data.url || '/home');
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
      const target = withNotifFlag(
        itemId ? `/letters/${itemId}` : (data.url || '/letters'),
      );
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
    const target = withNotifFlag(taskId ? '/today' : '/home');
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
