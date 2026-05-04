import { create } from 'zustand';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toSentenceCase } from '../lib/stringUtils';
import { getDB } from '../lib/db';
import { enqueue } from '../lib/syncQueue';
import { isOnline } from '../lib/networkStatus';

/** Sentinel store name for the Uncategorized group — the default
 *  landing for any grocery item without a known store assignment.
 *  Always rendered last on /groceries regardless of sort_order, and
 *  is the only group source items can drag OUT of in the current
 *  drag-drop pass. The string IS the marker (no DB schema flag);
 *  consumers compare with this constant rather than literal strings
 *  so we can swap it later without scattering replacements. */
export const UNCATEGORIZED_STORE = 'Uncategorized';

export function isUncategorized(group: { store: string }): boolean {
  return group.store === UNCATEGORIZED_STORE;
}

// Shared, real-time grocery lists.
//
// Each user has one active list (`profiles.active_grocery_list_id`).
// Members can CRUD groups and items; only the owner can rename or
// delete the list itself. Sharing happens through `grocery_list_invites`
// + the `accept_grocery_invite(token)` RPC. Realtime sync is driven
// by row-level postgres_changes filtered by `list_id` — every check-off
// and add is one tiny payload, not the full list.
//
// Self-echo dedup: client generates UUIDs for new items. When realtime
// echoes our own insert, the merge step skips because the id is already
// present.

export interface GroceryGroup {
  id: string;
  list_id: string;
  store: string;
  sort_order: number;
}

export interface GroceryItem {
  id: string;
  list_id: string;
  group_id: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  added_by: string | null;
  sort_order: number;
}

export interface GroceryListMember {
  list_id: string;
  user_id: string;
  role: 'owner' | 'member';
  display_name_snapshot: string | null;
  joined_at: string;
}

export interface GroceryInvite {
  token: string;
  list_id: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

export interface PendingInvite {
  id: string;
  list_id: string;
  recipient_user_id: string;
  inviter_user_id: string;
  inviter_name_snapshot: string | null;
  list_name_snapshot: string | null;
  created_at: string;
  expires_at: string;
}

export interface RecentContact {
  user_id: string;
  display_name: string | null;
  last_shared_at: string;
}

export type InviteResult =
  | { ok: true; mode: 'in_app' | 'email' | 'already_member'; display_name?: string | null }
  | { ok: false; error: string };

interface GroceryState {
  listId: string | null;
  ownerId: string | null;
  loading: boolean;
  error: string | null;
  groups: GroceryGroup[];
  items: GroceryItem[];
  members: GroceryListMember[];
  invites: GroceryInvite[];
  pendingInvitesForMe: PendingInvite[];
  recentContacts: RecentContact[];

  loadActive: () => Promise<void>;
  reconcile: () => Promise<void>;
  /** Drop the localStorage cache for the currently-loaded user. Used
   *  on sign-out so a different account on the same device starts
   *  from a clean slate. */
  purgeCache: () => void;

  fetchPendingInvitesForMe: () => Promise<void>;
  fetchRecentContacts: () => Promise<void>;
  acceptPendingInvite: (id: string) => Promise<void>;
  declinePendingInvite: (id: string) => Promise<void>;
  inviteByEmail: (email: string) => Promise<InviteResult>;
  inviteRecentContact: (userId: string, displayName: string | null) => Promise<InviteResult>;

