// POST /api/cron/send-pulse-reminders
//
// Fires every 5 minutes via pg_cron. For each user with a pulse
// reminder enabled, checks whether NOW (in the user's local
// timezone) is within ±5 minutes of their configured morning_time
// or evening_time AND they haven't already done that pulse today
// AND we haven't already pinged them today. If all three pass,
// sends a web push and stamps last_(morning|evening)_pulse_reminder_at.
//
// Default times when notification_preferences.reminder_times isn't
// set: 08:00 morning, 21:30 evening. Research-anchored — cortisol
// awakening response peaks ~30-45 min after waking; sleep hygiene
// research wants reflection 30-60 min before bed (Pennebaker
// expressive-writing protocol).

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

interface ProfileRow {
  id: string;
  display_name: string | null;
  timezone: string | null;
  notification_preferences: {
    morning_reminder?: boolean;
    evening_reminder?: boolean;
    presence_reminder?: boolean;
    reminder_times?: { morning?: string; evening?: string; presence?: string };
  } | null;
  last_morning_pulse_reminder_at: string | null;
  last_evening_pulse_reminder_at: string | null;
  last_presence_pulse_reminder_at: string | null;
  primary_use: 'tasks' | 'journal' | 'both' | null;
  language: 'en-US' | 'es-MX' | null;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const BATCH_LIMIT = 200;
// ±5 min window — accommodates cron jitter without triggering
// duplicates (the dedup-by-day check still gates that).
const WINDOW_MIN = 5;
const DEFAULT_MORNING_TIME = '08:00';
const DEFAULT_EVENING_TIME = '21:30';
const DEFAULT_PRESENCE_TIME = '13:00';

function configureWebPush() {
  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const contact = (process.env.VAPID_CONTACT || 'mailto:hello@example.com').trim();
  if (!pub || !priv) return false;
  webpush.setVapidDetails(contact, pub, priv);
  return true;
}

function log(tag: string, extra?: Record<string, unknown>) {
  console.log('[pulse-reminder-cron]', JSON.stringify({ tag, ts: Date.now(), ...extra }));
}

/** Format a "HH:MM" reminder time as a 12-hour clock for the
 *  notification title. "07:00" → "7:00 AM", "19:55" → "7:55 PM"
 *  for en-US; Spanish gets "7:55 p.m." style via Intl. Returns the
 *  raw input if it doesn't parse so a malformed value can't break
 *  the notification. */
function formatReminderTime(hhmm: string, locale: 'en-US' | 'es-MX'): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return hhmm;
  }
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
}

/** Format `now` in `tz` as { hh, mm, yyyymmdd } using Intl. Returns
 *  null when the timezone string is invalid. */
function localParts(now: Date, tz: string): { hh: number; mm: number; yyyymmdd: string } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const yyyymmdd = `${get('year')}-${get('month')}-${get('day')}`;
    const hh = parseInt(get('hour'), 10);
    const mm = parseInt(get('minute'), 10);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return { hh, mm, yyyymmdd };
  } catch {
    return null;
  }
}

/** Minutes-since-midnight diff, smallest absolute distance considering
 *  day boundary (e.g. 23:55 vs 00:05 = 10 min, not 1430). */
function minutesDiff(a: { hh: number; mm: number }, target: string): number | null {
  const [th, tm] = target.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(th) || Number.isNaN(tm)) return null;
  const aMin = a.hh * 60 + a.mm;
  const tMin = th * 60 + tm;
  const raw = Math.abs(aMin - tMin);
  return Math.min(raw, 1440 - raw);
}

/** True when last_sent_at falls on `userLocalDate` (YYYY-MM-DD) in the
 *  user's timezone. Used to dedup same-day re-sends. */
function alreadySentToday(
  lastSentIso: string | null,
  userLocalDate: string,
  tz: string,
): boolean {
  if (!lastSentIso) return false;
  const sentParts = localParts(new Date(lastSentIso), tz);
  if (!sentParts) return false;
  return sentParts.yyyymmdd === userLocalDate;
}

/** Did the user already complete this pulse mode today? Looks at
 *  journal_entries where entry_type='pulse' and metadata.pulseMode
 *  matches; created_at within today's user-local window. */
