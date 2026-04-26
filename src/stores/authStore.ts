import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/withTimeout';

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
    reminder_times: { morning: string; evening: string };
  };
  /** How often the weekly guide letter should fire. Default 'weekly'. */
  letter_cadence: LetterCadence;
  tour_completed: boolean;
  install_prompt_dismissed_at: string | null;
  pwa_installed: boolean;
  /** Asked during onboarding — determines which wall (Journal / Tasks)
   *  loads on first app open. After that, wallState localStorage owns
   *  the default. */
  primary_use: PrimaryUse | null;
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
  signInWithGoogle: () => Promise<{ error?: string }>;
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

      if (session?.user) {
        await get().fetchProfile();
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

  signInWithGoogle: async () => {
    try {
      set({ loading: true, error: null });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
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
      set({ profile: data as Profile });
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
      set({ profile: data as Profile });
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
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .update({
            display_name: displayName,
            anchor_moment: anchorMoment,
            intentions,
            preferred_guide: preferredGuide || 'ben',
            primary_use: primaryUse ?? 'both',
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