  addGroup: (store: string) => Promise<GroceryGroup | null>;
  removeGroup: (groupId: string) => Promise<void>;
  addItem: (groupId: string, name: string) => Promise<void>;
  addGroupsFromCapture: (
    groups: { store: string; items: string[] }[],
  ) => Promise<void>;
  toggleItem: (itemId: string) => Promise<void>;
  renameItem: (itemId: string, name: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  markItemDone: (itemId: string) => Promise<void>;
  /** Idempotent inverse of markItemDone: sets completed=false. Used
   *  by the "I have …" flow when a previously-checked item the user
   *  no longer mentioned needs to flip back to "needs to buy." */
  markItemUndone: (itemId: string) => Promise<void>;
  /** Move an existing item to a different group. Optimistic; the
   *  outbox replays the group_id update server-side. Used by the
   *  Uncategorized → store drag-drop on /groceries. */
  moveItemToGroup: (itemId: string, targetGroupId: string) => Promise<void>;
  /** Find-or-create the sentinel "Uncategorized" group on the
   *  current list. Lazy — only creates when a caller actually needs
   *  somewhere to drop unmatched items. Returns the group id. */
  ensureUncategorizedGroup: () => Promise<string | null>;

  /** Voice "I bought X, Y" fallback path. Adds the named items to
   *  the given store already marked completed=true. Used when Gemini
   *  fails to classify but our fuzzy matcher still recognises the
   *  spoken items. */
  addCompletedItems: (store: string, names: string[]) => Promise<void>;

  createInvite: () => Promise<{ token: string; url: string } | null>;
  revokeInvite: (token: string) => Promise<void>;
  leaveList: () => Promise<void>;

  subscribe: () => void;
  unsubscribe: () => void;

  reset: () => void;
}

let channel: RealtimeChannel | null = null;
let visibilityHandler: (() => void) | null = null;
let subscribedListId: string | null = null;

function uuid(): string {
  return crypto.randomUUID();
}

async function getUserId(): Promise<string | null> {
  // getSession is a localStorage read; getUser hits the network and
  // returns null offline, which broke offline reads/writes. The
  // session's cached user id is fine for everything we use it for —
  // RLS validates the JWT on the server side anyway when calls
  // actually drain.
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── Local cache (per-user) ──────────────────────────────────────
// Persists the visible-tab data so cold-opens paint instantly from
// the previous session. Realtime + the live fetch reconcile within
// ~1 s. Tokens (invites) and member rows are NOT cached — invites
// for security, members because the per-user join is fast and
// display-name churn matters.

const CACHE_PREFIX = 'grocery-cache:v1:';

interface GroceryCachePayload {
  listId: string | null;
  ownerId: string | null;
  groups: GroceryGroup[];
  items: GroceryItem[];
  updatedAt: number;
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}${userId}`;
}

function readCache(userId: string): GroceryCachePayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GroceryCachePayload;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCacheFor(userId: string, snapshot: Pick<GroceryState, 'listId' | 'ownerId' | 'groups' | 'items'>): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: GroceryCachePayload = {
      listId: snapshot.listId,
      ownerId: snapshot.ownerId,
      groups: snapshot.groups,
      items: snapshot.items,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(payload));
  } catch {
    // Quota or private mode — silent. Cache is an optimization, not
    // correctness.
  }
}

function purgeCacheFor(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(cacheKey(userId));
  } catch {}
}

// Track the user whose cache we're currently writing so mutations
// know where to persist. Refreshed inside loadActive().
let cachedUserId: string | null = null;

function persistCurrent(state: GroceryState): void {
  if (!cachedUserId) return;
  writeCacheFor(cachedUserId, state);
}

// Find or create the user's personal grocery list. Used when a user has
// no active list yet (first-ever load, or after leaving a shared list).
async function ensurePersonalList(userId: string): Promise<string | null> {
  const { data: existing, error: existingErr } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (existingErr) throw existingErr;
  if (existing && existing.length > 0) return existing[0].id as string;

  const { data: created, error: createErr } = await supabase
    .from('grocery_lists')
    .insert({ owner_id: userId, name: 'Groceries' })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return (created?.id as string) ?? null;
}

export const useGroceryStore = create<GroceryState>((set, get) => ({
  listId: null,
  ownerId: null,
  loading: false,
  error: null,
  groups: [],
  items: [],
  members: [],
  invites: [],
  pendingInvitesForMe: [],
  recentContacts: [],

  loadActive: async () => {
    set({ error: null });
    try {
      // Resolve userId — falling back to module-level cachedUserId
      // when getSession returns null offline (expired access token
      // + failed network refresh). Without the fallback, the
      // previous code wiped groups + items the moment the session
      // lookup failed, even though the cached data was still valid.
      let userId = await getUserId();
      if (!userId && cachedUserId) userId = cachedUserId;

      // Hydrate from cache FIRST. Cache is keyed by userId, so
      // skip if we genuinely have no userId.
      if (userId) {
        cachedUserId = userId;
        const cached = readCache(userId);
        if (cached) {
          set({
            listId: cached.listId,
            ownerId: cached.ownerId,
            groups: cached.groups,
            items: cached.items,
            loading: true,
          });
        } else {
          set({ loading: true });
        }
      } else {
        set({ loading: true });
      }

      // Bail out cleanly when offline OR signed out. We deliberately
      // do NOT clear state here — the cache hydrate above is the
      // source of truth until network returns. The explicit signOut
      // path calls reset() separately to truly clear.
      if (!isOnline() || !userId) {
        set({ loading: false });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('active_grocery_list_id')
        .eq('id', userId)
        .maybeSingle();

      // Fall back to the cached listId on a null profile fetch — a
      // transient network hiccup shouldn't trash state. We only enter
      // the ensurePersonalList path when we genuinely have no listId
      // anywhere.
      let listId =
        (profile?.active_grocery_list_id as string | null) ??
        get().listId ??
        null;
      if (!listId) {
        listId = await ensurePersonalList(userId);
        if (listId) {
          await supabase
            .from('profiles')
            .update({ active_grocery_list_id: listId })
            .eq('id', userId);
        }
      }
      if (!listId) {
        // Genuine "no list anywhere" state — only clear when the
        // current state has nothing populated either. Preserves data
        // when the network is flaky and a transient profile fetch
        // miss would otherwise wipe groups + items.
        const currentState = get();
        const hasPopulatedState =
          currentState.listId !== null ||
          currentState.groups.length > 0 ||
          currentState.items.length > 0;
        if (!hasPopulatedState) {
          set({ listId: null, ownerId: null, groups: [], items: [], members: [], invites: [] });
        }
        return;
      }

      const [{ data: list }, { data: groups }, { data: items }, { data: members }, { data: invites }] =
        await Promise.all([
          supabase.from('grocery_lists').select('owner_id').eq('id', listId).maybeSingle(),
          supabase.from('grocery_groups').select('*').eq('list_id', listId).order('sort_order'),
          supabase.from('grocery_items').select('*').eq('list_id', listId).order('sort_order'),
          supabase.from('grocery_list_members').select('*').eq('list_id', listId),
          supabase
            .from('grocery_list_invites')
            .select('*')
            .eq('list_id', listId)
            .is('revoked_at', null)
            .order('created_at', { ascending: false }),
        ]);

      const freshGroups = (groups as GroceryGroup[]) ?? [];
      const freshItems = (items as GroceryItem[]) ?? [];

      // Don't clobber a populated cache with an empty success
      // response. If the network returned no rows but we know the
      // cache had data, prefer the cache — this protects against
      // RLS/auth glitches that would otherwise wipe local state.
      const currentState = get();
      const wouldClobberWithEmpty =
        freshGroups.length === 0 &&
        freshItems.length === 0 &&
        (currentState.groups.length > 0 || currentState.items.length > 0);
      if (wouldClobberWithEmpty) {
        // Update only the metadata (listId, ownerId, members, invites),
        // keep the populated groups + items as the source of truth.
        set({
          listId,
          ownerId: (list?.owner_id as string) ?? null,
          members: (members as GroceryListMember[]) ?? [],
          invites: (invites as GroceryInvite[]) ?? [],
        });
      } else {
        set({
          listId,
          ownerId: (list?.owner_id as string) ?? null,
          groups: freshGroups,
          items: freshItems,
          members: (members as GroceryListMember[]) ?? [],
          invites: (invites as GroceryInvite[]) ?? [],
        });
      }

      // Refresh the cache with the live snapshot (now that we know
      // listId is current — covers the post-share-accept switch).
      persistCurrent(get());

      // Mirror to Dexie so cross-store offline hydration works even
      // when this page is the cold-start entry point.
      const db = getDB();
      if (db) {
        try {
          await db.transaction('rw', [db.grocery_groups, db.grocery_items], async () => {
            await db.grocery_groups.clear();
            await db.grocery_items.clear();
            if (freshGroups.length > 0) await db.grocery_groups.bulkPut(freshGroups);
            if (freshItems.length > 0) await db.grocery_items.bulkPut(freshItems);
          });
        } catch {}
      }

      // Pending invites + recent contacts in parallel — both are
      // independent of the list-data fetches above.
      void get().fetchPendingInvitesForMe();
      void get().fetchRecentContacts();

      // Restart the realtime subscription against the (possibly new) list id.
      if (subscribedListId && subscribedListId !== listId) {
        get().unsubscribe();
      }
      if (!channel) get().subscribe();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load grocery list' });
    } finally {
      set({ loading: false });
    }
  },

  reconcile: async () => {
    // CRITICAL OFFLINE GUARD. reconcile is wired to a
    // visibilitychange listener inside subscribe() so iOS PWAs
    // re-converge after the websocket suspends. But offline, the
    // supabase calls below return { data: null }, and the previous
    // version's `(groups as ...) ?? []` would set groups + items to
    // empty arrays — explicitly wiping the cached state every time
    // the user touched the screen / switched walls / changed tabs.
    // Bail out cleanly when offline.
    if (!isOnline()) return;

    const { listId } = get();
    if (!listId) return;
    const [{ data: groups }, { data: items }, { data: members }] = await Promise.all([
      supabase.from('grocery_groups').select('*').eq('list_id', listId).order('sort_order'),
      supabase.from('grocery_items').select('*').eq('list_id', listId).order('sort_order'),
      supabase.from('grocery_list_members').select('*').eq('list_id', listId),
    ]);

    const freshGroups = (groups as GroceryGroup[]) ?? [];
    const freshItems = (items as GroceryItem[]) ?? [];

    // Belt-and-braces: if the network responded with empty arrays
    // but the cache is populated, treat it as a transient miss and
    // skip the overwrite. This protects against a stale-token / RLS
    // glitch silently wiping the user's data.
    const currentState = get();
    const wouldClobberWithEmpty =
      freshGroups.length === 0 &&
      freshItems.length === 0 &&
      (currentState.groups.length > 0 || currentState.items.length > 0);
    if (wouldClobberWithEmpty) {
      // Still update members (lower-stakes) and pending invites.
      set({ members: (members as GroceryListMember[]) ?? [] });
    } else {
      set({
        groups: freshGroups,
        items: freshItems,
        members: (members as GroceryListMember[]) ?? [],
      });
    }
    // Pending invites are independent of the active list — refetch
    // them too so banners stay in sync after reconciliation.
    void get().fetchPendingInvitesForMe();
  },

  // ── Pending invites + recent contacts ──────────────────────

  fetchPendingInvitesForMe: async () => {
    const userId = await getUserId();
    if (!userId) {
      set({ pendingInvitesForMe: [] });
      return;
    }
    const { data, error } = await supabase
      .from('grocery_list_pending_invites')
      .select('*')
      .eq('recipient_user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) return;
    set({ pendingInvitesForMe: (data as PendingInvite[]) ?? [] });
  },

  fetchRecentContacts: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      set({ recentContacts: [] });
      return;
    }
    try {
      const res = await fetch('/api/grocery/recent-contacts', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { contacts?: RecentContact[] };
      set({ recentContacts: json.contacts ?? [] });
    } catch {
      // Network failure — silent. Recent contacts is an optimization.
    }
  },

  acceptPendingInvite: async (id) => {
    // Optimistically drop the banner. If RPC fails we re-fetch.
    set({ pendingInvitesForMe: get().pendingInvitesForMe.filter((p) => p.id !== id) });
    const { error } = await supabase.rpc('accept_pending_invite', { p_id: id });
    if (error) {
      void get().fetchPendingInvitesForMe();
      return;
    }
    // Switch active list — purge cache so we don't briefly show old data.
    if (cachedUserId) purgeCacheFor(cachedUserId);
    get().unsubscribe();
    await get().loadActive();
  },

  declinePendingInvite: async (id) => {
    set({ pendingInvitesForMe: get().pendingInvitesForMe.filter((p) => p.id !== id) });
    const { error } = await supabase.from('grocery_list_pending_invites').delete().eq('id', id);
    if (error) {
      void get().fetchPendingInvitesForMe();
    }
  },

  inviteByEmail: async (email) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: 'invalid-email' };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) return { ok: false, error: 'unauthorized' };
    try {
      const res = await fetch('/api/grocery/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        mode?: 'in_app' | 'email' | 'already_member';
        display_name?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.mode) {
        return { ok: false, error: json.error ?? 'send-failed' };
      }
      // Refresh recent contacts after a successful in-app invite — the
      // recipient now belongs in the quick-pick row.
      if (json.mode === 'in_app') void get().fetchRecentContacts();
      return { ok: true, mode: json.mode, display_name: json.display_name ?? null };
    } catch {
      return { ok: false, error: 'network' };
    }
  },

  inviteRecentContact: async (userId, displayName) => {
    // We don't have the email here — call a thin server path that
    // looks up the email from auth.users (admin) and routes to the
    // same invite path. Cheaper: skip the email round-trip entirely
    // since we already know the user_id. Just upsert the pending
    // invite directly via the user-scoped client (RLS gates it).
    const { listId } = get();
    if (!listId) return { ok: false, error: 'no-list' };

    // Already a member?
    if (get().members.some((m) => m.user_id === userId)) {
      return { ok: true, mode: 'already_member', display_name: displayName };
    }

    const callerId = await getUserId();
    if (!callerId) return { ok: false, error: 'unauthorized' };

    // Get caller's display_name + list name for the snapshot.
    const [{ data: profile }, { data: list }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', callerId).maybeSingle(),
      supabase.from('grocery_lists').select('name').eq('id', listId).maybeSingle(),
    ]);

    const { error } = await supabase
      .from('grocery_list_pending_invites')
      .upsert(
        {
          list_id: listId,
          recipient_user_id: userId,
          inviter_user_id: callerId,
          inviter_name_snapshot: (profile?.display_name as string) ?? null,
          list_name_snapshot: (list?.name as string) ?? 'Groceries',
        },
        { onConflict: 'list_id,recipient_user_id' },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, mode: 'in_app', display_name: displayName };
  },

  // ── Group CRUD ─────────────────────────────────────────────

  addGroup: async (store) => {
    const { listId, groups } = get();
    if (!listId) return null;
    const trimmed = store.trim() || 'General';
    const id = uuid();
    const sort = groups.length;
    const optimistic: GroceryGroup = { id, list_id: listId, store: trimmed, sort_order: sort };
    set({ groups: [...groups, optimistic] });
    await enqueue({
      op: 'insert',
      table: 'grocery_groups',
      row_id: id,
      payload: { id, list_id: listId, store: trimmed, sort_order: sort },
    });
    return optimistic;
  },

  removeGroup: async (groupId) => {
    // Filter both in-memory (the DB will cascade-delete items via the
    // grocery_items.group_id FK; Phase 1 doesn't enqueue per-item
    // deletes — orphan rows in the local Dexie cache are cleaned up
    // on the next fetchAll).
    set({
      groups: get().groups.filter((g) => g.id !== groupId),
      items: get().items.filter((i) => i.group_id !== groupId),
    });
    await enqueue({ op: 'delete', table: 'grocery_groups', row_id: groupId, payload: null });
  },

  // ── Item CRUD ──────────────────────────────────────────────

  addItem: async (groupId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { listId, items } = get();
    if (!listId) return;
    // Skip if an active item with this name already exists in the group.
    if (items.some(
      (i) => i.group_id === groupId && !i.completed && i.name.toLowerCase() === trimmed.toLowerCase(),
    )) return;

    const userId = await getUserId();
    const id = uuid();
    const optimistic: GroceryItem = {
      id,
      list_id: listId,
      group_id: groupId,
      name: trimmed,
      completed: false,
      completed_at: null,
      completed_by: null,
      added_by: userId,
      sort_order: items.filter((i) => i.group_id === groupId).length,
    };
    set({ items: [...items, optimistic] });
    await enqueue({
      op: 'insert',
      table: 'grocery_items',
      row_id: id,
      payload: {
        id,
        list_id: listId,
        group_id: groupId,
        name: trimmed,
        added_by: userId,
        sort_order: optimistic.sort_order,
      },
    });
  },

  addGroupsFromCapture: async (newGroups) => {
    if (newGroups.length === 0) return;
    const { listId } = get();
    if (!listId) return;
    for (const g of newGroups) {
      // Capture without a store name lands in Uncategorized so the
      // user can drag it into a real store later. Existing literal
      // 'General' captures (legacy data) keep working alongside.
      const trimmedStore = g.store.trim() || UNCATEGORIZED_STORE;
      // Find or create the store group (case-insensitive match on store name).
      let group = get().groups.find((existing) => existing.store.toLowerCase() === trimmedStore.toLowerCase());
      if (!group) {
        group = (await get().addGroup(trimmedStore)) ?? undefined;
        if (!group) continue;
      }
      for (const itemName of g.items) {
        // Sentence-case AI-captured items (Gemini is also instructed
        // to do this in the prompt; this is a safety net for misses
        // like transcription artifacts returning "BEETROOT" verbatim).
        // Manual entry / inline rename intentionally bypass this so
        // the user's typed casing is preserved.
        await get().addItem(group.id, toSentenceCase(itemName));
      }
    }
  },

  toggleItem: async (itemId) => {
    const { items } = get();
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const next = !target.completed;
    const userId = await getUserId();
    const completed_at = next ? new Date().toISOString() : null;
    const completed_by = next ? userId : null;
    set({
      items: items.map((i) =>
        i.id === itemId
          ? { ...i, completed: next, completed_at, completed_by }
          : i,
      ),
    });
    await enqueue({
      op: 'update',
      table: 'grocery_items',
      row_id: itemId,
      payload: { completed: next, completed_at, completed_by },
    });
  },

  renameItem: async (itemId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = get().items.find((i) => i.id === itemId);
    if (!target || target.name === trimmed) return;
    set({ items: get().items.map((i) => (i.id === itemId ? { ...i, name: trimmed } : i)) });
    await enqueue({
      op: 'update',
      table: 'grocery_items',
      row_id: itemId,
      payload: { name: trimmed },
    });
  },

  removeItem: async (itemId) => {
    set({ items: get().items.filter((i) => i.id !== itemId) });
    await enqueue({ op: 'delete', table: 'grocery_items', row_id: itemId, payload: null });
  },

  markItemDone: async (itemId) => {
    const { items } = get();
    const target = items.find((i) => i.id === itemId);
    if (!target || target.completed) return;
    await get().toggleItem(itemId);
  },

  markItemUndone: async (itemId) => {
    const { items } = get();
    const target = items.find((i) => i.id === itemId);
    if (!target || !target.completed) return;
    await get().toggleItem(itemId);
  },

  moveItemToGroup: async (itemId, targetGroupId) => {
    const { items, groups } = get();
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    if (target.group_id === targetGroupId) return;
    if (!groups.find((g) => g.id === targetGroupId)) return;
    // Append to the end of the target group so the moved item is
    // visible without scroll. Find max sort_order within the target
    // group and add 1.
    const targetMax = items
      .filter((i) => i.group_id === targetGroupId)
      .reduce((m, i) => Math.max(m, i.sort_order), -1);
    const nextOrder = targetMax + 1;
    set({
      items: items.map((i) =>
        i.id === itemId
          ? { ...i, group_id: targetGroupId, sort_order: nextOrder }
          : i,
      ),
    });
    await enqueue({
      op: 'update',
      table: 'grocery_items',
      row_id: itemId,
      payload: { group_id: targetGroupId, sort_order: nextOrder },
    });
  },

  ensureUncategorizedGroup: async () => {
    const existing = get().groups.find((g) => g.store === UNCATEGORIZED_STORE);
    if (existing) return existing.id;
    const created = await get().addGroup(UNCATEGORIZED_STORE);
    return created?.id ?? null;
  },

  addCompletedItems: async (store, names) => {
    if (names.length === 0) return;
    const { listId } = get();
    if (!listId) return;
    const trimmedStore = store.trim() || 'General';
    let group = get().groups.find((g) => g.store.toLowerCase() === trimmedStore.toLowerCase());
    if (!group) {
      group = (await get().addGroup(trimmedStore)) ?? undefined;
      if (!group) return;
    }
    const userId = await getUserId();
    const nowIso = new Date().toISOString();
    const rows = names.map((name) => ({
      id: uuid(),
      list_id: listId,
      group_id: group!.id,
      name: name.trim(),
      completed: true,
      completed_at: nowIso,
      completed_by: userId,
      added_by: userId,
      sort_order: 0,
    }));
    set({ items: [...get().items, ...rows as GroceryItem[]] });
    // One outbox row per item so partial failures stop at the first
    // bad row instead of dropping the whole batch silently.
    for (const row of rows) {
      await enqueue({ op: 'insert', table: 'grocery_items', row_id: row.id, payload: row });
    }
  },

  // ── Sharing ────────────────────────────────────────────────

  createInvite: async () => {
    const { listId } = get();
    if (!listId) return null;
    const userId = await getUserId();
    if (!userId) return null;
    const { data, error } = await supabase
      .from('grocery_list_invites')
      .insert({ list_id: listId, created_by: userId })
      .select('*')
      .single();
    if (error || !data) return null;
    const invite = data as GroceryInvite;
    set({ invites: [invite, ...get().invites] });
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return { token: invite.token, url: `${origin}/share/grocery/${invite.token}` };
  },

  revokeInvite: async (token) => {
    const { invites } = get();
    set({ invites: invites.filter((i) => i.token !== token) });
    const { error } = await supabase
      .from('grocery_list_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token);
    if (error) set({ invites });
  },

  leaveList: async () => {
    const { listId } = get();
    if (!listId) return;
    const userId = await getUserId();
    if (!userId) return;
    // Delete own membership. Trigger handles owner-promotion / cascade.
    await supabase
      .from('grocery_list_members')
      .delete()
      .eq('list_id', listId)
      .eq('user_id', userId);
    // Clear the active pointer so loadActive() routes us back to (or
    // creates) a personal list.
    await supabase.from('profiles').update({ active_grocery_list_id: null }).eq('id', userId);
    get().unsubscribe();
    await get().loadActive();
  },

  // ── Realtime ───────────────────────────────────────────────

  subscribe: () => {
    const { listId } = get();
    if (!listId || channel) return;
    subscribedListId = listId;

    // Pending-invites listener filters by recipient_user_id (NOT
    // list_id) so the banner appears even when someone invites us
    // to a *different* list while we're viewing this one. cachedUserId
    // is already populated by loadActive() before subscribe() runs.
    const myUserId = cachedUserId;

    let builder = supabase
      .channel(`grocery-data:${listId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_items', filter: `list_id=eq.${listId}` },
        (payload: RealtimePostgresChangesPayload<GroceryItem>) => {
          const state = get();
          // Phase 2: mirror realtime events into Dexie so a partner's
          // edits propagate to the offline cache. Without this mirror,
          // in-memory state updates but Dexie stays stale; next
          // cold-open offline shows pre-event data until next refresh.
          const db = getDB();
          if (payload.eventType === 'INSERT') {
            const row = payload.new;
            if (state.items.some((i) => i.id === row.id)) return; // self-echo
            set({ items: [...state.items, row] });
            if (db) void db.grocery_items.put(row).catch(() => {});
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new;
            set({ items: state.items.map((i) => (i.id === row.id ? row : i)) });
            if (db) void db.grocery_items.put(row).catch(() => {});
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string })?.id;
            if (!id) return;
            set({ items: state.items.filter((i) => i.id !== id) });
            if (db) void db.grocery_items.delete(id).catch(() => {});
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_groups', filter: `list_id=eq.${listId}` },
        (payload: RealtimePostgresChangesPayload<GroceryGroup>) => {
          const state = get();
          const db = getDB();
          if (payload.eventType === 'INSERT') {
            const row = payload.new;
            if (state.groups.some((g) => g.id === row.id)) return;
            set({ groups: [...state.groups, row] });
            if (db) void db.grocery_groups.put(row).catch(() => {});
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new;
            set({ groups: state.groups.map((g) => (g.id === row.id ? row : g)) });
            if (db) void db.grocery_groups.put(row).catch(() => {});
          } else if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string })?.id;
            if (!id) return;
            set({
              groups: state.groups.filter((g) => g.id !== id),
              items: state.items.filter((i) => i.group_id !== id),
            });
            if (db) {
              void db.grocery_groups.delete(id).catch(() => {});
              // Cascade: items inherit group_id, so drop any cached
              // items whose parent group just disappeared.
              void db.grocery_items.where('group_id').equals(id).delete().catch(() => {});
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_list_members', filter: `list_id=eq.${listId}` },
        () => {
          // Membership changes (someone joined / left / got kicked). Just
          // re-fetch the member list.
          void (async () => {
            const { data } = await supabase
              .from('grocery_list_members')
              .select('*')
              .eq('list_id', listId);
            set({ members: (data as GroceryListMember[]) ?? [] });
          })();
        },
      );

    if (myUserId) {
      builder = builder.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'grocery_list_pending_invites',
          filter: `recipient_user_id=eq.${myUserId}`,
        },
        () => {
          // Any change → re-fetch (cheaper than tracking each event
          // shape, and this fires rarely).
          void get().fetchPendingInvitesForMe();
        },
      );
    }

