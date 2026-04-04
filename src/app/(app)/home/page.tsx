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
  const [enabledIds, setEnabledIds] = useState<string[] | null>(null);

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
    // Load template preferences
    const stored = typeof window !== 'undefined' ? localStorage.getItem('enabled_template_ids') : null;
    const ids = stored ? JSON.parse(stored) as string[] : null;
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

      {/* Guided session card */}
      <button
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
      </button>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push('/voice')}
          className="flex items-center gap-3 p-4 bg-surface rounded-2xl border border-border hover:border-primary/50 transition-colors"
        >
          <span className="text-2xl">🎙️</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">Voice Entry</p>
            <p className="text-xs text-text-secondary">Just talk</p>
          </div>
        </button>
        <button
          onClick={() => router.push('/write')}
          className="flex items-center gap-3 p-4 bg-surface rounded-2xl border border-border hover:border-primary/50 transition-colors"
        >
          <span className="text-2xl">✏️</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">Free Write</p>
            <p className="text-xs text-text-secondary">Type it out</p>
          </div>
        </button>
      </div>

      {/* Templates — show only enabled ones, or all if no preferences saved */}
      {templates.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Templates</h2>
          <div className="grid grid-cols-3 gap-2">
            {templates.filter((t) => enabledIds === null || enabledIds.includes(t.id)).map((tmpl) => {
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

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Recent</h2>
          <div className="space-y-2">
            {entries.slice(0, 3).map((entry) => (
              <button
                key={entry.id}
                onClick={() => router.push(`/entry/${entry.id}`)}
                className="w-full text-left p-3 bg-surface rounded-xl border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-text-tertiary">
                    {new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  {entry.mood_label && (
                    <span className="text-xs text-text-secondary capitalize">· {entry.mood_label}</span>
                  )}
                  <span className="text-xs text-text-tertiary capitalize">· {entry.entry_type}</span>
                </div>
                <p className="text-sm text-text-primary line-clamp-2">
                  {entry.content_text?.substring(0, 120) || 'No content'}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
