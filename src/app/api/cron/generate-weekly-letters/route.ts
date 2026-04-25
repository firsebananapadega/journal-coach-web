// POST /api/cron/generate-weekly-letters
//
// Called weekly by Supabase pg_cron (Sun 23:00 UTC). For every user
// with ≥3 entries in the last 7 days and no `weekly_letters` row for
// the current ISO-week, generate a letter via Gemini, persist it, and
// fire a Web Push so the user sees it on their next app open.
//
// Auth: shared Bearer secret (WEEKLY_LETTER_CRON_SECRET) — baked into
// the cron SQL so only Supabase's own jobs can reach it.
//
// Mirrors the shape of /api/cron/send-reminders:
//   * service-role Supabase client
//   * VAPID Web Push fan-out with stale-subscription pruning
//   * per-user try/catch so one failure doesn't stop the batch

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import {
  buildWeeklyLetter,
  getWeekKey,
  WEEKLY_LETTER_MODEL,
} from '@/lib/weeklyReflection';
import { callGeminiServer } from '@/lib/server/gemini';
import { getGuideOrDefault } from '@/lib/guideConfigs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Letters can take ~10–15s each (two parallel Gemini calls). Keep the
// batch small so we stay well under the 60s function ceiling.
const BATCH_LIMIT = 20;
// Minimum journal entries (non-pulse, non-practice) in the past 7
// days before we bother generating a letter. Below this threshold the
// letter would be thin — skip and let the user build more material.
const MIN_ENTRIES = 3;

interface ProfileRow {
  id: string;
  display_name: string | null;
  preferred_guide: string | null;
}

interface EntryRow {
  id: string;
  created_at: string;
  mood_label: string | null;
  entry_type: string;
  content_text: string | null;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function configureWebPush() {
  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const contact = (process.env.VAPID_CONTACT || 'mailto:hello@example.com').trim();
  if (!pub || !priv) return false;
  webpush.setVapidDetails(contact, pub, priv);
  return true;
}

function log(tag: string, extra?: Record<string, unknown>) {
  console.log('[weekly-letter-cron]', JSON.stringify({ tag, ts: Date.now(), ...extra }));
}

/** Gemini invoker suitable for buildWeeklyLetter — returns plain text.  */
const serverInvoker = async (model: string, prompt: string): Promise<string> => {
  const r = await callGeminiServer(model, prompt);
  return r.text;
};

async function sendLetterPush(
  admin: SupabaseClient,
  userId: string,
  letterId: string,
  guideName: string,
  preview: string,
): Promise<'sent' | 'no-subs' | 'failed'> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);

  if (!subs || subs.length === 0) return 'no-subs';

  const payload = JSON.stringify({
    kind: 'weekly_letter',
    title: `${guideName} wrote you a letter`,
    body: preview.slice(0, 180),
    data: {
      letter_id: letterId,
      url: '/letters',
    },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 * 3, urgency: 'normal' }, // 3 days — plenty
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

async function processUser(
  admin: SupabaseClient,
  profile: ProfileRow,
  weekKey: string,
): Promise<{ userId: string; status: string; error?: string }> {
  const userId = profile.id;

  // Idempotency: already have a row for this week? Skip.
  const { data: existing } = await admin
    .from('weekly_letters')
    .select('id')
    .eq('user_id', userId)
    .eq('week_key', weekKey)
    .maybeSingle();
  if (existing) {
    return { userId, status: 'already-delivered' };
  }

  // Fetch last 7 days of reflective entries. We deliberately exclude
  // `pulse` and `practice` rows — those are check-in ritual data, not
  // the narrative entries the letter is meant to mirror back.
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: entries, error: entriesErr } = await admin
    .from('journal_entries')
    .select('id, created_at, mood_label, entry_type, content_text')
    .eq('user_id', userId)
    .gte('created_at', weekAgoIso)
    .not('entry_type', 'in', '(pulse,practice)')
    .order('created_at', { ascending: true });

  if (entriesErr) {
    return { userId, status: 'entry-fetch-failed', error: entriesErr.message };
  }
  const rows = (entries ?? []) as EntryRow[];
  if (rows.length < MIN_ENTRIES) {
    return { userId, status: 'too-few-entries' };
  }

  // Build the letter. Locale defaults to English for the cron —
  // profile doesn't yet carry a language field, and the client path
  // still handles Spanish speakers via getLocale(). When we add
  // per-user locale to profiles we can thread it in here.
  const guide = getGuideOrDefault(profile.preferred_guide);
  let reflection;
  try {
    reflection = await buildWeeklyLetter({
      entries: rows.map((r) => ({
        created_at: r.created_at,
        mood_label: r.mood_label,
        entry_type: r.entry_type,
        content_text: r.content_text,
      })),
      userName: profile.display_name || '',
      guideName: guide.name,
      locale: 'en',
      dateLocale: 'en-US',
      weekKey,
      callGemini: serverInvoker,
    });
  } catch (err) {
    return {
      userId,
      status: 'generate-failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Persist before attempting delivery so a push failure doesn't
  // lose the letter.
  const { data: inserted, error: insertErr } = await admin
    .from('weekly_letters')
    .insert({
      user_id: userId,
      week_key: weekKey,
      guide_id: guide.id,
      letter_text: reflection.letter,
      themes: reflection.themes,
      model: WEEKLY_LETTER_MODEL,
      generated_at: reflection.generatedAt,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return {
      userId,
      status: 'insert-failed',
      error: insertErr?.message ?? 'no row returned',
    };
  }

  // Push. If nobody's subscribed we still succeeded — the home card
  // will surface the letter on next app open.
  const pushResult = await sendLetterPush(
    admin,
    userId,
    inserted.id,
    guide.name,
    reflection.letter,
  );
  if (pushResult === 'sent') {
    await admin
      .from('weekly_letters')
      .update({ delivered_via: ['push'] })
      .eq('id', inserted.id);
  }

  return { userId, status: `delivered-${pushResult}` };
}

export async function POST(req: Request) {
  const expected = (process.env.WEEKLY_LETTER_CRON_SECRET ?? '').trim();
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

  const weekKey = getWeekKey();
  log('start', { weekKey });

  // Pull profiles of users active in the past week — cheap filter
  // that avoids fanning out to dormant accounts. We still re-check
  // entry count per-user inside processUser().
  const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeRows, error: activeErr } = await admin
    .from('journal_entries')
    .select('user_id')
    .gte('created_at', weekAgoIso)
    .not('entry_type', 'in', '(pulse,practice)')
    .limit(5000);
  if (activeErr) {
    log('active-query-failed', { error: activeErr.message });
    return NextResponse.json({ error: activeErr.message }, { status: 500 });
  }
  const activeUserIds = Array.from(
    new Set(((activeRows ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  ).slice(0, BATCH_LIMIT);

  if (activeUserIds.length === 0) {
    log('no-active-users');
    return NextResponse.json({ processed: 0, results: [] });
  }

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, display_name, preferred_guide')
    .in('id', activeUserIds);
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const results: Array<{ userId: string; status: string; error?: string }> = [];
  for (const p of (profiles ?? []) as ProfileRow[]) {
    try {
      const r = await processUser(admin, p, weekKey);
      results.push(r);
    } catch (err) {
      results.push({
        userId: p.id,
        status: 'unhandled-error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log('done', { count: results.length });
  return NextResponse.json({ processed: results.length, weekKey, results });
}
