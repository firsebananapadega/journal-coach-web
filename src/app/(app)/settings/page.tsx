'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/authStore';
import { useHabitStore } from '@/stores/habitStore';
import { useJournalStore } from '@/stores/journalStore';
import { useTheme } from '@/lib/theme';
import { GuideSelector } from '@/components/GuideSelector';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';
import { getLanguage, setLanguage, LANGUAGES, type AppLanguage } from '@/lib/language';

export default function SettingsPage() {
  const router = useRouter();
  const { profile, user, signOut, updateProfile, setPreferredGuide } = useAuthStore();
  const { habits, fetchHabits, deleteHabit } = useHabitStore();
  const { mode, setMode } = useTheme();
  const guide = getGuideOrDefault(profile?.preferred_guide);
  const [showGuideSelector, setShowGuideSelector] = useState(false);
  const [showGuidedBubble, setShowGuidedBubble] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [enabledTemplateCount, setEnabledTemplateCount] = useState(0);
  const [newIntention, setNewIntention] = useState('');
  const [currentLang, setCurrentLang] = useState<AppLanguage>('en-US');

  const intentions = profile?.intentions || [];

  useEffect(() => {
    fetchHabits();
    const stored = localStorage.getItem('show_guided_bubble');
    setShowGuidedBubble(stored !== 'false');
    const tmplStored = localStorage.getItem('enabled_template_ids');
    if (tmplStored) {
      try { setEnabledTemplateCount(JSON.parse(tmplStored).length); } catch { /* ignore */ }
    }
    setCurrentLang(getLanguage());
  }, [fetchHabits]);

  const toggleGuidedBubble = (value: boolean) => {
    setShowGuidedBubble(value);
    localStorage.setItem('show_guided_bubble', String(value));
  };

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

  const handleLanguageChange = (lang: AppLanguage) => {
    setLanguage(lang);
    setCurrentLang(lang);
  };

  const handleSignOut = async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    setSigningOut(true);
    try {
      localStorage.removeItem('enabled_template_ids');
      localStorage.removeItem('show_guided_bubble');
      useHabitStore.getState().reset();
      useJournalStore.getState().reset();
      await signOut();
      router.replace('/auth/welcome');
    } finally {
      setSigningOut(false);
    }
  };

  const activeHabits = habits.filter((h) => h.is_active);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-5 overflow-y-auto">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {/* Profile Card */}
      <div className="bg-surface rounded-2xl border border-border p-5 flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
          <span className="text-2xl font-bold text-white">
            {(profile?.display_name || 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <p className="text-lg font-semibold text-text-primary">{profile?.display_name || 'User'}</p>
        <p className="text-sm text-text-secondary">{user?.email || ''}</p>
      </div>

      {/* Home Screen — Guided Journal toggle */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Home Screen</h2>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">💬</span>
              <span className="text-sm font-medium text-text-primary">Guided Journal</span>
            </div>
            <button
              onClick={() => toggleGuidedBubble(!showGuidedBubble)}
              className={`w-11 h-6 rounded-full transition-colors relative ${showGuidedBubble ? 'bg-primary' : 'bg-border'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${showGuidedBubble ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Your Guide */}
      {showGuidedBubble && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Your Guide</h2>
          <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
            <button
              onClick={() => setShowGuideSelector(!showGuideSelector)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Image
                  src={getGuideAvatar(guide.id as GuideId)}
                  alt={guide.name}
                  width={40}
                  height={40}
                  className="rounded-full"
                  style={{ borderWidth: 2, borderColor: guide.accentColor, borderStyle: 'solid' }}
                />
                <div className="text-left">
                  <p className="text-sm font-semibold text-text-primary">{guide.name}</p>
                  <p className="text-xs text-text-secondary">{guide.archetype}</p>
                </div>
              </div>
              <span className="text-sm text-text-tertiary">{showGuideSelector ? 'Done' : 'Change'}</span>
            </button>
            {showGuideSelector && (
              <GuideSelector
                value={guide.id}
                onChange={async (id) => {
                  await setPreferredGuide(id);
                  setShowGuideSelector(false);
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Templates — nav link */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Templates</h2>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <button
            onClick={() => router.push('/templates')}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Manage Templates</p>
                <p className="text-xs text-text-secondary">
                  {enabledTemplateCount} active on home screen
                </p>
              </div>
            </div>
            <span className="text-text-tertiary text-sm">&#8250;</span>
          </button>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Appearance</h2>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Theme</span>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    mode === m ? 'bg-primary border-primary text-white' : 'border-border text-text-secondary'
                  }`}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Language</h2>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">
              {LANGUAGES.find((l) => l.code === currentLang)?.flag}{' '}
              {LANGUAGES.find((l) => l.code === currentLang)?.label}
            </span>
            <div className="flex gap-2">
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
        </div>
      </div>

      {/* Privacy */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Privacy</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 flex items-start gap-3">
          <span className="text-xl mt-0.5">🔒</span>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your journal data is stored securely in Supabase with row-level security. Only you can access your entries.
          </p>
        </div>
      </div>

      {/* Intentions — compact display + nav link */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Intentions</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
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
            <p className="text-sm text-text-tertiary">No intentions set yet.</p>
          )}
          <div className="flex gap-2">
            <input
              value={newIntention}
              onChange={(e) => setNewIntention(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addIntention()}
              placeholder="Add an intention..."
              className="flex-1 px-3 py-2 bg-surface-elevated border border-border rounded-xl text-text-primary text-sm focus:border-primary outline-none"
            />
            <button
              onClick={addIntention}
              disabled={!newIntention.trim()}
              className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-primary-dark transition-colors"
            >
              Add
            </button>
          </div>
          <button
            onClick={() => router.push('/intentions')}
            className="w-full py-2.5 bg-surface-elevated text-primary rounded-xl text-sm font-medium hover:bg-primary/10 transition-colors"
          >
            Browse Intentions &#8250;
          </button>
        </div>
      </div>

      {/* Habits — compact display + nav link */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Habits</h2>
        <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
          {activeHabits.length > 0 ? (
            <div className="space-y-2">
              {activeHabits.map((habit) => (
                <div key={habit.id} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{habit.name}</p>
                    <p className="text-xs text-text-tertiary capitalize">{habit.time_of_day} · {habit.frequency}</p>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Delete "${habit.name}"?`)) deleteHabit(habit.id); }}
                    className="text-text-tertiary hover:text-error text-xs px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No habits yet.</p>
          )}
          <button
            onClick={() => router.push('/habits')}
            className="w-full py-2.5 bg-surface-elevated text-primary rounded-xl text-sm font-medium hover:bg-primary/10 transition-colors"
          >
            Manage Habits &#8250;
          </button>
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full py-3 bg-surface border border-border text-error font-medium rounded-2xl hover:bg-surface-elevated transition-colors disabled:opacity-50"
      >
        {signingOut ? 'Signing out...' : 'Sign out'}
      </button>

      <p className="text-center text-xs text-text-tertiary">JournalCoach Web v1.0.0</p>
    </div>
  );
}
