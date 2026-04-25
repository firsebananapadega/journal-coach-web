// POST /api/cron/generate-quarterly-letters
//
// Phase 5C — every 90+ days per user. Triggered monthly (1st @ 23:30
// UTC); per-user gate (≥85 days since last quarterly + ≥30 entries
// in the last 90 days) is what makes it effectively quarterly.
//
// Same shape as the weekly + monthly crons (Bearer auth → service-
// role admin → fan-out → Gemini → DB → push) with a longer prompt
// and a richer payload.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import {
  buildQuarterlyLetter,
  getQuarterKey,
  QUARTERLY_LETTER_MODEL,
} from '@/lib/quarterlyLetter';
import { callGeminiServer } from '@/lib/server/gemini';
import { getGuideOrDefault } from '@/lib/guideConfigs';
import {
  gatherWeeklySignals,
  formatSignalsForPrompt,
} from '@/lib/server/weeklySignals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Quarterly prompts are large + responses can run 800 tokens, so
// cap the per-run batch tighter than the weekly cron.
const BATCH_LIMIT = 10;
const MIN_ENTRIES = 30;
const MIN_DAYS_SINCE_LAST_QUARTERLY = 85;

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
  console.log('[quarterly-letter-cron]', JSON.stringify({ tag, ts: Date.now(), ...extra }));
}

const serverInvoker = async (model: string, prompt: string): Promise<string> => {
  const r = await callGeminiServer(model, prompt);
  return r.text;
};

async function sendQuarterlyPush(
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
    kind: 'quarterly_letter',
    title: `${guideName}: a season in review`,
    body: preview.slice(0, 180),
    data: {
      quarterly_id: letterId,
      url: '/letters',
    },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 * 14, urgency: 'normal' }, // 2 weeks — these are slow letters
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
  quarterKey: string,
): Promise<{ userId: string; status: string; error?: string }> {
  const userId = profile.id;

  // Idempotency #1: a row already exists for this calendar quarter.
  const { data: existing } = await admin
    .from('quarterly_letters')
    .select('id')
    .eq('user_id', userId)
    .eq('quarter_key', quarterKey)
    .maybeSingle();
  if (existing) return { userId, status: 'already-delivered' };

  // Idempotency #2: per-user 85-day gate. If their last quarterly was
  // generated less than 85 days ago, skip — we don't want to fire
  // two quarterly letters back-to-back when the calendar quarter
  // happens to roll over a few days after a per-user run.
  const { data: lastQuarterly } = await admin
    .from('quarterly_letters')
    .select('letter_text, generated_at')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorLetterText: string =
    lastQuarterly && typeof lastQuarterly.letter_text === 'string'
      ? lastQuarterly.letter_text
      : '';
  if (lastQuarterly?.generated_at) {
    const ageDays =
      (Date.now() - new Date(lastQuarterly.generated_at).getTime()) /
      (24 * 60 * 60 * 1000);
    if (ageDays < MIN_DAYS_SINCE_LAST_QUARTERLY) {
      return { userId, status: `gate-too-soon-${Math.round(ageDays)}d` };
    }
  }

  // Reflective entries from the past 90 days. Pulse + practice
  // excluded (ritual data, not narrative).
  const cutoffIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: entries, error: entriesErr } = await admin
    .from('journal_entries')
    .select('id, created_at, mood_label, entry_type, content_text')
    .eq('user_id', userId)
    .gte('created_at', cutoffIso)
    .not('entry_type', 'in', '(pulse,practice)')
    .order('created_at', { ascending: true });

  if (entriesErr) {
    return { userId, status: 'entry-fetch-failed', error: entriesErr.message };
  }
  const rows = (entries ?? []) as EntryRow[];
  if (rows.length < MIN_ENTRIES) {
    return { userId, status: `too-few-entries-${rows.length}` };
  }

  // Same signals helper as weekly, but the prompt frames them as a
  // 90-day picture. The 7-day default of gatherWeeklySignals only
  // shapes the labels — the pulse averages, intention follow-through,
  // and habit/task counts at the time of run are still useful
  // longitudinal context.
  const signals = await gatherWeeklySignals(admin, userId, new Date());
  const signalsBlock = formatSignalsForPrompt(signals);

  const guide = getGuideOrDefault(profile.preferred_guide);
  let letter;
  try {
    letter = await buildQuarterlyLetter({
      entries: rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        mood_label: r.mood_label,
        entry_type: r.entry_type,
        content_text: r.content_text,
      })),
      userName: profile.display_name || '',
      guideName: guide.name,
      quarterKey,
      signalsBlock,
      priorLetterText,
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
    .from('quarterly_letters')
    .insert({
      user_id: userId,
      quarter_key: quarterKey,
      guide_id: guide.id,
      letter_text: letter.letter,
      themes: letter.themes,
      arc_entry_ids: letter.arcEntryIds,
      model: QUARTERLY_LETTER_MODEL,
      generated_at: letter.generatedAt,
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

  const pushResult = await sendQuarterlyPush(
    admin,
    userId,
    inserted.id,
    guide.name,
    letter.letter,
  );
  if (pushResult === 'sent') {
    await admin
      .from('quarterly_letters')
      .update({ delivered_via: ['push'] })
      .eq('id', inserted.id);
  }

  return { userId, status: `delivered-${pushResult}` };
}

export async function POST(req: Request) {
  const expected = (process.env.QUARTERLY_LETTER_CRON_SECRET ?? '').trim();
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

  const quarterKey = getQuarterKey();
  log('start', { quarterKey });

  // Active in past 90 days.
  const cutoffIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: activeRows, error: activeErr } = await admin
    .from('journal_entries')
    .select('user_id')
    .gte('created_at', cutoffIso)
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
      const r = await processUser(admin, p, quarterKey);
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
  return NextResponse.json({ processed: results.length, quarterKey, results });
}
