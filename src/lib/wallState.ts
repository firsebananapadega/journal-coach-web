'use client';

// Single-wall navigation state. PR 2 retired the journal wall; the
// app now has one tasks-wall nav (Notebooks / Lists / Today / Upcoming
// / Groceries) plus the notebooks shelf for everything that used to
// be a journal-wall tab.
//
// The remaining responsibilities of this module:
//   • track the user's last-visited tasks-wall tab so cold-starts
//     land back where they left off
//   • map pathnames to nav-tab keys for the active-pill highlight
//
// All wall-flip mechanics (FlipPhase, flipTo, WallId, JournalTab,
// wallForPath, lastTabPerWall.journal) were deleted in PR 2. The
// module path / store name is preserved so callers don't have to
// update simultaneously.

import { create } from 'zustand';

// Tab keys are also the URL slugs (so /today, /lists, /groceries,
// etc.). Keeping URL = state of truth means deep links and the back
// button work without extra plumbing.
export type TasksTab = 'today' | 'lists' | 'notebooks' | 'upcoming' | 'groceries';

const LS_KEY = 'wallState.v1';

interface Persisted {
  lastTab: TasksTab;
}

const DEFAULT: Persisted = { lastTab: 'today' };

const VALID_TASKS_TABS: TasksTab[] = ['today', 'lists', 'notebooks', 'upcoming', 'groceries'];

// Hydration is forgiving — if a stale field shape from a previous
// build is still in localStorage (e.g. { activeWall, lastTabPerWall }
// from before PR 2), pull `lastTabPerWall.tasks` if present and
// otherwise fall back to the default. Never throw.
function readPersisted(): Persisted {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as {
      lastTab?: TasksTab;
      lastTabPerWall?: { tasks?: TasksTab };
    };
    const candidate = parsed.lastTab ?? parsed.lastTabPerWall?.tasks;
    return {
      lastTab: VALID_TASKS_TABS.includes(candidate as TasksTab)
        ? (candidate as TasksTab)
        : DEFAULT.lastTab,
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
  setTab: (tab: TasksTab) => void;
  hydrate: () => void;
}

export const useWallState = create<WallState>((set, get) => ({
  ...DEFAULT,

  hydrate: () => {
    const p = readPersisted();
    set({ lastTab: p.lastTab });
  },

  setTab: (tab) => {
    set({ lastTab: tab });
    writePersisted({ lastTab: get().lastTab });
  },
}));

// Root pathnames for the (now single) wall nav. Sub-routes
// (/notebooks/[slug], /lists/[id], /entry/[id], etc.) intentionally
// hide nothing extra — kept here for any caller that wants to know
// "is this a top-level tab destination?" The set is only the tasks
// wall after PR 2.
export const WALL_ROOT_PATHS: ReadonlySet<string> = new Set([
  '/today',
  '/lists',
  '/notebooks',
  '/upcoming',
  '/groceries',
]);

/** True only on the exact root tabs of the wall. */
export function isWallRootPath(pathname: string): boolean {
  return WALL_ROOT_PATHS.has(pathname);
}

// Current tab key derived from pathname. Used to highlight the right
// nav pill. Returns null if the path doesn't map to one of the
// tabs (e.g. /settings, /entry/[id], /voice).
export function tabForPath(pathname: string): TasksTab | null {
  // Sub-routes still highlight the parent tab.
  if (pathname.startsWith('/lists/')) return 'lists';
  // /notebooks/[slug] keeps the Notebooks tab highlighted.
  if (pathname.startsWith('/notebooks/')) return 'notebooks';
  const map: Record<string, TasksTab> = {
    '/today': 'today',
    '/priorities': 'today', // legacy
    '/plans': 'today', // legacy
    '/home': 'today', // legacy (PR 2 — /home redirects to /today)
    '/lists': 'lists',
    '/notebooks': 'notebooks',
    '/upcoming': 'upcoming',
    '/groceries': 'groceries',
  };
  return map[pathname] ?? null;
}
