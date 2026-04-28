'use client';

// Two-wall navigation state. Persists across reloads so the user lands
// on the same wall+tab they left. Hydration: read localStorage on first
// access (client-side only). The shell uses this to decide whether to
// render the tasks side or the journal side, and where the active tab
// indicator sits within each wall's nav.

import { create } from 'zustand';

export type WallId = 'tasks' | 'journal';

// Tab keys are also the URL slugs (so /today, /lists, /groceries, etc.).
// Keeping URL = state of truth means deep links and the back button work
// without extra plumbing.
export type TasksTab = 'today' | 'lists' | 'upcoming' | 'groceries';
// 5-slot journal wall: pulse / notebooks / [journal center] /
// guided / patterns. Keeping 5 keeps the center pill actually
// centered. 'history' + 'habits' stay as paths but not as nav tabs.
//
// 'intentions' and 'presence' were previous slot-3 occupants — both
// DISABLED in nav now (routes still resolve: /intentions to its old
// page, /presence redirects to /home). Both kept off the union so a
// stale persisted value can't slip through.
export type JournalTab = 'pulse' | 'notebooks' | 'journal' | 'guided' | 'patterns';

const LS_KEY = 'wallState.v1';

interface Persisted {
  activeWall: WallId;
  lastTabPerWall: { tasks: TasksTab; journal: JournalTab };
}

const DEFAULT: Persisted = {
  activeWall: 'tasks',
  lastTabPerWall: { tasks: 'today', journal: 'pulse' },
};

// Page-turn animation phase. The flip is split into two halves so we
// can navigate between routes mid-animation:
//   - 'exiting'  : current page rotates 0 → -90 on its right hinge
//   - (then router.push happens — children prop becomes the new page)
//   - 'entering' : new page rotates 90 → 0 on its left hinge
//   - 'idle'     : steady state
// WallShell reads this and applies the correct transform; WallNav's
// flip tab kicks off the sequence via the `flipTo` action below.
export type FlipPhase = 'idle' | 'exiting' | 'entering';

export const FLIP_HALF_MS = 300;

// Coerce persisted tab values that were valid in earlier builds (e.g.
// 'plans') to the current set so a returning user doesn't land on a
// dead route after an upgrade.
const VALID_TASKS_TABS: TasksTab[] = ['today', 'lists', 'upcoming', 'groceries'];
const VALID_JOURNAL_TABS: JournalTab[] = ['pulse', 'notebooks', 'journal', 'guided', 'patterns'];

function readPersisted(): Persisted {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    const rawTasks = parsed.lastTabPerWall?.tasks;
    let rawJournal = parsed.lastTabPerWall?.journal;
    // Hydration migrations for past slot-3 occupants. Both intentions
    // (replaced by Presence) and Presence (folded into Pulse + slot 3
    // now Guided) are no longer valid tab values. Rewrite both to
    // 'pulse' so users who last left the app on those tabs land
    // somewhere coherent rather than a nav-less destination.
    if ((rawJournal as string) === 'intentions' || (rawJournal as string) === 'presence') {
      rawJournal = 'pulse';
    }
    return {
      activeWall: parsed.activeWall === 'journal' ? 'journal' : 'tasks',
      lastTabPerWall: {
        tasks: VALID_TASKS_TABS.includes(rawTasks as TasksTab)
          ? (rawTasks as TasksTab)
          : DEFAULT.lastTabPerWall.tasks,
        journal: VALID_JOURNAL_TABS.includes(rawJournal as JournalTab)
          ? (rawJournal as JournalTab)
          : DEFAULT.lastTabPerWall.journal,
      },
    };
  } catch {
    return DEFAULT;
  }
}

function writePersisted(p: Persisted) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

