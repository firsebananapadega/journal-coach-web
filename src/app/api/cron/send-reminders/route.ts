// POST /api/cron/send-reminders
// Called every minute by Supabase pg_cron via pg_net.http_post.
// Walks rows in public.tasks with remind_at/remind_snoozed_until in
// the past and no remind_sent_at, signs HMAC tokens for snooze/done,
// encrypts via VAPID, and sends Web Push to each active subscription.
//
// Auth: shared Bearer secret (REMINDER_CRON_SECRET) — also baked
// into the cron job's SQL so only Supabase's own jobs can reach it.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { signReminderToken } from '@/lib/server/reminderTokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

interface TaskRow {
  id: string;
  user_id: string;
  text: string | null;
  reminder_message: string | null;
}
interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const BATCH_LIMIT = 50;

function configureWebPush() {
  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  const contact = (process.env.VAPID_CONTACT || 'mailto:hello@example.com').trim();
  if (!pub || !priv) return false;
  webpush.setVapidDetails(contact, pub, priv);
  return true;
}

async function deliverForTask(
  admin: SupabaseClient,
  task: TaskRow,
  hmacSecret: string,
): Promise<{ attempts: number; sent: number }> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', task.user_id)
    .eq('active', true);

  if (!subs || subs.length === 0) return { attempts: 0, sent: 0 };

  const exp = Date.now() + 48 * 60 * 60 * 1000; // 48 h
  const snoozeToken = signReminderToken(
    { task_id: task.id, action: 'snooze', exp },
    hmacSecret,
  );
  const doneToken = signReminderToken(
    { task_id: task.id, action: 'done', exp },
    hmacSecret,
  );

  const payload = JSON.stringify({
    title: 'Reminder',
    body: (task.reminder_message || task.text || '').slice(0, 240),
    data: {
      task_id: task.id,
      snooze_token: snoozeToken,
      done_token: doneToken,
    },
  });

  let sent = 0;
  for (const s of subs as SubRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload,
        { TTL: 600, urgency: 'high' },
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
  return { attempts: subs.length, sent };
}

export async function POST(req: Request) {
  // `.trim()` defends against trailing newlines from env vars that
  // were set with `echo "..." | vercel env add` (echo adds \n). The
  // bearer off the wire is already trimmed by the replace+trim below.
  const expected = (process.env.REMINDER_CRON_SECRET ?? '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const hmacSecret = (process.env.REMINDER_ACTION_HMAC_SECRET ?? '').trim();
  if (!hmacSecret) {
    return NextResponse.json({ error: 'no-hmac-secret' }, { status: 500 });
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

  // Pick due tasks. coalesce(snooze_until, remind_at) so a snoozed
  // task fires at the snoozed time.
  const nowIso = new Date().toISOString();
  const { data: tasks, error } = await admin
    .from('tasks')
    .select('id, user_id, text, reminder_message, remind_at, remind_snoozed_until, remind_sent_at, completed')
    .eq('completed', false)
    .is('remind_sent_at', null)
    .not('remind_at', 'is', null)
    .or(`remind_snoozed_until.lte.${nowIso},and(remind_snoozed_until.is.null,remind_at.lte.${nowIso})`)
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const results: Array<{ task_id: string; attempts: number; sent: number }> = [];
  for (const t of tasks as TaskRow[]) {
    const r = await deliverForTask(admin, t, hmacSecret);
    results.push({ task_id: t.id, ...r });
    await admin
      .from('tasks')
      .update({ remind_sent_at: new Date().toISOString() })
      .eq('id', t.id);
  }

  return NextResponse.json({ processed: results.length, results });
}
