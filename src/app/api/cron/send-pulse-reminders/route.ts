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
    reminder_times?: { morning?: string; evening?: string };
  } | null;
  last_morning_pulse_reminder_at: string | null;
  last_evening_pulse_reminder_at: string | null;
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
  mode: 'morning' | 'evening',
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

async function sendPulsePush(
  admin: SupabaseClient,
  userId: string,
  mode: 'morning' | 'evening',
  displayName: string,
  language: 'en-US' | 'es-MX',
): Promise<'sent' | 'no-subs' | 'failed'> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);
  if (!subs || subs.length === 0) return 'no-subs';

  const isSpanish = language === 'es-MX';
  const greeting = displayName ? `, ${displayName}` : '';
  const title = isSpanish
    ? mode === 'morning'
      ? `Pulso matutino${greeting}`
      : `Pulso nocturno${greeting}`
    : mode === 'morning'
    ? `Morning pulse${greeting}`
    : `Evening pulse${greeting}`;
  const body = isSpanish
    ? mode === 'morning'
      ? 'Toma 30 segundos para fijar tu intención de hoy.'
      : 'Una breve reflexión antes de descansar.'
    : mode === 'morning'
    ? "Take 30 seconds to set today's intention."
    : 'A short reflection before you wind down.';
  const payload = JSON.stringify({
    kind: 'pulse_reminder',
    title,
    body,
    data: { mode, url: '/home' },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 4, urgency: 'normal' }, // 4-hour TTL — pulse is time-sensitive but not high
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
  const { data: profiles, error } = await admin
    .from('profiles')
    .select(
      'id, display_name, timezone, notification_preferences, last_morning_pulse_reminder_at, last_evening_pulse_reminder_at, primary_use, language',
    )
    .or(
      'notification_preferences->>morning_reminder.eq.true,notification_preferences->>evening_reminder.eq.true',
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
    const morningTime = prefs.reminder_times?.morning || DEFAULT_MORNING_TIME;
    const eveningTime = prefs.reminder_times?.evening || DEFAULT_EVENING_TIME;

    // Tasks-only users opted out of journaling entirely. No pulse
    // reminders for them even if the toggles are stale-on from
    // before they switched.
    if (p.primary_use === 'tasks') {
      results.push({ userId: p.id, status: 'gate-tasks-only' });
      continue;
    }

    let fired = false;

    if (morningOn) {
      const diff = minutesDiff(local, morningTime);
      if (diff !== null && diff <= WINDOW_MIN) {
        if (alreadySentToday(p.last_morning_pulse_reminder_at, local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'morning-already-sent' });
        } else if (await pulseDoneToday(admin, p.id, 'morning', local.yyyymmdd, tz)) {
          results.push({ userId: p.id, status: 'morning-already-done' });
        } else {
          const r = await sendPulsePush(admin, p.id, 'morning', p.display_name ?? '', p.language === 'es-MX' ? 'es-MX' : 'en-US');
          await admin
            .from('profiles')
            .update({ last_morning_pulse_reminder_at: now.toISOString() })
            .eq('id', p.id);
          results.push({ userId: p.id, status: `morning-${r}` });
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
          const r = await sendPulsePush(admin, p.id, 'evening', p.display_name ?? '', p.language === 'es-MX' ? 'es-MX' : 'en-US');
          await admin
            .from('profiles')
            .update({ last_evening_pulse_reminder_at: now.toISOString() })
            .eq('id', p.id);
          results.push({ userId: p.id, status: `evening-${r}` });
        }
      }
    }
  }

  log('done', { count: results.length });
  return NextResponse.json({ processed: results.length, results });
}
