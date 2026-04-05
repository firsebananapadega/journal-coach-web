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
import { supabase } from '@/lib/supabase';

function IntentionsSection() {
  const { profile, updateProfile } = useAuthStore();
  const [newIntention, setNewIntention] = useState('');
  const intentions = profile?.intentions || [];

  const addIntention = async () => {
    if (!newIntention.trim()) return;
    await updateProfile({ intentions: [...intentions, newIntention.trim()] });
    setNewIntention('');
  };

  const removeIntention = async (index: number) => {
    const updated = intentions.filter((_, i) => i !== index);
    await updateProfile({ intentions: updated });
  };

  return (
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
        <div className="flex gap-2 pt-1">
          <input
            value={newIntention}
            onChange={(e) => setNewIntention(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addIntention()}
            placeholder="Add an intention..."
            className="flex-1 px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary outline-none focus:border-primary"
          />
          <button
            onClick={addIntention}
            disabled={!newIntention.trim()}
            className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function HabitsSection() {
  const { habits, fetchHabits, createHabit, deleteHabit } = useHabitStore();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState<'morning' | 'afternoon' | 'evening' | 'anytime'>('morning');

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await createHabit({
      user_id: user.id,
      name: newName.trim(),
      description: null,
      cue: null,
      routine: newName.trim(),
      reward: null,
      frequency: 'daily',
      custom_days: [],
      time_of_day: newTime,
      stack_after_habit_id: null,
      sort_order: habits.length,
      is_active: true,
    });
    setNewName('');
    setShowForm(false);
  };

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Habits</h2>
      <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        {habits.length > 0 ? (
          <div className="space-y-2">
            {habits.filter((h) => h.is_active).map((habit) => (
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

        {showForm ? (
          <div className="space-y-2 pt-1 border-t border-border">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Habit name..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-text-primary outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex gap-1">
              {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewTime(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                    newTime === t ? 'bg-primary text-white' : 'bg-surface-elevated text-text-secondary'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 bg-surface-elevated text-text-secondary rounded-lg text-sm">Cancel</button>
              <button onClick={handleAdd} disabled={!newName.trim()} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-40">Add Habit</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-2 bg-surface-elevated text-text-secondary rounded-lg text-sm hover:text-text-primary transition-colors"
          >
            + Add Habit
          </button>
        )}
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  moon: '🌙', sun: '☀️', heart: '❤️', face: '😊',
  cloud: '☁️', calendar: '📅', target: '🎯', document: '📄',
};

const CATEGORY_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', yearly: 'Yearly', anytime: 'Anytime',
  activity: 'Guided Activities', processing: 'Processing',
  growth: 'Growth', planning: 'Planning', mindset: 'Mindset',
  inner_work: 'Inner Work', science: 'Science',
};

interface TemplateOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { profile, user, signOut, setPreferredGuide } = useAuthStore();
  const { mode, setMode } = useTheme();
  const guide = getGuideOrDefault(profile?.preferred_guide);
  const [showGuideSelector, setShowGuideSelector] = useState(false);
  const [showGuidedBubble, setShowGuidedBubble] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // Template management
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    // Load guided bubble pref
    const stored = localStorage.getItem('show_guided_bubble');
    setShowGuidedBubble(stored !== 'false');
    // Load template prefs
    const tmplStored = localStorage.getItem('enabled_template_ids');
    if (tmplStored) setEnabledIds(JSON.parse(tmplStored));
    // Fetch templates
    supabase.from('templates').select('id, name, icon, description, category').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setTemplates(data);
    });
  }, []);

  const toggleGuidedBubble = (value: boolean) => {
    setShowGuidedBubble(value);
    localStorage.setItem('show_guided_bubble', String(value));
  };

  const toggleTemplate = (id: string) => {
    const next = enabledIds.includes(id) ? enabledIds.filter((i) => i !== id) : [...enabledIds, id];
    setEnabledIds(next);
    localStorage.setItem('enabled_template_ids', JSON.stringify(next));
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

  // Group templates by category
  const categories = [...new Set(templates.map((t) => t.category))];

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

      {/* Manage Templates */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Templates</h2>
        <div className="bg-surface rounded-2xl border border-border p-4">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary">Manage Templates</p>
                <p className="text-xs text-text-secondary">
                  {enabledIds.length} active · toggle to add to home screen
                </p>
              </div>
            </div>
            <span className="text-text-tertiary text-xl">{showTemplates ? '▾' : '›'}</span>
          </button>

          {showTemplates && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              {categories.map((cat) => (
                <div key={cat} className="space-y-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">
                    {CATEGORY_LABELS[cat] || cat}
                  </p>
                  {templates.filter((t) => t.category === cat).map((tmpl) => {
                    const isEnabled = enabledIds.includes(tmpl.id);
                    return (
                      <div key={tmpl.id} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-lg">{ICONS[tmpl.icon] || '📄'}</span>
                          <div className="min-w-0">
                            <p className="text-sm text-text-primary truncate">{tmpl.name}</p>
                            <p className="text-xs text-text-tertiary truncate">{tmpl.description}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleTemplate(tmpl.id)}
                          className={`ml-2 w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${isEnabled ? 'bg-primary' : 'bg-border'}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isEnabled ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
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

      {/* Intentions — editable */}
      <IntentionsSection />

      {/* Habits — editable */}
      <HabitsSection />

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
