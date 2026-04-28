// GET /api/grocery/recent-contacts
//
// Surfaces up to 8 distinct people the caller already shares lists
// with, OR has previously sent a pending invite to. Powers the
// quick-pick avatars at the top of the share sheet — type-to-filter
// happens client-side against this fixed pool, NOT against the full
// user base (privacy).
//
// Auth: Bearer access_token (mirrors src/app/api/push/subscribe/route.ts).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contact {
  user_id: string;
  display_name: string | null;
  last_shared_at: string;
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

export async function GET(req: Request) {
  const auth = await userFromReq(req);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Step 1: every list the caller is in.
  const { data: myMemberships, error: memErr } = await auth.userClient
    .from('grocery_list_members')
    .select('list_id')
    .eq('user_id', auth.userId);
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  const listIds = (myMemberships ?? []).map((r) => r.list_id as string);

  // Step 2: other members of those lists (excluding the caller).
  // Plus past pending-invite recipients sent by the caller.
  const sources: Record<string, Contact> = {};

  if (listIds.length > 0) {
    const { data: others, error: otherErr } = await auth.userClient
      .from('grocery_list_members')
      .select('user_id, display_name_snapshot, joined_at')
      .in('list_id', listIds);
    if (otherErr) return NextResponse.json({ error: otherErr.message }, { status: 500 });
    for (const row of others ?? []) {
      const uid = row.user_id as string;
      if (uid === auth.userId) continue;
      const ts = (row.joined_at as string) ?? new Date(0).toISOString();
      const existing = sources[uid];
      if (!existing || existing.last_shared_at < ts) {
        sources[uid] = {
          user_id: uid,
          display_name: (row.display_name_snapshot as string) ?? null,
          last_shared_at: ts,
        };
      }
    }
  }

  const { data: sentInvites } = await auth.userClient
    .from('grocery_list_pending_invites')
    .select('recipient_user_id, inviter_name_snapshot, list_name_snapshot, created_at')
    .eq('inviter_user_id', auth.userId);
  for (const row of sentInvites ?? []) {
    const uid = row.recipient_user_id as string;
    const ts = (row.created_at as string) ?? new Date(0).toISOString();
    const existing = sources[uid];
    if (!existing || existing.last_shared_at < ts) {
      sources[uid] = {
        user_id: uid,
        display_name: existing?.display_name ?? null, // pending row doesn't store recipient name
        last_shared_at: ts,
      };
    }
  }

  // For pending-invite-only contacts we don't have a display_name yet
  // (the pending table only snapshots the inviter's name). Fill those
  // in from the profiles table via service role.
  const missingNames = Object.values(sources).filter((c) => !c.display_name).map((c) => c.user_id);
  if (missingNames.length > 0) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const adminClient = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: profilesRows } = await adminClient
        .from('profiles')
        .select('id, display_name')
        .in('id', missingNames);
      for (const p of profilesRows ?? []) {
        const c = sources[p.id as string];
        if (c) c.display_name = (p.display_name as string) ?? null;
      }
    }
  }

  const contacts = Object.values(sources)
    .sort((a, b) => (a.last_shared_at < b.last_shared_at ? 1 : -1))
    .slice(0, 8);

  return NextResponse.json({ contacts });
}
