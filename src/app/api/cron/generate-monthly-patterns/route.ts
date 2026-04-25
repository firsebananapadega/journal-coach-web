// POST /api/cron/generate-monthly-patterns
//
// Phase 4A — once-a-month longitudinal pattern digest.
// Same shape as /api/cron/generate-weekly-letters (Bearer auth →
// service-role Supabase admin client → fan-out per user → Gemini →
// DB insert → web push) but at a 30-day cadence with a richer payload
// (3 named themes + 200-word narrative). Triggered by pg_cron at
// 23:00 UTC on the 1st of each month.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import {
  buildMonthlyPattern,
  getMonthKey,
  MONTHLY_PATTERN_MODEL,
} from '@/lib/monthlyPattern';
import { callGeminiServer } from '@/lib/server/gemini';
import { getGuideOrDefault } from '@/lib/guideConfigs';
import {
  gatherWeeklySignals,
  formatSignalsForPrompt,
} from '@/lib/server/weeklySignals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Larger LLM payload (3 themes JSON + narrative) → keep batch tight.
const BATCH_LIMIT = 15;
// Minimum reflective entries in the past 30 days before we generate a
// pattern. Below this the themes would be thin / synthesized.
const MIN_ENTRIES = 5;

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
  console.log('[monthly-pattern-cron]', JSON.stringify({ tag, ts: Date.now(), ...extra }));
}

const serverInvoker = async (model: string, prompt: string): Promise<string> => {
  const r = await callGeminiServer(model, prompt);
  return r.text;
};

async function sendPatternPush(
  admin: SupabaseClient,
  userId: string,
  patternId: string,
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
    kind: 'monthly_pattern',
    title: `${guideName}: a month of patterns`,
    body: preview.slice(0, 180),
    data: {
      pattern_id: patternId,
      url: '/letters',
    },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 * 7, urgency: 'normal' },
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
  monthKey: string,
): Promise<{ userId: string; status: string; error?: string }> {
  const userId = profile.id;

  const { data: existing } = await admin
    .from('monthly_patterns')
    .select('id')
    .eq('user_id', userId)
    .eq('month_key', monthKey)
    .maybeSingle();
  if (existing) return { userId, status: 'already-delivered' };

  // Reflective entries from the past 30 days. Pulse + practice rows
  // are excluded — they're ritual data, not narrative.
  const monthAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: entries, error: entriesErr } = await admin
    .from('journal_entries')
    .select('id, created_at, mood_label, entry_type, content_text')
    .eq('user_id', userId)
    .gte('created_at', monthAgoIso)
    .not('entry_type', 'in', '(pulse,practice)')
    .order('created_at', { ascending: true });

  if (entriesErr) {
    return { userId, status: 'entry-fetch-failed', error: entriesErr.message };
  }
  const rows = (entries ?? []) as EntryRow[];
  if (rows.length < MIN_ENTRIES) {
    return { userId, status: 'too-few-entries' };
  }

  // Reuse the same signal block as the weekly letter — habits, pulse
  // averages, task completion %, notebook distribution. Gives the
  // monthly prompt the same behavioral context (over a 30-day window
  // gatherWeeklySignals applies a 7-day default; we widen here).
  const signals = await gatherWeeklySignals(admin, userId, new Date());
  const signalsBlock = formatSignalsForPrompt(signals);

  const guide = getGuideOrDefault(profile.preferred_guide);
  let pattern;
  try {
    pattern = await buildMonthlyPattern({
      entries: rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        mood_label: r.mood_label,
        entry_type: r.entry_type,
        content_text: r.content_text,
      })),
      userName: profile.display_name || '',
      guideName: guide.name,
      monthKey,
      signalsBlock,
      callGemini: serverInvoker,
    });
  } catch (err) {
    return {
      userId,
      status: 'generate-failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { data: inserted, error: insertErr } = await admin
    .from('monthly_patterns')
    .insert({
      user_id: userId,
      month_key: monthKey,
      guide_id: guide.id,
      narrative: pattern.narrative,
      themes: pattern.themes,
      model: MONTHLY_PATTERN_MODEL,
      generated_at: pattern.generatedAt,
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

  const pushResult = await sendPatternPush(
    admin,
    userId,
    inserted.id,
    guide.name,
    pattern.narrative,
  );
  if (pushResult === 'sent') {
    await admin
      .from('monthly_patterns')
      .update({ delivered_via: ['push'] })
      .eq('id', inserted.id);
  }

  return { userId, status: `delivered-${pushResult}` };
}

export async function POST(req: Request) {
  const expected = (process.env.MONTHLY_PATTERN_CRON_SECRET ?? '').trim();
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

  const monthKey = getMonthKey();
  log('start', { monthKey });

  const monthAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeRows, error: activeErr } = await admin
    .from('journal_entries')
    .select('user_id')
    .gte('created_at', monthAgoIso)
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
      const r = await processUser(admin, p, monthKey);
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
  return NextResponse.json({ processed: results.length, monthKey, results });
}
