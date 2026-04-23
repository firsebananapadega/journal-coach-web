// POST /api/tasks/complete
// Called from the service-worker notificationclick handler when the
// user taps "Done". Token is an HMAC-signed payload identical in
// shape to the snooze one, but action='done'.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyReminderToken } from '@/lib/server/reminderTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  task_id?: string;
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
  if (!payload || payload.action !== 'done' || payload.task_id !== body.task_id) {
    return NextResponse.json({ error: 'invalid-token' }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { error } = await admin
    .from('tasks')
    .update({
      completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.task_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
