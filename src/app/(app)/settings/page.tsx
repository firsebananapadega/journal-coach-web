'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import GuideMascot from '@/components/mascot/GuideMascot';
import { staggerContainer, staggerItem, prefersReducedMotion } from '@/lib/motionVariants';
import { useAuthStore, type LetterCadence, type PrimaryUse, type Profile } from '@/stores/authStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useHabitStore } from '@/stores/habitStore';
import { useJournalStore } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { useTheme } from '@/lib/theme';
import { GuideSelector } from '@/components/GuideSelector';
import { getGuideOrDefault, ALL_GUIDES } from '@/lib/guideConfigs';
import { getLanguage, getLocale, setLanguage, LANGUAGES, type AppLanguage } from '@/lib/language';
import { t } from '@/lib/translations';

export default function SettingsPage() {
  const router = useRouter();
  const { profile, user, signOut, updateProfile, setPreferredGuide } = useAuthStore();
  const { habits, fetchHabits, deleteHabit } = useHabitStore();
  const { mode, setMode, guideTheme, setGuideTheme } = useTheme();
  const showToast = useUiStore((s) => s.showToast);
  const guide = getGuideOrDefault(profile?.preferred_guide);
  const [signingOut, setSigningOut] = useState(false);
  const [enabledTemplateCount, setEnabledTemplateCount] = useState(0);
  const [newIntention, setNewIntention] = useState('');
  const [currentLang, setCurrentLang] = useState<AppLanguage>('en-US');

  const intentions = profile?.intentions || [];

  useEffect(() => {
    fetchHabits();
    const tmplStored = localStorage.getItem('enabled_template_ids');
    if (tmplStored) {
      try { setEnabledTemplateCount(JSON.parse(tmplStored).length); } catch { /* ignore */ }
    }
    setCurrentLang(getLanguage());
  }, [fetchHabits]);

  const removeIntention = async (index: number) => {
    const updated = intentions.filter((_, i) => i !== index);
    await updateProfile({ intentions: updated });
  };

  const addIntention = async () => {
    const text = newIntention.trim();
    if (!text) return;
    await updateProfile({ intentions: [...intentions, text] });
    setNewIntention('');
  };

  const handleLanguageChange = async (lang: AppLanguage) => {
    setLanguage(lang);
    setCurrentLang(lang);
    // Persist to profile so server-side processes (letter crons,
    // reminder pushes) can localize. Fire-and-forget; the local
    // state flip is what the user feels immediately.
    updateProfile({ language: lang } as Partial<typeof profile> & { language: AppLanguage }).catch(() => {});
    window.location.reload();
  };

  const handleSignOut = async () => {
    if (!confirm(t('settings.confirmSignOut'))) return;
    setSigningOut(true);
    try {
      // Keep enabled_template_ids and home_grid_slots in localStorage
      // so they persist across logout/login on the same device
      useHabitStore.getState().reset();
      useJournalStore.getState().reset();
      await signOut();
      router.replace('/auth/welcome');
    } finally {
      setSigningOut(false);
    }
  };

  const activeHabits = habits.filter((h) => h.is_active);

  const motionRoot = prefersReducedMotion
    ? {}
    : { variants: staggerContainer, initial: 'initial' as const, animate: 'animate' as const };
  const sectionMotion = prefersReducedMotion ? {} : { variants: staggerItem };

  return (
    <motion.div
      {...motionRoot}
      className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-5 overflow-y-auto"
    >
      <motion.div {...sectionMotion} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('settings.title')}</h1>
        <button
          onClick={() => {
            // history.back() lands the user back on whichever wall page
            // they came from, preserving their flip state. Falls back
            // to /pulse (Journal wall default) if history is empty.
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.push('/pulse');
            }
          }}
          className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-text-primary"
          aria-label={t('common.back')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </motion.div>

      {/* Profile Card — glass + Bodhi */}
      <motion.div
        {...sectionMotion}
        className="glass-card rounded-2xl p-5 flex items-center gap-4 shadow-warm-md"
      >
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-warm-md">
            <span className="text-2xl font-bold text-white">
              {(profile?.display_name || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1">
            <GuideMascot pose="idle" size="sm" animate />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-text-primary truncate">{profile?.display_name || 'User'}</p>
          <p className="text-sm text-text-secondary truncate">{user?.email || ''}</p>
        </div>
      </motion.div>

      {/* PR 2 retired the "Use this app for" segmented control. After
          the wall collapse, every user sees the full feature set —
          each feature has its own opt-in toggle (Plans / Gratitude /
          Guided / Pulse reminders / Letter cadence) so users still
          control what's surfaced. */}

      {/* Your Guide — was previously hidden for tasks-only users.
          PR 2 drops the gate. */}
      <motion.div {...sectionMotion} className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.yourGuide')}</h2>
          <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm">
            <GuideSelector
              value={guide.id}
              onChange={async (id) => {
                if (id === guide.id) return;
                try {
                  await setPreferredGuide(id);
                  const newGuide = ALL_GUIDES.find((g) => g.id === id);
                  showToast(
                    t('settings.guideChanged', { name: newGuide?.name ?? '' })
                  );
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : t('common.error'),
                    'error'
                  );
                }
              }}
            />
          </div>
        </motion.div>

      {/* Reflections — letter cadence. Was journal-side; PR 2 makes
          available to all users. */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Reflections</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Weekly letter cadence</p>
            <p className="text-xs text-text-secondary mt-0.5">
              How often {guide.name} writes you a letter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'weekly', label: 'Weekly' },
                { id: 'biweekly', label: 'Every 2 weeks' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'off', label: 'Off' },
              ] as Array<{ id: LetterCadence; label: string }>
            ).map((opt) => {
              const selected = (profile?.letter_cadence ?? 'weekly') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={async () => {
                    if (selected) return;
                    try {
                      await updateProfile({ letter_cadence: opt.id });
                      showToast(`Letter cadence: ${opt.label}`, 'success');
                    } catch (err) {
                      showToast(
                        err instanceof Error ? err.message : 'Could not save',
                        'error',
                      );
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-primary text-white border border-primary'
                      : 'bg-surface-elevated border border-border text-text-secondary hover:text-text-primary'
                  }`}
                  aria-pressed={selected}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Patterns + Letters — combined surface link. /patterns
          already renders weekly + monthly + quarterly together via
          lettersStore.ArchiveItem. PR 2 makes Settings the entry
          point (was previously a journal-wall tab). */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('settings.patterns.title')}
        </h2>
        <button
          type="button"
          onClick={() => router.push('/patterns')}
          className="w-full bg-surface rounded-2xl border border-border p-4 shadow-warm-sm flex items-center justify-between gap-3 hover:border-primary transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t('settings.patterns.linkLabel')}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
              {t('settings.patterns.linkHint')}
            </p>
          </div>
          <span className="text-text-tertiary text-xl shrink-0" aria-hidden>›</span>
        </button>
      </motion.div>

      {/* Templates — nav link. COMMENTED OUT per user request
          (2026-05-02). Restore by removing the {false &&} wrapper. */}
      {false && (
        <motion.div {...sectionMotion} className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.templates')}</h2>
          <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm">
            <button
              onClick={() => router.push('/templates')}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">📋</span>
                <div className="text-left">
                  <p className="text-sm font-medium text-text-primary">{t('settings.manageTemplates')}</p>
                  <p className="text-xs text-text-secondary">
                    {t('settings.activeOnHome', { count: String(enabledTemplateCount) })}
                  </p>
                </div>
              </div>
              <span className="text-text-tertiary text-sm">&#8250;</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Pulse reminders — fire push notifications at the user's
          chosen morning + evening times. The cron at
          /api/cron/send-pulse-reminders evaluates these per-user in
          the user's timezone every 5 min. Visible to all users; users
          opt in via the per-mode toggles below. */}
      {(() => {
        const prefs = profile?.notification_preferences ?? {
          morning_reminder: false,
          evening_reminder: false,
          presence_reminder: true,
          reminder_times: { morning: '08:00', evening: '21:30', presence: '13:00' },
        };
        const morningOn = prefs.morning_reminder === true;
        const eveningOn = prefs.evening_reminder === true;
        // Presence defaults to ON for users who haven't toggled — surfaces
        // the new tab the way morning/evening surface the pulse. Existing
        // users won't have the field; treat undefined as default-on.
        const presenceOn = prefs.presence_reminder !== false;
        const morningTime = prefs.reminder_times?.morning || '08:00';
        const eveningTime = prefs.reminder_times?.evening || '21:30';
        const presenceTime = prefs.reminder_times?.presence || '13:00';

        const updatePrefs = async (
          patch: Partial<{
            morning_reminder: boolean;
            evening_reminder: boolean;
            presence_reminder: boolean;
            reminder_times: Partial<{ morning: string; evening: string; presence: string }>;
          }>,
        ) => {
          const next = {
            morning_reminder:
              patch.morning_reminder !== undefined ? patch.morning_reminder : morningOn,
            evening_reminder:
              patch.evening_reminder !== undefined ? patch.evening_reminder : eveningOn,
            presence_reminder:
              patch.presence_reminder !== undefined ? patch.presence_reminder : presenceOn,
            reminder_times: {
              morning: patch.reminder_times?.morning ?? morningTime,
              evening: patch.reminder_times?.evening ?? eveningTime,
              presence: patch.reminder_times?.presence ?? presenceTime,
            },
          };
          try {
            await updateProfile({ notification_preferences: next });
          } catch (err) {
            showToast(err instanceof Error ? err.message : t('common.error'), 'error');
          }
        };

        return (
          <motion.div {...sectionMotion} className="space-y-2">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
              Pulse reminders
            </h2>
            <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-4">
              {/* Morning briefing — replaces the prior "morning
                  pulse" push. Toggle still flips morning_reminder;
                  the cron now sends a digest of today's tasks +
                  groceries instead of a pulse nudge. */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {t('settings.morningBriefing.title')}
                  </p>
                  <p className="text-xs text-text-tertiary leading-snug mt-0.5">
                    {t('settings.morningBriefing.subtitle')}
                  </p>
                </div>
                <input
                  type="time"
                  value={morningTime}
                  disabled={!morningOn}
                  onChange={(e) =>
                    updatePrefs({
                      reminder_times: { morning: e.target.value, evening: eveningTime },
                    })
                  }
                  className="px-2 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary outline-none w-[100px] disabled:opacity-40"
                />
                <button
                  role="switch"
                  aria-checked={morningOn}
                  onClick={() => updatePrefs({ morning_reminder: !morningOn })}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                    morningOn ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      morningOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Mid-day Presence pause */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t('settings.presenceReminder')}</p>
                  <p className="text-xs text-text-tertiary leading-snug mt-0.5">
                    {t('settings.presenceReminderDesc')}
                  </p>
                </div>
                <input
                  type="time"
                  value={presenceTime}
                  disabled={!presenceOn}
                  onChange={(e) =>
                    updatePrefs({
                      reminder_times: { presence: e.target.value },
                    })
                  }
                  className="px-2 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary outline-none w-[100px] disabled:opacity-40"
                />
                <button
                  role="switch"
                  aria-checked={presenceOn}
                  onClick={() => updatePrefs({ presence_reminder: !presenceOn })}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                    presenceOn ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      presenceOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Evening */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">Evening pulse</p>
                  <p className="text-xs text-text-tertiary leading-snug mt-0.5">
                    A short reflection before you wind down.
                  </p>
                </div>
                <input
                  type="time"
                  value={eveningTime}
                  disabled={!eveningOn}
                  onChange={(e) =>
                    updatePrefs({
                      reminder_times: { morning: morningTime, evening: e.target.value },
                    })
                  }
                  className="px-2 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary outline-none w-[100px] disabled:opacity-40"
                />
                <button
                  role="switch"
                  aria-checked={eveningOn}
                  onClick={() => updatePrefs({ evening_reminder: !eveningOn })}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                    eveningOn ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      eveningOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-[11px] text-text-tertiary leading-snug">
                Reminders only fire if you haven't completed that pulse yet
                today. Times are in your local timezone.
              </p>
            </div>
          </motion.div>
        );
      })()}

      {/* Appearance */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.appearance')}</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">{t('settings.theme')}</span>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    mode === m ? 'bg-primary border-primary text-white' : 'border-border text-text-secondary'
                  }`}
                >
                  {m === 'dark' ? t('settings.dark') : t('settings.light')}
                </button>
              ))}
            </div>
          </div>
          {/* Guide-matched theme toggle — off by default. When on, the
              app's primary accent color follows the currently-selected
              guide (saffron for Bodhi, red for Ben, teal for Quinn,
              green for Sage). */}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex-1 pr-3">
              <p className="text-sm font-medium text-text-primary">{t('settings.guideTheme')}</p>
              <p className="text-xs text-text-secondary mt-0.5">{t('settings.guideThemeDesc')}</p>
            </div>
            <button
              onClick={() => setGuideTheme(!guideTheme)}
              aria-pressed={guideTheme}
              className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${guideTheme ? 'bg-primary' : 'bg-border'}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  guideTheme ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Language — toggle pills only. The redundant
          "🇺🇸 English" / "🇲🇽 Español" label that previously sat
          on the left was dropped per user feedback (the toggle's
          active-state styling already conveys the current pick). */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.language')}</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm">
          <div className="flex gap-2 justify-center">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  currentLang === lang.code
                    ? 'bg-primary border-primary text-white'
                    : 'border-border text-text-secondary'
                }`}
              >
                {lang.flag} {lang.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Tutorial — replay onboarding tour + tab popups. ACTION
          button (not a toggle) so it's clear that tapping starts
          the tour, not just flipping a setting. On tap: reset all
          flags AND auto-navigate to the right starting route so the
          user doesn't have to leave Settings themselves. */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.tutorial.title')}</h2>
        <button
          type="button"
          onClick={async () => {
            // Clear all tour-state flags so the orchestrator's
            // auto-start re-fires.
            if (typeof window !== 'undefined') {
              localStorage.setItem('tour_pending', '1');
              localStorage.removeItem('tour_seen_tabs.v1');
            }
            await updateProfile({
              tour_completed: false,
              tour_seen_tabs: [],
            } as Partial<Profile>);
            // Navigate to /today — the single landing page after
            // PR 2's wall collapse. The tour orchestrator picks up
            // from there.
            router.push('/today');
          }}
          className="w-full bg-surface rounded-2xl border border-border p-4 shadow-warm-sm flex items-center justify-between gap-3 hover:border-primary transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">
              {t('settings.tutorial.replayAction')}
            </p>
            <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
              {t('settings.tutorial.replayHint')}
            </p>
          </div>
          <span className="text-text-tertiary text-xl shrink-0" aria-hidden>›</span>
        </button>
      </motion.div>

      {/* Gratitude — auto-detect toggle. When on, the structureEntry
          pass also returns gratitude excerpts and the journal pages
          show a "Save to Gratitude?" suggestion sheet. PR 2 makes
          this visible to all users (no longer journal-only). */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('settings.gratitude.title')}
        </h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {t('settings.gratitude.toggleLabel')}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                {t('settings.gratitude.toggleHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile?.gratitude_auto_detect_enabled === true}
              onClick={async () => {
                const next = profile?.gratitude_auto_detect_enabled !== true;
                // Promote / demote the Gratitude notebook to match the
                // toggle state. After 20260509 the notebook is a normal
                // project notebook by default; turning auto-detect on
                // promotes it to a non-deletable system notebook
                // (the feature relies on a stable destination), and
                // turning off demotes it back so the user can manage
                // it like any other notebook.
                try {
                  await useNotebookStore
                    .getState()
                    .ensureGratitudeNotebook(next ? 'system' : 'project');
                } catch {
                  // Fall through — the flag still flips, and a future
                  // suggestion will defensively re-call this.
                }
                await updateProfile({
                  gratitude_auto_detect_enabled: next,
                } as Partial<Profile>);
                await useNotebookStore.getState().fetchNotebooks();
              }}
              className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                profile?.gratitude_auto_detect_enabled === true ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-warm-sm transition-transform ${
                  profile?.gratitude_auto_detect_enabled === true ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Plans (WOOP) — opt-in feature toggle. Visible to ALL users
          (including tasks-only) since plans are productivity-shaped,
          not journaling. Toggle ON: ensurePlansNotebook materializes
          the system notebook + plans_enabled flips. Toggle OFF: just
          flips the flag — notebook + plan rows stay in DB so the
          user's history isn't lost on a re-enable. Tasks-only users
          have no Notebooks tab, so we surface a chevron link here
          when toggled on so they can navigate straight to the
          notebook page. */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('settings.plans.title')}
        </h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {t('settings.plans.toggleLabel')}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                {t('settings.plans.toggleHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile?.plans_enabled === true}
              onClick={async () => {
                const next = profile?.plans_enabled !== true;
                if (next) {
                  // Materialize the Plans system notebook on first
                  // enable. Idempotent — re-enables after a disable
                  // re-select the existing row.
                  try {
                    await useNotebookStore.getState().ensurePlansNotebook();
                  } catch {
                    // Fall through; the profile flip below still
                    // works, and the notebook list refresh on next
                    // fetch will surface any pending row.
                  }
                }
                await updateProfile({
                  plans_enabled: next,
                } as Partial<Profile>);
                // Refresh notebook list so the Plans entry appears
                // (or disappears) immediately on the index page.
                await useNotebookStore.getState().fetchNotebooks();
              }}
              className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                profile?.plans_enabled === true ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-warm-sm transition-transform ${
                  profile?.plans_enabled === true ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {profile?.plans_enabled === true && (
            <button
              type="button"
              onClick={() => router.push('/notebooks/plans')}
              className="w-full flex items-center justify-between text-sm text-primary hover:text-primary-dark transition-colors pt-1 border-t border-border"
            >
              <span className="font-medium pt-3">{t('settings.plans.openNotebook')}</span>
              <span className="pt-3" aria-hidden>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Guided sessions — opt-in feature toggle. When ON, /guided
          becomes reachable and a "Start a guided session" button
          surfaces inside the Journal system notebook. Default OFF
          (matches Plans / Gratitude opt-in pattern). PR 2 of the
          wall restructure folds the previous /guided journal-wall
          tab into this Settings + Journal-notebook entry shape. */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {t('settings.guided.title')}
        </h2>
        <div className="bg-surface rounded-2xl border border-border p-4 shadow-warm-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {t('settings.guided.toggleLabel')}
              </p>
              <p className="text-xs text-text-tertiary mt-0.5 leading-snug">
                {t('settings.guided.toggleHint')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile?.guided_enabled === true}
              onClick={async () => {
                const next = profile?.guided_enabled !== true;
                await updateProfile({
                  guided_enabled: next,
                } as Partial<Profile>);
              }}
              className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
                profile?.guided_enabled === true ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white shadow-warm-sm transition-transform ${
                  profile?.guided_enabled === true ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {profile?.guided_enabled === true && (
            <button
              type="button"
              onClick={() => router.push('/guided')}
              className="w-full flex items-center justify-between text-sm text-primary hover:text-primary-dark transition-colors pt-1 border-t border-border"
            >
              <span className="font-medium pt-3">{t('settings.guided.openSession')}</span>
              <span className="pt-3" aria-hidden>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Tools section — COMMENTED OUT (2026-05-02). Pulse Reflection
          moved to the Patterns page header. Habits + Templates hidden
          for now (per user). Kept inert (not deleted) so unblock is a
          single edit. */}
      {false && (
        <motion.div {...sectionMotion} className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.tools.title')}</h2>
          <div className="bg-surface rounded-2xl border border-border shadow-warm-sm divide-y divide-border overflow-hidden">
            {[
              { href: '/pulse', label: t('settings.tools.pulseReflection'), hint: t('settings.tools.pulseReflectionHint') },
              { href: '/habits', label: t('settings.tools.habits'), hint: t('settings.tools.habitsHint') },
              { href: '/templates', label: t('settings.tools.templates'), hint: t('settings.tools.templatesHint') },
            ].map((tool) => (
              <button
                key={tool.href}
                type="button"
                onClick={() => router.push(tool.href)}
                className="w-full p-4 flex items-center justify-between gap-3 hover:bg-surface-elevated transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{tool.label}</p>
                  <p className="text-xs text-text-tertiary mt-0.5 leading-snug">{tool.hint}</p>
                </div>
                <span className="text-text-tertiary text-xl shrink-0" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Privacy */}
      <motion.div {...sectionMotion} className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.privacy')}</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 flex items-start gap-3 shadow-warm-sm">
          <span className="text-xl mt-0.5">🔒</span>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('settings.privacyMessage')}
          </p>
        </div>
      </motion.div>

      {/* DISABLED: intentions UI hidden — feature replaced by Presence pause.
          Block kept (not deleted) so reverting is a single-edit unblock.
          The /intentions route still resolves if URL is typed manually
          and existing profile.intentions data is preserved verbatim. */}
      {false && (
        <motion.div {...sectionMotion} className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.intentions')}</h2>
          <div className="bg-surface rounded-2xl border border-border p-4 space-y-3 shadow-warm-sm">
            {intentions.length > 0 ? (
              <div className="space-y-2">
                {intentions.map((intention, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-primary flex-1">{intention}</span>
                    <button onClick={() => removeIntention(i)} className="text-text-tertiary hover:text-error text-xs px-2">✕</button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">{t('settings.noIntentions')}</p>
            )}
            <div className="flex gap-2">
              <input
                value={newIntention}
                onChange={(e) => setNewIntention(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIntention()}
                placeholder={t('settings.addIntentionPlaceholder')}
                className="flex-1 px-3 py-2 bg-surface-elevated border border-border rounded-xl text-text-primary text-sm focus:border-primary outline-none"
              />
              <button
                onClick={addIntention}
                disabled={!newIntention.trim()}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-primary-dark transition-colors"
              >
                {t('common.add')}
              </button>
            </div>
            <button
              onClick={() => router.push('/intentions/gallery')}
              className="w-full py-2.5 bg-surface-elevated text-primary rounded-xl text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              {t('settings.browseIntentions')} &#8250;
            </button>
          </div>
        </motion.div>
      )}

      {/* Habits — compact display + nav link. COMMENTED OUT
          (2026-05-02) per user request. Restore by removing the
          {false &&} wrapper. The /habits route still resolves and
          existing habit data is preserved. */}
      {false && (
        <motion.div {...sectionMotion} className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{t('settings.habits')}</h2>
          <div className="bg-surface rounded-2xl border border-border p-4 space-y-3 shadow-warm-sm">
            {activeHabits.length > 0 ? (
              <div className="space-y-2">
                {activeHabits.map((habit) => (
                  <div key={habit.id} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary truncate">{habit.name}</p>
                      <p className="text-xs text-text-tertiary capitalize">{habit.time_of_day} · {habit.frequency}</p>
                    </div>
                    <button
                      onClick={() => { if (confirm(t('settings.confirmDeleteHabit', { name: habit.name }))) deleteHabit(habit.id); }}
                      className="text-text-tertiary hover:text-error text-xs px-2"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">{t('settings.noHabits')}</p>
            )}
            <button
              onClick={() => router.push('/habits')}
              className="w-full py-2.5 bg-surface-elevated text-primary rounded-xl text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              {t('settings.manageHabits')} &#8250;
            </button>
          </div>
        </motion.div>
      )}

      {/* Sign Out */}
      <motion.button
        {...sectionMotion}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full py-3 bg-surface border border-border text-error font-medium rounded-2xl hover:bg-surface-elevated transition-colors disabled:opacity-50"
      >
        {signingOut ? t('settings.signingOut') : t('settings.signOut')}
      </motion.button>

      <motion.p {...sectionMotion} className="text-center text-xs text-text-tertiary">JournalCoach Web v1.0.0</motion.p>
    </motion.div>
  );
}