interface WallState extends Persisted {
  flipPhase: FlipPhase;
  setWall: (w: WallId) => void;
  setTab: (wall: 'tasks', tab: TasksTab) => void;
  setJournalTab: (tab: JournalTab) => void;
  setFlipPhase: (p: FlipPhase) => void;
  // Imperative flip orchestrator. Caller passes the destination path
  // and which wall it belongs to, plus the route navigator (we avoid
  // importing next/navigation in this file because zustand stores
  // shouldn't depend on React-only modules).
  flipTo: (
    targetPath: string,
    targetWall: WallId,
    push: (href: string) => void,
    opts?: { reducedMotion?: boolean },
  ) => Promise<void>;
  hydrate: () => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const useWallState = create<WallState>((set, get) => ({
  ...DEFAULT,
  flipPhase: 'idle',

  setFlipPhase: (p) => set({ flipPhase: p }),

  flipTo: async (targetPath, targetWall, push, opts) => {
    // Reduced-motion / instant path: no rotation, just navigate.
    if (opts?.reducedMotion) {
      set({ activeWall: targetWall });
      writePersisted({
        activeWall: targetWall,
        lastTabPerWall: get().lastTabPerWall,
      });
      push(targetPath);
      return;
    }
    // Half 1 — current page rotates away on right hinge.
    set({ flipPhase: 'exiting' });
    await sleep(FLIP_HALF_MS);
    // Mid-flip: navigate. The new page renders inside the wrapper
    // (which is invisible at this point because rotateY = -90).
    push(targetPath);
    // Persist the wall change so it survives a refresh.
    set({ activeWall: targetWall, flipPhase: 'entering' });
    writePersisted({
      activeWall: targetWall,
      lastTabPerWall: get().lastTabPerWall,
    });
    // Half 2 — wrapper springs back from rotateY 90 → 0 (handled by
    // WallShell's `entering` keyed branch).
    await sleep(FLIP_HALF_MS);
    set({ flipPhase: 'idle' });
  },

  hydrate: () => {
    const p = readPersisted();
    set({ activeWall: p.activeWall, lastTabPerWall: p.lastTabPerWall });
  },

  setWall: (w) => {
    const next = { ...get(), activeWall: w };
    set({ activeWall: w });
    writePersisted({ activeWall: next.activeWall, lastTabPerWall: next.lastTabPerWall });
  },

  setTab: (wall, tab) => {
    const next = {
      ...get(),
      lastTabPerWall: { ...get().lastTabPerWall, [wall]: tab },
    };
    set({ lastTabPerWall: next.lastTabPerWall });
    writePersisted({ activeWall: next.activeWall, lastTabPerWall: next.lastTabPerWall });
  },

  setJournalTab: (tab) => {
    const next = {
      ...get(),
      lastTabPerWall: { ...get().lastTabPerWall, journal: tab },
    };
    set({ lastTabPerWall: next.lastTabPerWall });
    writePersisted({ activeWall: next.activeWall, lastTabPerWall: next.lastTabPerWall });
  },
}));

// The exact pathnames that show the WallEdgeTab "JOURNAL"/"TASKS"
// switcher pill at the top. Sub-routes (/notebooks/[slug], /lists/[id],
// /intentions/[id], /entry/[id], etc.) intentionally hide the pill so
// the user isn't pulled out of a focused context. Keep this in sync
// with WallNav's slot definitions.
export const WALL_ROOT_PATHS: ReadonlySet<string> = new Set([
  // Tasks wall — 4 root tabs (matches WallNav slots 0,1,3,4 — slot 2 is /voice center action)
  '/today',
  '/lists',
  '/upcoming',
  '/groceries',
  // Journal wall — 5 root tabs (matches WallNav slots 0,1,3,4 — slot 2 is /journal center action)
  '/home',
  '/pulse',
  '/notebooks',
  '/patterns',
  '/guided',
  '/presence', // DISABLED in nav, redirects to /home; kept to satisfy wall guard for any in-flight notification taps.
  '/intentions', // DISABLED in nav but route still resolves; kept for revert.
]);

/** True only on the exact root tabs of either wall. */
export function isWallRootPath(pathname: string): boolean {
  return WALL_ROOT_PATHS.has(pathname);
}

// Map a pathname to the wall it belongs to. Returns null if the route
// is full-screen (guided, voice, etc.) and shouldn't show the wall nav
// at all — caller decides what to do.
export function wallForPath(pathname: string): WallId | null {
  // Tasks side
  if (
    pathname === '/today' ||
    pathname === '/lists' ||
    pathname.startsWith('/lists/') ||
    pathname === '/upcoming' ||
    pathname === '/groceries' ||
    pathname === '/priorities' || // legacy
    pathname === '/plans' || // legacy (deprecated tab; route may still exist)
    pathname === '/habits'
  ) {
    return 'tasks';
  }
  // Journal side
  if (
    pathname === '/pulse' ||
    pathname === '/history' || // legacy: redirects via nav-less route
    pathname === '/journal' ||
    pathname === '/notebooks' ||
    pathname.startsWith('/notebooks/') ||
    pathname === '/patterns' ||
    pathname === '/presence' ||
    pathname === '/intentions' || // DISABLED in nav; route still resolves
    pathname.startsWith('/intentions/') ||
    pathname === '/templates' ||
    pathname === '/home' || // legacy: home page redirects to pulse
    pathname === '/write'
  ) {
    return 'journal';
  }
  // Full-screen / settings — no wall
  return null;
}

// Current tab key derived from pathname. Used to highlight the right
// nav pill. Returns null if the path doesn't map to one of the wall's
// tabs (e.g. /habits is on the tasks wall but isn't a top-level tab).
export function tabForPath(pathname: string): TasksTab | JournalTab | null {
  // Sub-routes like /lists/[id] still highlight the parent tab.
  if (pathname.startsWith('/lists/')) return 'lists';
  // /intentions/<sub> previously highlighted the intentions tab —
  // since the tab is DISABLED in nav now, return null so no slot
  // lights up. The page still renders.
  if (pathname.startsWith('/intentions/')) return null;
  // /notebooks/[slug] keeps the Notebooks tab highlighted.
  if (pathname.startsWith('/notebooks/')) return 'notebooks';
  const map: Record<string, TasksTab | JournalTab> = {
    '/today': 'today',
    '/priorities': 'today', // legacy
    '/plans': 'today', // legacy: Plans is gone; map to Today
    '/lists': 'lists',
    '/upcoming': 'upcoming',
    '/groceries': 'groceries',
    '/pulse': 'pulse',
    '/home': 'pulse', // legacy
    '/notebooks': 'notebooks',
    '/history': 'notebooks', // legacy — history fell into notebooks
    '/journal': 'journal',
    '/guided': 'guided',
    // '/presence' intentionally NOT mapped — route redirects to /home
    // (which maps to 'pulse'). No tab highlight needed in transit.
    // '/intentions' intentionally NOT mapped — DISABLED tab. Direct
    // visitors see the page render but no tab gets highlighted.
    '/patterns': 'patterns',
  };
  return map[pathname] ?? null;
}
