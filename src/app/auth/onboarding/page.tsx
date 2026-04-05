'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { GuideSelector } from '@/components/GuideSelector';
import { supabase } from '@/lib/supabase';
import { setLanguage, LANGUAGES, type AppLanguage } from '@/lib/language';

interface TemplateOption {
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

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, loading, user } = useAuthStore();
  const [step, setStep] = useState(0);
  const googleName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const [name, setName] = useState(googleName);
  const [guide, setGuide] = useState('ben');
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [selectedLang, setSelectedLang] = useState<AppLanguage>('en-US');
  const [error, setError] = useState('');

  // Fetch available templates
  useEffect(() => {
    supabase.from('templates').select('id, name, icon, description, category').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) {
        setTemplates(data);
        // Pre-select daily templates by default
        const dailyIds = new Set(data.filter((t) => t.category === 'daily').map((t) => t.id));
        setSelectedTemplates(dailyIds);
      }
    });
  }, []);

  const toggleTemplate = (id: string) => {
    const next = new Set(selectedTemplates);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTemplates(next);
  };

  const handleComplete = async () => {
    try {
      setError('');
      await completeOnboarding(name.trim() || 'Friend', '', [], guide);
      // Save selected template IDs to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('enabled_template_ids', JSON.stringify([...selectedTemplates]));
      }
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const handleSelectLang = (lang: AppLanguage) => {
    setSelectedLang(lang);
    setLanguage(lang);
  };

  const steps = [
    // Step 0: Language
    <div key="language" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Choose your language</h2>
      <p className="text-sm text-text-secondary">You can change this later in Settings.</p>
      <div className="space-y-3">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleSelectLang(lang.code)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors ${
              selectedLang === lang.code
                ? 'border-primary bg-primary/10'
                : 'border-border bg-surface hover:bg-surface-elevated'
            }`}
          >
            <span className="text-3xl">{lang.flag}</span>
            <span className="text-base font-medium text-text-primary">{lang.label}</span>
            {selectedLang === lang.code && <span className="ml-auto text-primary text-sm font-bold">{'\u2713'}</span>}
          </button>
        ))}
      </div>
      <button
        onClick={() => setStep(1)}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
      >
        Next
      </button>
    </div>,

    // Step 1: Name
    <div key="name" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">What should we call you?</h2>
      <p className="text-sm text-text-secondary">You can always change this later.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        autoFocus
        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
      />
      <button
        onClick={() => name.trim() && setStep(2)}
        disabled={!name.trim()}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-40"
      >
        Next
      </button>
    </div>,

    // Step 2: Pick guide
    <div key="guide" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Choose your guide</h2>
      <p className="text-sm text-text-secondary">Each guide has a different style. You can switch anytime.</p>
      <GuideSelector value={guide} onChange={setGuide} />
      <button
        onClick={() => setStep(3)}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
      >
        Next
      </button>
    </div>,

    // Step 3: Pick templates
    <div key="templates" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Pick your templates</h2>
      <p className="text-sm text-text-secondary">These show on your home screen. Tap to toggle.</p>
      <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
        {templates.map((tmpl) => {
          const isSelected = selectedTemplates.has(tmpl.id);
          return (
            <button
              key={tmpl.id}
              onClick={() => toggleTemplate(tmpl.id)}
              className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-surface hover:bg-surface-elevated'
              }`}
            >
              <span className="text-xl">{ICONS[tmpl.icon] || '\uD83D\uDCC4'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{tmpl.name}</p>
                <p className="text-xs text-text-tertiary capitalize">{tmpl.category}</p>
              </div>
              {isSelected && <span className="text-primary text-sm">{'\u2713'}</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button
        onClick={handleComplete}
        disabled={loading}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
      >
        {loading ? 'Setting up...' : 'Start Journaling'}
      </button>
    </div>,
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-bg">
      <div className="max-w-sm w-full">
        <div className="flex gap-1 mb-8">
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}
