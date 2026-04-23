// POST /api/reminders/snooze
// Called from the service-worker notificationclick handler when the
// user taps "Snooze 10m". Token is an HMAC-signed payload the edge
// function stamped into the push payload — no Supabase session
// required at notification-tap time (SW can't easily access it).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyReminderToken } from '@/lib/server/reminderTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  task_id?: string;
  minutes?: number;
  token?: string;
}

export async function POST(req: Request) {
  const secret = process.env.REMINDER_ACTION_HMAC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad-body' }, { status: 400 });
  }
  if (!body.task_id || !body.token) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 });
  }

  const payload = verifyReminderToken(body.token, secret);
  if (!payload || payload.action !== 'snooze' || payload.task_id !== body.task_id) {
    return NextResponse.json({ error: 'invalid-token' }, { status: 403 });
  }

  const minutes = Math.max(1, Math.min(240, body.minutes ?? 10));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await admin
    .from('tasks')
    .update({
      remind_snoozed_until: until,
      remind_sent_at: null, // cron will re-pick it at `until`
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.task_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, snoozed_until: until });
}
