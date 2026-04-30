import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';
import { useGroceryStore } from './groceryStore';

// Every Supabase round-trip is capped so a stalled request can't pin
// a "Saving…" spinner forever. The onboarding flow and the daily-pulse
// save both hit updateProfile/fetchProfile via zustand, and a hung
// auth round-trip there was stranding the whole UI.
const AUTH_MS = 8000;
const READ_MS = 10000;
const WRITE_MS = 15000;

export type LetterCadence = 'weekly' | 'biweekly' | 'monthly' | 'off';

export type PrimaryUse = 'journal' | 'tasks' | 'both';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  timezone: string;
  onboarding_completed: boolean;
  anchor_moment: string | null;
  intentions: string[];
  preferred_guide: string;
  notification_preferences: {
    morning_reminder: boolean;
    evening_reminder: boolean;
    /** Mid-day Presence pause reminder. Default ON for users who
     *  haven't explicitly toggled — surfaces the new tab the way
     *  morning/evening surface the pulse. */
    presence_reminder?: boolean;
    reminder_times: {
      morning: string;
      evening: string;
      /** HH:MM 24-hour, user-local. Defaults to 13:00 if missing. */
      presence?: string;
    };
  };
  /** How often the weekly guide letter should fire. Default 'weekly'. */
  letter_cadence: LetterCadence;
  tour_completed: boolean;
  /** Post-onboarding "daily ritual" demo (3-card walkthrough showing
   *  morning Pulse → tasks → evening Pulse). Mirrors tour_completed
   *  in shape — flips to true on demo skip or completion so reinstalls
   *  don't re-fire it. See src/components/onboarding/RitualDemo.tsx. */
  ritual_demo_completed: boolean;
  /** First-visit-popup tracking: each path in this array has had its
   *  one-line tab popup dismissed. Resetting this (via the Settings
   *  "Show onboarding guide" toggle) re-enables the popups along with
   *  the linear tour. Populated by TabFirstVisitPopup. */
  tour_seen_tabs: string[];
  /** When true, the structureEntry pass also returns gratitude
   *  excerpts and the journal pages show a suggestion sheet. Default
   *  true; user can disable in Settings. */
  gratitude_auto_detect_enabled: boolean;
  /** Flips true the first time the user sees the gratitude
   *  suggestion sheet so the one-time explainer card only shows
   *  once. Survives the auto-detect toggle. */
  gratitude_intro_seen: boolean;
  install_prompt_dismissed_at: string | null;
  pwa_installed: boolean;
  /** Asked during onboarding — determines which wall (Journal / Tasks)
   *  loads on first app open. After that, wallState localStorage owns
   *  the default. */
  primary_use: PrimaryUse | null;
  /** UI + content language. Mirrors localStorage 'app_language' but
   *  is the source of truth for any server process (letter crons,
   *  reminder pushes) that needs to localize. Set during onboarding;
   *  changeable in Settings. */
  language: 'en-US' | 'es-MX';
  created_at: string;
  updated_at: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error?: string; hasSession?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  signInWithGoogle: (next?: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  completeOnboarding: (
    displayName: string,
    anchorMoment: string,
    intentions: string[],
    preferredGuide?: string,
    primaryUse?: PrimaryUse,
  ) => Promise<void>;
  setPreferredGuide: (guideId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: false,
  initialized: false,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });

      const {
        data: { session },
        error,
      } = await withTimeout(supabase.auth.getSession(), AUTH_MS, 'auth.getSession');

      if (error) throw error;

      set({
        session,
        user: session?.user ?? null,
      });

      // Offline-friendly profile hydration: read the cached profile
      // from localStorage immediately so the wall guard can resolve
      // and the loading screen disappears even when the device has no
      // network. fetchProfile() then runs in the background to
      // refresh from Supabase — when offline, it just fails silently
      // and the cache remains the source of truth until reconnect.
      if (session?.user && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('cached_profile');
          if (raw) {
            const cached = JSON.parse(raw) as Profile;
            if (cached?.id === session.user.id) {
              set({ profile: cached });
            }
          }
        } catch {}
      }
      if (session?.user) {
        // Don't await — let the loading screen resolve from the
        // cached profile (or a null profile). The fetch will set the
        // fresh profile when it returns; if it never returns (offline)
        // the cached one stays.
        void get().fetchProfile();
      }

      supabase.auth.onAuthStateChange(async (event, session) => {
        set({
          session,
          user: session?.user ?? null,
        });

        if (event === 'SIGNED_IN' && session?.user) {
          await get().fetchProfile();
        }

        if (event === 'SIGNED_OUT') {
          set({ profile: null });
          // Drop cached grocery state so a different account on the
          // same device starts from a clean slate. reset() also tears
          // down the realtime subscription and purges localStorage.
          useGroceryStore.getState().reset();
        }

        // Forward fresh JWT to the realtime socket — without this,
        // RLS-protected channels (e.g. shared grocery lists) silently
        // stop receiving events after the access token rotates.
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }
      });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  signUp: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null });
      // `emailRedirectTo` is the URL Supabase appends to the
      // confirmation-email link. Without it, the link falls back to
      // the project's dashboard-configured Site URL — which in a
      // freshly-initialized project is `http://localhost:3000`, so
      // users who clicked through on another device landed on a dead
      // localhost page. Setting it explicitly to the current origin
      // means prod emails go to prod and dev emails go to dev.
      //
      // NOTE: the target URL must also be on the project's "Redirect
      // URLs" allow-list in the Supabase dashboard. Otherwise Supabase
      // silently drops this value and falls back to Site URL anyway.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== 'undefined'
              ? `${window.location.origin}/auth/confirm`
              : undefined,
        },
      });
      if (error) throw error;
      set({ session: data.session, user: data.user });
      // With Supabase email-confirmation OFF (autoconfirm ON) the
      // signUp call returns a live session — caller can route
      // straight into the app. With confirmation ON, session is
      // null and the caller falls back to "check your email."
      return { hasSession: !!data.session };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Sign up failed';
      set({ error: msg });
      return { error: msg };
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null });
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      set({ session: data.session, user: data.user });
      return {};
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Sign in failed';
      set({ error: msg });
      return { error: msg };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      set({ loading: true, error: null });
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      set({ session: null, user: null, profile: null });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Sign out failed' });
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogle: async (next?: string) => {
    try {
      set({ loading: true, error: null });
      // When there's a `next` (share-link round-trip), route through
      // /auth/callback so the post-OAuth landing page can preserve the
      // destination — `detectSessionInUrl` would otherwise consume the
      // hash at the origin root and we'd lose the share path. The
      // /auth/callback URL must be on the project's Redirect URLs
      // allow-list in the Supabase dashboard.
      //
      // When there's no `next`, fall back to the legacy bare-origin
      // redirect so existing Google sign-ins keep working without any
      // dashboard change.
      let redirectTo: string | undefined;
      if (typeof window !== 'undefined') {
        if (next) {
          const cb = new URL('/auth/callback', window.location.origin);
          cb.searchParams.set('next', next);
          redirectTo = cb.toString();
        } else {
          redirectTo = window.location.origin;
        }
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) return { error: error.message };
      return {};
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Google sign-in failed';
      set({ error: msg });
      return { error: msg };
    } finally {
      set({ loading: false });
    }
  },

  resetPassword: async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined,
      });
      if (error) return { error: error.message };
      return {};
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : 'Failed to send reset email.' };
    }
  },

  fetchProfile: async () => {
    try {
      const user = get().user;
      if (!user) return;
      set({ error: null });
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        READ_MS,
        'fetchProfile',
      );
      if (error) throw error;
      const profile = data as Profile;
      set({ profile });
      // Cache identity hints in localStorage so the next cold-start
      // can render the correct guide and language synchronously
      // BEFORE the Supabase round-trip completes. Without this, the
      // mascot shown in the loading state flashes from a generic
      // fallback to the user's actual guide once the profile lands.
      if (typeof window !== 'undefined') {
        try {
          // Full-profile cache for offline cold-starts. authStore.initialize
          // reads this synchronously so the wall guard can resolve without
          // waiting for the network.
          window.localStorage.setItem('cached_profile', JSON.stringify(profile));
          if (profile.preferred_guide) {
            window.localStorage.setItem('preferred_guide', profile.preferred_guide);
          }
          if (profile.language) {
            window.localStorage.setItem('app_language', profile.language);
          }
          // Read by the inline `wall-pending` script in src/app/layout.tsx
          // to decide synchronously whether the resumed URL is on the
          // user's correct wall (without waiting for React to hydrate).
          if (profile.primary_use) {
            window.localStorage.setItem('cached_primary_use', profile.primary_use);
          }
        } catch {
          /* quota/private-mode — harmless */
        }
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch profile' });
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    try {
      const user = get().user;
      if (!user) throw new Error('No authenticated user');
      set({ loading: true, error: null });
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', user.id)
          .select()
          .single(),
        WRITE_MS,
        'updateProfile',
      );
      if (error) throw error;
      const updatedProfile = data as Profile;
      set({ profile: updatedProfile });
      // Mirror the identity-cache writes from fetchProfile so a change
      // made in Settings (e.g. switching primary_use to tasks-only)
      // propagates to localStorage immediately. Without this, the
      // inline wall-pending script would read a stale value on the
      // very next PWA resume.
      if (typeof window !== 'undefined') {
        try {
          if (updatedProfile.preferred_guide) {
            window.localStorage.setItem('preferred_guide', updatedProfile.preferred_guide);
          }
          if (updatedProfile.language) {
            window.localStorage.setItem('app_language', updatedProfile.language);
          }
          if (updatedProfile.primary_use) {
            window.localStorage.setItem('cached_primary_use', updatedProfile.primary_use);
          }
        } catch {
          /* quota/private-mode — harmless */
        }
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to update profile' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  completeOnboarding: async (
    displayName: string,
    anchorMoment: string,
    intentions: string[],
    preferredGuide?: string,
    primaryUse?: PrimaryUse,
  ) => {
    try {
      const user = get().user;
      if (!user) throw new Error('No authenticated user');
      set({ loading: true, error: null });
      // Persist whatever language the user picked on the welcome step
      // (lives in localStorage at this point). The cron uses this
      // server-side; without persistence the language never leaves
      // the browser.
      let chosenLanguage: 'en-US' | 'es-MX' = 'en-US';
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('app_language');
        if (stored === 'es-MX' || stored === 'en-US') chosenLanguage = stored;
      }
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .update({
            display_name: displayName,
            anchor_moment: anchorMoment,
            intentions,
            preferred_guide: preferredGuide || 'ben',
            primary_use: primaryUse ?? 'both',
            language: chosenLanguage,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
          .select()
          .single(),
        WRITE_MS,
        'completeOnboarding',
      );
      if (error) throw error;
      set({ profile: data as Profile });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to complete onboarding' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  setPreferredGuide: async (guideId: string) => {
    const { updateProfile } = get();
    // Write localStorage immediately so GuideMascot picks it up on the
    // next synchronous render — avoids a flash of the wrong guide while
    // the Supabase round-trip is in flight.
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('preferred_guide', guideId);
      } catch {
        /* ignore */
      }
    }
    await updateProfile({ preferred_guide: guideId } as Partial<Profile>);
  },
}));
