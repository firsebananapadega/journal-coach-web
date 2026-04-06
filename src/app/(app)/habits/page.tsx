'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHabitStore } from '@/stores/habitStore';
import { getLocalizedHabits, getLocalizedHabitCategories, type HabitCategory, type PresetHabit } from '@/lib/presetHabits';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';

const CATEGORY_COLORS: Record<HabitCategory, string> = {
  suggested: 'bg-amber-500/20',
  life: 'bg-blue-500/20',
  health: 'bg-emerald-500/20',
  sports: 'bg-orange-500/20',
  mindset: 'bg-purple-500/20',
};

export default function HabitGalleryPage() {
  const router = useRouter();
  const { habits, fetchHabits, createHabit } = useHabitStore();
  const [activeCategory, setActiveCategory] = useState<HabitCategory>('suggested');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTime, setNewTime] = useState<'morning' | 'afternoon' | 'evening' | 'anytime'>('morning');
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  const habitNames = habits.filter((h) => h.is_active).map((h) => h.name.toLowerCase());

  const addPresetHabit = async (preset: PresetHabit) => {
    if (habitNames.includes(preset.name.toLowerCase())) return;
    setAdding(preset.name);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await createHabit({
        user_id: user.id,
        name: preset.name,
        description: preset.description,
        cue: preset.cue,
        routine: preset.routine,
        reward: preset.reward,
        frequency: 'daily',
        custom_days: [],
        time_of_day: preset.time_of_day,
        stack_after_habit_id: null,
        sort_order: habits.length,
        is_active: true,
      });
    } finally {
      setAdding(null);
    }
  };

  const handleAddCustom = async () => {
    if (!newName.trim()) return;
    setAdding('__custom__');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      setShowCustomForm(false);
    } finally {
      setAdding(null);
    }
  };

  const filteredPresets = getLocalizedHabits().filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/settings')}
            className="text-primary text-sm font-medium flex items-center gap-1"
          >
            <span className="text-lg">&#8249;</span> {t('common.back')}
          </button>
          <h1 className="text-lg font-bold text-text-primary">{t('habits.title')}</h1>
          <button
            onClick={() => router.push('/settings')}
            className="text-primary text-sm font-medium"
          >
            {t('common.done')}
          </button>
        </div>

        {/* Category tabs */}
        <div className="max-w-lg mx-auto px-5 pb-3">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {getLocalizedHabitCategories().map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.key
                    ? 'bg-primary text-white shadow-lg shadow-primary/25'
                    : 'bg-surface text-text-secondary hover:text-text-primary border border-border'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Habit list */}
      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-4 space-y-3 overflow-y-auto">
        {filteredPresets.map((preset) => {
          const isAdded = habitNames.includes(preset.name.toLowerCase());
          const isAdding = adding === preset.name;
          return (
            <div
              key={preset.name}
              className="bg-surface rounded-2xl border border-border p-4 flex items-center gap-4"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${CATEGORY_COLORS[preset.category]}`}
              >
                {preset.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-text-primary">{preset.name}</p>
                <p className="text-sm text-text-tertiary mt-0.5 leading-snug">
                  {preset.description}
                </p>
              </div>
              <button
                onClick={() => addPresetHabit(preset)}
                disabled={isAdded || isAdding}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                  isAdded
                    ? 'bg-success/20 text-success'
                    : isAdding
                      ? 'bg-primary/10 text-primary animate-pulse'
                      : 'bg-primary/10 text-primary hover:bg-primary/20 active:scale-95'
                }`}
              >
                {isAdded ? '✓' : '+'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom area: Create custom habit */}
      <div className="sticky bottom-0 bg-bg/80 backdrop-blur-xl border-t border-border">
        <div className="max-w-lg mx-auto px-5 py-4">
          {showCustomForm ? (
            <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-text-primary">{t('habits.createNewTitle')}</p>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                placeholder={t('habits.habitName')}
                className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary transition-colors"
                autoFocus
              />
              <div className="flex gap-2">
                {(['morning', 'afternoon', 'evening', 'anytime'] as const).map((tod) => (
                  <button
                    key={tod}
                    onClick={() => setNewTime(tod)}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                      newTime === tod
                        ? 'bg-primary text-white'
                        : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tod === 'morning' ? t('common.morning') : tod === 'afternoon' ? t('common.afternoon') : tod === 'evening' ? t('common.evening') : t('common.anytime')}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="flex-1 py-2.5 bg-surface-elevated text-text-secondary rounded-xl text-sm font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleAddCustom}
                  disabled={!newName.trim() || adding === '__custom__'}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40"
                >
                  {adding === '__custom__' ? t('habits.adding') : t('habits.addHabit')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomForm(true)}
              className="w-full py-3.5 bg-surface border border-border text-primary font-medium rounded-2xl hover:bg-surface-elevated transition-colors text-sm"
            >
              {t('habits.createNew')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
