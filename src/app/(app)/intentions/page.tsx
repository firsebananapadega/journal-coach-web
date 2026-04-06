'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import {
  getLocalizedIntentions,
  getLocalizedIntentionCategories,
  type IntentionCategory,
} from '@/lib/presetIntentions';
import { t } from '@/lib/translations';

const CATEGORY_COLORS: Record<IntentionCategory, string> = {
  presence: 'bg-emerald-500/20',
  body: 'bg-orange-500/20',
  mind: 'bg-blue-500/20',
  connection: 'bg-pink-500/20',
  growth: 'bg-amber-500/20',
  purpose: 'bg-purple-500/20',
};

export default function IntentionGalleryPage() {
  const router = useRouter();
  const { profile, updateProfile } = useAuthStore();
  const [activeCategory, setActiveCategory] = useState<IntentionCategory>('presence');
  const [customInput, setCustomInput] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const intentions = profile?.intentions || [];

  const addPresetIntention = async (title: string) => {
    if (intentions.includes(title)) return;
    setAdding(title);
    try {
      await updateProfile({ intentions: [...intentions, title] });
    } finally {
      setAdding(null);
    }
  };

  const addCustomIntention = async () => {
    if (!customInput.trim()) return;
    setAdding('__custom__');
    try {
      await updateProfile({ intentions: [...intentions, customInput.trim()] });
      setCustomInput('');
    } finally {
      setAdding(null);
    }
  };

  const filteredPresets = getLocalizedIntentions().filter((p) => p.category === activeCategory);

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
          <h1 className="text-lg font-bold text-text-primary">{t('intentions.title')}</h1>
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
            {getLocalizedIntentionCategories().map((cat) => (
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

      {/* Intention list */}
      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-4 space-y-3 overflow-y-auto">
        {filteredPresets.map((preset) => {
          const isAdded = intentions.includes(preset.title);
          const isAdding = adding === preset.title;
          return (
            <div
              key={preset.title}
              className="bg-surface rounded-2xl border border-border p-4 flex items-center gap-4"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl flex-shrink-0 ${CATEGORY_COLORS[preset.category]}`}
              >
                {preset.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-text-primary">{preset.title}</p>
                <p className="text-sm text-text-tertiary mt-0.5 leading-snug">
                  {preset.description}
                </p>
              </div>
              <button
                onClick={() => addPresetIntention(preset.title)}
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

      {/* Bottom area: Add custom intention */}
      <div className="sticky bottom-0 bg-bg/80 backdrop-blur-xl border-t border-border">
        <div className="max-w-lg mx-auto px-5 py-4">
          <div className="flex gap-2">
            <input
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomIntention()}
              placeholder={t('intentions.placeholder')}
              className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text-primary outline-none focus:border-primary transition-colors"
            />
            <button
              onClick={addCustomIntention}
              disabled={!customInput.trim() || adding === '__custom__'}
              className="px-5 py-3 bg-primary text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-opacity"
            >
              {adding === '__custom__' ? '...' : t('common.add')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
