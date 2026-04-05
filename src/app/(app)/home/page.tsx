'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/authStore';
import { useHabitStore } from '@/stores/habitStore';
import { useJournalStore } from '@/stores/journalStore';
import { getTimeOfDay } from '@/lib/guidanceEngine';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';
import { toLocalDateStr, entryDateStr } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';

interface TemplateInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

const ICONS: Record<string, string> = {
  moon: '🌙', sun: '☀️', heart: '❤️', face: '😊',
  cloud: '☁️', calendar: '📅', target: '🎯', document: '📄',
};

export default function HomePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { habits, fetchHabits, completions, fetchCompletions, toggleCompletion } = useHabitStore();
  const { entries, fetchEntries } = useJournalStore();
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [showGuidedBubble, setShowGuidedBubble] = useState(true);

  const today = toLocalDateStr(new Date());
  const timeOfDay = getTimeOfDay();
  const name = profile?.display_name;
  const guide = getGuideOrDefault(profile?.preferred_guide);

  const greeting =
    timeOfDay === 'morning'
      ? `Good morning${name ? ', ' + name : ''}.`
      : timeOfDay === 'afternoon'
      ? `Good afternoon${name ? ', ' + name : ''}.`
      : `Good evening${name ? ', ' + name : ''}.`;

  const todayCompletions = completions[today] || new Set<string>();
  const activeHabits = habits.filter((h) => h.is_active);

  const templateCompletedToday = useMemo(() => {
    const completed = new Set<string>();
    entries.forEach((e) => {
      if (e.entry_type === 'template' && e.template_id && entryDateStr(e.created_at) === today) {
        completed.add(e.template_id);
      }
    });
    return completed;
  }, [entries, today]);

  const loadData = useCallback(async () => {
    // Fire all fetches in parallel — don't block on each other
    fetchHabits();
    fetchCompletions(today, today);
    fetchEntries();
    // Load prefs
    const guidedPref = typeof window !== 'undefined' ? localStorage.getItem('show_guided_bubble') : null;
    setShowGuidedBubble(guidedPref !== 'false');
    const stored = typeof window !== 'undefined' ? localStorage.getItem('enabled_template_ids') : null;
    // If no preferences saved, default to empty (user must select in settings or onboarding)
    const ids = stored ? JSON.parse(stored) as string[] : [];
    setEnabledIds(ids);
    supabase.from('templates').select('id, name, icon, description, category').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setTemplates(data);
    });
  }, [fetchHabits, fetchCompletions, fetchEntries, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Show content immediately — no loading gate
  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      {/* Greeting */}
      <div>
        <p className="text-sm text-text-secondary">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-2xl font-bold text-text-primary mt-1">{greeting}</h1>
      </div>

      {/* Guided session card — only show if enabled */}
      {showGuidedBubble && <button
        onClick={() => router.push('/guided')}
        className="w-full flex items-center gap-4 p-4 bg-surface rounded-2xl border border-border hover:border-primary/50 transition-colors text-left"
      >
        <Image
          src={getGuideAvatar(guide.id as GuideId)}
          alt={guide.name}
          width={48}
          height={48}
          className="rounded-full object-cover"
        />
        <div className="flex-1">
          <p className="font-semibold text-text-primary">Talk to {guide.name}</p>
          <p className="text-xs text-text-secondary">{guide.archetype} — guided session</p>
        </div>
        <span className="text-text-tertiary text-2xl">&rsaquo;</span>
      </button>}

      {/* Quick action */}
      <button
        onClick={() => router.push('/voice')}
        className="w-full flex items-center gap-4 p-4 bg-surface rounded-2xl border border-border hover:border-primary/50 transition-colors text-left"
      >
        <span className="text-2xl">🎙️</span>
        <div className="flex-1">
          <p className="font-semibold text-text-primary">Free Thought</p>
          <p className="text-xs text-text-secondary">Just talk</p>
        </div>
        <span className="text-text-tertiary text-2xl">&rsaquo;</span>
      </button>

      {/* Templates — show only enabled ones, or all if no preferences saved */}
      {templates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Templates</h2>
          <div className="grid grid-cols-3 gap-2">
            {templates.filter((t) => enabledIds !== null && enabledIds.includes(t.id)).map((tmpl) => {
              const done = templateCompletedToday.has(tmpl.id);
              return (
                <button
                  key={tmpl.id}
                  onClick={() => router.push(`/template/${tmpl.id}`)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-2xl border transition-colors ${
                    done
                      ? 'border-success/30 bg-success/5 opacity-60'
                      : 'border-border bg-surface hover:border-primary/50'
                  }`}
                >
                  <span className="text-2xl">{ICONS[tmpl.icon] || '📄'}</span>
                  <span className="text-xs text-text-primary text-center leading-tight">{tmpl.name}</span>
                  {done && <span className="text-xs text-success">Done</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Habits */}
      {activeHabits.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Today&apos;s habits</h2>
          <div className="space-y-1">
            {activeHabits.map((habit) => {
              const isDone = todayCompletions.has(habit.id);
              return (
                <button
                  key={habit.id}
                  onClick={() => toggleCompletion(habit.id, today)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    isDone ? 'bg-success/10' : 'bg-surface hover:bg-surface-elevated'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isDone ? 'bg-success border-success' : 'border-border'
                  }`}>
                    {isDone && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className={`text-sm ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                    {habit.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent entries removed — user can browse in Journal tab */}
    </div>
  );
}