async function pulseDoneToday(
  admin: SupabaseClient,
  userId: string,
  mode: 'morning' | 'evening' | 'presence',
  userLocalDate: string,
  tz: string,
): Promise<boolean> {
  // Pull all pulse entries from the last ~36 hours; let JS apply the
  // tz-correct date filter (server-side date math in Postgres against
  // user TZ requires extension we may not have).
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('journal_entries')
    .select('created_at, metadata')
    .eq('user_id', userId)
    .eq('entry_type', 'pulse')
    .gte('created_at', cutoff);
  if (!data || data.length === 0) return false;
  return data.some((row) => {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    if (m.pulseMode !== mode) return false;
    const parts = localParts(new Date(row.created_at as string), tz);
    return parts?.yyyymmdd === userLocalDate;
  });
}

/** Build the bilingual title/body for the morning briefing.
 *  Tasks-only digest — pulls today's uncompleted tasks (count +
 *  top by Eisenhower rank). Groceries are intentionally NOT
 *  surfaced here; if the user wants to be reminded about a
 *  shopping run, they create a task for it. Empty days get a
 *  warm "enjoy your day" body — opt-in users always get their
 *  8 AM ping, never a missing one. */
async function buildMorningBriefing(
  admin: SupabaseClient,
  profile: ProfileRow,
  userLocalDate: string,
  language: 'en-US' | 'es-MX',
  reminderTime: string,
): Promise<{ title: string; body: string; url: string }> {
  const isSpanish = language === 'es-MX';
  const formattedTime = formatReminderTime(reminderTime, language);

  // Today's uncompleted tasks. Eisenhower priority order:
  // important+urgent first, then important, then urgent, then
  // anything else. Within ties, today_sort_order then sort_order.
  let topTaskText: string | null = null;
  let taskCount = 0;
  try {
    const { data: tasks } = await admin
      .from('tasks')
      .select('text, urgent, important, today_sort_order, sort_order')
      .eq('user_id', profile.id)
      .eq('completed', false)
      .is('archived_at', null)
      .eq('due_date', userLocalDate)
      .order('important', { ascending: false })
      .order('urgent', { ascending: false })
      .order('today_sort_order', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true, nullsFirst: false });
    taskCount = tasks?.length ?? 0;
    if (tasks && tasks.length > 0) {
      topTaskText = (tasks[0].text as string) ?? null;
    }
  } catch {
    // Soft-fail — better to send a less-rich brief than to skip.
  }

  const emoji = '☀️';
  const title = isSpanish
    ? `${emoji} ${formattedTime} — Resumen matutino`
    : `${emoji} ${formattedTime} — Morning briefing`;

  // Body assembly. Cap "top task" text at 40 chars so the body
  // stays under iOS's recommended 150-char ceiling.
  const trimTop = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);
  const tasksLabelOne = isSpanish ? 'tarea' : 'task';
  const tasksLabelMany = isSpanish ? 'tareas' : 'tasks';
  const forToday = isSpanish ? 'hoy' : 'for today';
  const topPrefix = isSpanish ? 'Primero' : 'Top';
  const taskLabel = taskCount === 1 ? tasksLabelOne : tasksLabelMany;

  let body: string;

  if (taskCount === 0) {
    // No tasks → warm empty-state. Reinforces that the briefing is
    // useful even on quiet days; missing pings would erode trust.
    body = isSpanish
      ? 'No tienes tareas hoy. ¡Disfruta el día!'
      : "No tasks for today. Enjoy your day!";
  } else {
    const head = `${taskCount} ${taskLabel} ${forToday}`;
    const tail = topTaskText ? ` · ${topPrefix}: ${trimTop(topTaskText)}` : '';
    const candidate = `${head}${tail}`;
    body = candidate.length > 120 ? head : candidate;
  }

  return { title, body, url: '/today' };
}

/** Send a pre-built push payload (title + body + deep-link URL).
 *  Mirrors sendPulsePush's transport layer but accepts the copy
 *  from the caller — used by the morning-briefing flow which
 *  builds its body from live task + grocery counts. */
async function sendBriefingPush(
  admin: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url: string },
): Promise<'sent' | 'no-subs' | 'failed'> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);
  if (!subs || subs.length === 0) return 'no-subs';

  const json = JSON.stringify({
    // kind stays 'pulse_reminder' so the existing service-worker
    // click handler in public/sw.js routes via data.url without
    // needing an SW change. Semantic drift on the kind is fine —
    // the SW only branches on its presence.
    kind: 'pulse_reminder',
    title: payload.title,
    body: payload.body,
    data: { mode: 'morning-briefing', url: payload.url },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
        {
          TTL: 60 * 60 * 4,
          urgency: 'high',
          headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        },
      );
      sent += 1;
      admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', s.id)
        .then(() => {});
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404 || e.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
  return sent > 0 ? 'sent' : 'failed';
}