    channel = builder.subscribe();

    if (typeof document !== 'undefined' && !visibilityHandler) {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          // iOS Safari suspends the websocket; missed events aren't
          // replayed on reconnect. Refetch to converge.
          void get().reconcile();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  },

  unsubscribe: () => {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
    subscribedListId = null;
    if (typeof document !== 'undefined' && visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  },

  purgeCache: () => {
    if (cachedUserId) purgeCacheFor(cachedUserId);
  },

  reset: () => {
    get().unsubscribe();
    if (cachedUserId) purgeCacheFor(cachedUserId);
    cachedUserId = null;
    set({
      listId: null,
      ownerId: null,
      groups: [],
      items: [],
      members: [],
      invites: [],
      pendingInvitesForMe: [],
      recentContacts: [],
      error: null,
    });
  },
}));

// Persist cache on every mutation that affects the visible-tab data.
// Subscribing once at module load is cheaper and less error-prone than
// sprinkling persistCurrent() at the end of each action.
useGroceryStore.subscribe((state, prev) => {
  if (!cachedUserId) return;
  if (
    state.listId === prev.listId &&
    state.ownerId === prev.ownerId &&
    state.groups === prev.groups &&
    state.items === prev.items
  ) {
    return;
  }
  persistCurrent(state);
});
