// POST /api/grocery/invite
//
// Three branches based on whether the recipient email resolves to an
// existing auth.users row + their membership status:
//
//   1. Already a member of the active list  → mode='already_member'
//   2. Existing user, not yet a member       → mode='in_app'
//      Inserts a row in grocery_list_pending_invites that the
//      recipient sees as a banner on /groceries (no email sent).
//   3. Email not registered                  → mode='email'
//      Falls back to the v2 magic-link flow via inviteUserByEmail
//      so the recipient lands on /share/grocery/<token> already
//      signed in.
//
// Auth: Bearer access_token from the OWNER's Supabase session
// (mirrors src/app/api/push/subscribe/route.ts).

import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  email?: string;
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

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// Find an auth user by email using the service role client.
// supabase.auth.admin.listUsers paginates; for a single-email lookup we
// page-walk and short-circuit on the first match.
// (Typed loosely because @supabase/supabase-js's generic-heavy
// SupabaseClient type doesn't compose cleanly with helper signatures.)
type AdminClientLike = {
  auth: {
    admin: {
      listUsers: (args: { page: number; perPage: number }) => Promise<{
        data: { users: User[] } | null;
        error: { message: string } | null;
      }>;
    };
  };
};
async function findUserByEmail(
  adminClient: AdminClientLike,
  email: string,
): Promise<User | null> {
  const lowered = email.toLowerCase();
  // Most projects have <1k users so page 1 of 1000 will catch them.
  // Walk a few extra pages for safety with bigger projects.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) return null;
    if (!data || data.users.length === 0) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === lowered);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function POST(req: Request) {
  const callerAuth = await userFromReq(req);
  if (!callerAuth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad-body' }, { status: 400 });
  }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'invalid-email' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server-misconfig' }, { status: 500 });
  }

  // Active list + caller's display_name (snapshot for the banner).
  const { data: profile, error: profileErr } = await callerAuth.userClient
    .from('profiles')
    .select('active_grocery_list_id, display_name')
    .eq('id', callerAuth.userId)
    .maybeSingle();
  if (profileErr || !profile?.active_grocery_list_id) {
    return NextResponse.json({ error: 'no-active-list' }, { status: 400 });
  }
  const listId = profile.active_grocery_list_id as string;
  const inviterName = (profile.display_name as string) ?? null;

  // List name (for the banner label).
  const { data: listRow } = await callerAuth.userClient
    .from('grocery_lists')
    .select('name')
    .eq('id', listId)
    .maybeSingle();
  const listName = (listRow?.name as string) ?? 'Groceries';

  // Service-role for the auth.admin lookups + the SECURITY DEFINER-style
  // operations (the pending-invite insert itself goes through the
  // user-scoped client so RLS gates membership properly).
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const recipient = await findUserByEmail(adminClient, email);

  if (recipient) {
    // Branch 1: already a member?
    const { data: membership } = await callerAuth.userClient
      .from('grocery_list_members')
      .select('user_id')
      .eq('list_id', listId)
      .eq('user_id', recipient.id)
      .maybeSingle();
    if (membership) {
      return NextResponse.json({
        ok: true,
        mode: 'already_member',
        display_name: recipient.user_metadata?.display_name ?? null,
      });
    }

    // Branch 2: in-app pending invite. UPSERT so re-invites refresh
    // the row instead of failing on the unique constraint.
    const { error: pendingErr } = await callerAuth.userClient
      .from('grocery_list_pending_invites')
      .upsert(
        {
          list_id: listId,
          recipient_user_id: recipient.id,
          inviter_user_id: callerAuth.userId,
          inviter_name_snapshot: inviterName,
          list_name_snapshot: listName,
        },
        { onConflict: 'list_id,recipient_user_id' },
      );
    if (pendingErr) {
      return NextResponse.json({ error: pendingErr.message }, { status: 500 });
    }

    // Look up the recipient's display_name from profiles for the
    // success copy (auth metadata may be empty).
    const { data: recipientProfile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', recipient.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      mode: 'in_app',
      display_name: (recipientProfile?.display_name as string) ?? null,
    });
  }

  // Branch 3: email magic-link. Need a token-bearing redirectTo so the
  // recipient lands on /share/grocery/<token> after sign-in.
  const { data: inviteRow, error: inviteRowErr } = await callerAuth.userClient
    .from('grocery_list_invites')
    .insert({ list_id: listId, created_by: callerAuth.userId })
    .select('token')
    .single();
  if (inviteRowErr || !inviteRow?.token) {
    return NextResponse.json(
      { error: inviteRowErr?.message ?? 'invite-create-failed' },
      { status: 500 },
    );
  }
  const token = inviteRow.token as string;

  const origin = req.headers.get('origin') ?? '';
  if (!origin || !/^https?:\/\//.test(origin)) {
    return NextResponse.json({ error: 'missing-origin' }, { status: 400 });
  }
  const redirectTo = `${origin}/share/grocery/${token}`;

  const { error: inviteEmailErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (inviteEmailErr) {
    // Edge case: race between findUserByEmail and inviteUserByEmail
    // (the user signed up between the two calls). Fall back to magic
    // link, which signs the now-existing user in and lands them on
    // the same page.
    const { error: magicErr } = await adminClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (magicErr) {
      return NextResponse.json(
        { error: magicErr.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, mode: 'email', token });
}
