// POST /api/push/subscribe
// Upserts the caller's Web Push subscription into public.push_subscriptions.
// Auth: Bearer access_token from the Supabase session. User-scoped RLS
// on the table guarantees one user can only write their own rows.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  user_agent?: string;
  user_tz?: string;
}

async function userFromReq(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return null;
  return { userId: data.user.id, userClient };
}

export async function POST(req: Request) {
  const auth = await userFromReq(req);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad-body' }, { status: 400 });
  }
  if (!body.endpoint || !body.p256dh || !body.auth) {
    return NextResponse.json({ error: 'missing-fields' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await auth.userClient
    .from('push_subscriptions')
    .upsert(
      {
        user_id: auth.userId,
        endpoint: body.endpoint,
        p256dh: body.p256dh,
        auth: body.auth,
        user_agent: body.user_agent ?? null,
        user_tz: body.user_tz ?? null,
        active: true,
        last_used_at: now,
      },
      { onConflict: 'user_id,endpoint' },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