async function sendPulsePush(
  admin: SupabaseClient,
  userId: string,
  mode: 'morning' | 'evening' | 'presence',
  displayName: string,
  language: 'en-US' | 'es-MX',
  reminderTime: string,
): Promise<'sent' | 'no-subs' | 'failed'> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);
  if (!subs || subs.length === 0) return 'no-subs';

  const isSpanish = language === 'es-MX';
  // Format the reminder time as a 12-hour clock for the title (a
  // user with reminder set to "19:55" sees "7:55 PM"). Locale-aware
  // so es-MX users get "7:55 p.m." which is the convention there.
  const formattedTime = formatReminderTime(reminderTime, isSpanish ? 'es-MX' : 'en-US');
  // Sharper copy: emoji + time + clear noun. The time + clock emoji
  // make the notification recognizable in a stack at a glance even
  // when the body text is collapsed.
  const emoji = mode === 'morning' ? '☀️' : mode === 'evening' ? '🌙' : '⏸️';
  const title = isSpanish
    ? mode === 'morning'
      ? `${emoji} ${formattedTime} — Pulso matutino`
      : mode === 'evening'
      ? `${emoji} ${formattedTime} — Pulso nocturno`
      : `${emoji} ${formattedTime} — Pausa de mediodía`
    : mode === 'morning'
    ? `${emoji} ${formattedTime} — Morning Pulse`
    : mode === 'evening'
    ? `${emoji} ${formattedTime} — Evening Pulse`
    : `${emoji} ${formattedTime} — Mid-day Pause`;
  const body = isSpanish
    ? mode === 'morning'
      ? 'Una pregunta. Dos minutos.'
      : mode === 'evening'
      ? 'Cierra el día.'
      : '¿Dónde está tu atención ahora mismo?'
    : mode === 'morning'
    ? 'One question. Two minutes.'
    : mode === 'evening'
    ? 'Close the loop on your day.'
    : "Where's your attention right now?";
  // All three pulse modes (morning / mid-day Presence / evening) land
  // on the Pulse system notebook. PR 1 of the wall restructure moved
  // the pulse hero into /notebooks/pulse (DailyPulseCard +
  // PresenceCapture relocated from /home). The mode field stays in
  // the payload for SW + analytics.
  const url = '/notebooks/pulse';
  const payload = JSON.stringify({
    kind: 'pulse_reminder',
    title,
    body,
    data: { mode, url },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        {
          TTL: 60 * 60 * 4, // 4-hour TTL
          urgency: 'high', // bumped from 'normal' so iOS doesn't batch-defer
          // iOS web push respects apns-priority + apns-push-type. With
          // priority 10 + push-type 'alert', the notification surfaces
          // immediately and (when the user has Time Sensitive enabled
          // in Focus settings) breaks through Focus modes. Critical
          // Alerts bypass silent mode too, but those require Apple
          // entitlements unavailable to PWAs — this is the strongest
          // we can do.
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
        },
      );
      sent += 1;
      admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', s.id)
        .then(() => {});
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404 || e.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
  return sent > 0 ? 'sent' : 'failed';
}

