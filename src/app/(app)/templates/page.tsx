'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ICONS: Record<string, string> = {
  moon: '🌙',
  sun: '☀️',
  heart: '❤️',
  face: '😊',
  cloud: '☁️',
  calendar: '📅',
  target: '🎯',
  document: '📄',
};

const CATEGORY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  anytime: 'Anytime',
  activity: 'Guided Activities',
  processing: 'Processing',
  growth: 'Growth',
  planning: 'Planning',
  mindset: 'Mindset',
  inner_work: 'Inner Work',
  science: 'Science',
};

interface TemplateOption {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load saved preferences
    const stored = localStorage.getItem('enabled_template_ids');
    if (stored) setEnabledIds(JSON.parse(stored));

    // Fetch templates
    supabase
      .from('templates')
      .select('id, name, icon, description, category')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTemplates(data);
        setLoading(false);
      });
  }, []);

  const toggleTemplate = (id: string) => {
    const next = enabledIds.includes(id)
      ? enabledIds.filter((i) => i !== id)
      : [...enabledIds, id];
    setEnabledIds(next);
    localStorage.setItem('enabled_template_ids', JSON.stringify(next));
  };

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/settings')}
            className="text-primary text-sm font-medium flex items-center gap-1"
          >
            <span className="text-lg">&#8249;</span> Back
          </button>
          <h1 className="text-lg font-bold text-text-primary">Manage Templates</h1>
          <button
            onClick={() => router.push('/settings')}
            className="text-primary text-sm font-medium"
          >
            Done
          </button>
        </div>
        <div className="max-w-lg mx-auto px-5 pb-3">
          <p className="text-sm text-text-secondary">
            Toggle templates to show on your home screen
          </p>
        </div>
      </div>

      {/* Template list grouped by category */}
      <div className="flex-1 max-w-lg mx-auto w-full px-5 py-4 space-y-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-pulse text-text-tertiary text-sm">Loading templates...</div>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-text-tertiary text-sm">No templates available yet.</p>
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat} className="space-y-2">
              <h2 className="text-xs font-bold text-primary uppercase tracking-wider px-1">
                {CATEGORY_LABELS[cat] || cat}
              </h2>
              <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {templates
                  .filter((t) => t.category === cat)
                  .map((tmpl) => {
                    const isEnabled = enabledIds.includes(tmpl.id);
                    return (
                      <div
                        key={tmpl.id}
                        className="flex items-center gap-4 px-4 py-3.5"
                      >
                        <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center text-xl flex-shrink-0">
                          {ICONS[tmpl.icon] || '📄'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">
                            {tmpl.name}
                          </p>
                          <p className="text-xs text-text-tertiary truncate mt-0.5">
                            {tmpl.description}
                          </p>
                        </div>
                        <button
                          onClick={() => toggleTemplate(tmpl.id)}
                          className={`ml-2 w-12 h-7 rounded-full transition-colors relative flex-shrink-0 ${
                            isEnabled ? 'bg-primary' : 'bg-border'
                          }`}
                        >
                          <span
                            className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                              isEnabled ? 'left-[26px]' : 'left-1'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom summary */}
      <div className="sticky bottom-0 bg-bg/80 backdrop-blur-xl border-t border-border">
        <div className="max-w-lg mx-auto px-5 py-4">
          <p className="text-center text-sm text-text-secondary">
            {enabledIds.length} template{enabledIds.length !== 1 ? 's' : ''} active on home screen
          </p>
        </div>
      </div>
    </div>
  );
}