export async function POST(req: Request) {
  const expected = (process.env.PULSE_REMINDER_CRON_SECRET ?? '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!configureWebPush()) {
    return NextResponse.json({ error: 'no-vapid-keys' }, { status: 500 });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !serviceKey) {
    return NextResponse.json({ error: 'no-supabase' }, { status: 500 });
  }
  const admin = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  log('start');

  // Pull every profile that has at least one pulse reminder enabled.
  // Cap at BATCH_LIMIT — the cron fires every 5min so even 200/run
  // covers a healthy active-user pool with headroom.
  // Presence reminder defaults to ON for users who haven't toggled it,
  // so the OR filter must also accept profiles where presence_reminder
  // is undefined (NULL in JSONB). The simplest correct approach: don't
  // filter on presence_reminder at the SQL level at all — let the
  // per-profile loop apply the default-on logic. We still keep the
  // morning/evening OR filter so we don't process profiles with all
  // three explicitly off.
  //
  // Practical cost: if a user has morning + evening explicitly OFF and
  // no presence preference, they currently won't show up in this
  // query. Acceptable — the only way to opt back in is to flip a
  // toggle, which writes the field and brings them back into the OR.
  const { data: profiles, error } = await admin
    .from('profiles')
    .select(
      'id, display_name, timezone, notification_preferences, last_morning_pulse_reminder_at, last_evening_pulse_reminder_at, last_presence_pulse_reminder_at, primary_use, language',
    )
    .or(
      'notification_preferences->>morning_reminder.eq.true,notification_preferences->>evening_reminder.eq.true,notification_preferences->>presence_reminder.eq.true,notification_preferences->>presence_reminder.is.null',
    )
    .limit(BATCH_LIMIT);
  if (error) {
    log('profile-fetch-failed', { msg: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date();
  const results: Array<{ userId: string; status: string }> = [];

  for (const p of (profiles ?? []) as ProfileRow[]) {
    const tz = p.timezone || 'UTC';
    const local = localParts(now, tz);
    if (!local) {
      results.push({ userId: p.id, status: 'tz-invalid' });
      continue;
    }

    const prefs = p.notification_preferences ?? {};
    const morningOn = prefs.morning_reminder === true;
    const eveningOn = prefs.evening_reminder === true;
    // Presence default-on: undefined → on. Users opt OUT explicitly.
    const presenceOn = prefs.presence_reminder !== false;
    const morningTime = prefs.reminder_times?.morning || DEFAULT_MORNING_TIME;
    const eveningTime = prefs.reminder_times?.evening || DEFAULT_EVENING_TIME;
    const presenceTime = prefs.reminder_times?.presence || DEFAULT_PRESENCE_TIME;

    // PR 2 retired the primary_use scope — pulse reminders fire for
    // any user whose individual mode toggles are on. The opt-in for
    // pulse-as-a-feature is each toggle in Settings, not a global
    // tasks/journal switch.

    let fired = false;

    if (morningOn) {
      const diff = minutesDiff(local, morningTime);
      if (diff !== null && diff <= WINDOW_MIN) {
        if (alreadySentToday(p.last_morning_pulse_reminder_at, local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'morning-already-sent' });
        } else {
          // Morning push is now a briefing (digest of today's tasks
          // + groceries), not a pulse-journaling nudge. We
          // intentionally DON'T gate on pulseDoneToday — the
          // briefing is independent of whether the user wrote a
          // morning pulse. The existing alreadySentToday gate still
          // dedups against double-fire within the 5-min window.
          const lang = p.language === 'es-MX' ? 'es-MX' : 'en-US';
          const briefing = await buildMorningBriefing(admin, p, local.yyyymmdd, lang, morningTime);
          const r = await sendBriefingPush(admin, p.id, briefing);
          await admin
            .from('profiles')
            .update({ last_morning_pulse_reminder_at: now.toISOString() })
            .eq('id', p.id);
          results.push({ userId: p.id, status: `morning-briefing-${r}` });
          fired = true;
        }
      }
    }

    if (eveningOn && !fired) {
      const diff = minutesDiff(local, eveningTime);
      if (diff !== null && diff <= WINDOW_MIN) {
        if (alreadySentToday(p.last_evening_pulse_reminder_at, local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'evening-already-sent' });
        } else if (await pulseDoneToday(admin, p.id, 'evening', local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'evening-already-done' });
        } else {
          const r = await sendPulsePush(admin, p.id, 'evening', p.display_name ?? '', p.language === 'es-MX' ? 'es-MX' : 'en-US', eveningTime);
          await admin
            .from('profiles')
            .update({ last_evening_pulse_reminder_at: now.toISOString() })
            .eq('id', p.id);
          results.push({ userId: p.id, status: `evening-${r}` });
          fired = true;
        }
      }
    }

    // Mid-day Presence pause. Independent of morning/evening firing —
    // we want users who already did their morning pulse to still get
    // the mid-day cue. Same dedup machinery as the other two.
    if (presenceOn && !fired) {
      const diff = minutesDiff(local, presenceTime);
      if (diff !== null && diff <= WINDOW_MIN) {
        if (alreadySentToday(p.last_presence_pulse_reminder_at, local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'presence-already-sent' });
        } else if (await pulseDoneToday(admin, p.id, 'presence', local.yyyymmdd, tz)) {
          // The presence "done" check is intentionally lenient — even
          // one pause today suppresses the reminder. Users can take
          // additional pauses voluntarily; we just don't push them.
          results.push({ userId: p.id, status: 'presence-already-done' });
        } else {
          const r = await sendPulsePush(admin, p.id, 'presence', p.display_name ?? '', p.language === 'es-MX' ? 'es-MX' : 'en-US', presenceTime);
          await admin
            .from('profiles')
            .update({ last_presence_pulse_reminder_at: now.toISOString() })
            .eq('id', p.id);
          results.push({ userId: p.id, status: `presence-${r}` });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Plan reminders — daily push at user-local plan_items.reminder_time.
  //
  // Independent of morning/evening/presence pulses: a user who has all
  // pulse toggles off may still want plan reminders, and vice versa.
  // Tasks-only users ARE eligible (plans are productivity-shaped, not
  // journaling, so the tasks-only opt-out doesn't apply).
  //
  // Dedup: plan_items.last_reminder_sent_at — we don't fire a second
  // push the same user-local day even if the cron ticks 3+ times in
  // the ±5 min window.
  // ─────────────────────────────────────────────────────────────────
  const planResults = await firePlanReminders(admin, now);
  for (const r of planResults) results.push(r);

  log('done', { count: results.length });
  return NextResponse.json({ processed: results.length, results });
}

interface PlanItemRow {
  id: string;
  if_then_text: string;
  reminder_time: string;
  last_reminder_sent_at: string | null;
  plans: {
    id: string;
    user_id: string;
    title: string;
  } | null;
}

async function firePlanReminders(
  admin: SupabaseClient,
  now: Date,
): Promise<Array<{ userId: string; status: string }>> {
  const out: Array<{ userId: string; status: string }> = [];

  const { data: rows, error: rowsErr } = await admin
    .from('plan_items')
    .select('id, if_then_text, reminder_time, last_reminder_sent_at, plans!inner(id, user_id, title, status)')
    .not('reminder_time', 'is', null)
    .eq('plans.status', 'active')
    .limit(500);
  if (rowsErr) {
    log('plan-fetch-failed', { msg: rowsErr.message });
    return out;
  }
  const items = (rows as unknown as PlanItemRow[]) ?? [];
  if (items.length === 0) return out;

  // Bulk fetch the owning users' timezones + language so we don't
  // round-trip per item.
  const userIds = Array.from(
    new Set(items.map((it) => it.plans?.user_id).filter((u): u is string => !!u)),
  );
  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, timezone, language, display_name')
    .in('id', userIds);
  const profileMap = new Map<string, { tz: string; lang: 'en-US' | 'es-MX'; name: string }>();
  for (const r of (profileRows ?? []) as Array<{
    id: string;
    timezone: string | null;
    language: string | null;
    display_name: string | null;
  }>) {
    profileMap.set(r.id, {
      tz: r.timezone || 'UTC',
      lang: r.language === 'es-MX' ? 'es-MX' : 'en-US',
      name: r.display_name ?? '',
    });
  }

  for (const it of items) {
    const userId = it.plans?.user_id;
    if (!userId) continue;
    const prof = profileMap.get(userId);
    if (!prof) continue;
    const local = localParts(now, prof.tz);
    if (!local) {
      out.push({ userId, status: 'plan-tz-invalid' });
      continue;
    }
    const diff = minutesDiff(local, it.reminder_time);
    if (diff === null || diff > WINDOW_MIN) continue;
    if (alreadySentToday(it.last_reminder_sent_at, local.yyyymmdd, prof.tz)) {
      out.push({ userId, status: 'plan-already-sent' });
      continue;
    }
    const r = await sendPlanPush(admin, userId, it, prof.lang);
    await admin
      .from('plan_items')
      .update({ last_reminder_sent_at: now.toISOString() })
      .eq('id', it.id);
    out.push({ userId, status: `plan-${r}` });
  }
  return out;
}

async function sendPlanPush(
  admin: SupabaseClient,
  userId: string,
  item: PlanItemRow,
  language: 'en-US' | 'es-MX',
): Promise<'sent' | 'no-subs' | 'failed'> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);
  if (!subs || subs.length === 0) return 'no-subs';

  const isSpanish = language === 'es-MX';
  const formattedTime = formatReminderTime(item.reminder_time, isSpanish ? 'es-MX' : 'en-US');
  // The if-then text is the user-meaningful payload; the time leads
  // so the lockscreen at-a-glance read is "9:45 PM — plug phone in".
  const ifThen = item.if_then_text.slice(0, 120);
  const title = `⏰ ${formattedTime} — ${ifThen}`;
  const body = isSpanish ? 'Tu plan WOOP. Toca para abrir.' : 'Your WOOP plan. Tap to open.';
  const payload = JSON.stringify({
    kind: 'plan_reminder',
    title,
    body,
    data: { plan_item_id: item.id, url: '/home' },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        {
          TTL: 60 * 60 * 4,
          urgency: 'high',
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
        },
      );
      sent += 1;
      admin
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', s.id)
        .then(() => {});
    } catch (err) {
      const e = err as { statusCode?: number };
      if (e.statusCode === 404 || e.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
  }
  return sent > 0 ? 'sent' : 'failed';
}
