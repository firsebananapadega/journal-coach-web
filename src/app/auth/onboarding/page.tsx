'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { GuideSelector } from '@/components/GuideSelector';

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, loading } = useAuthStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [anchor, setAnchor] = useState('');
  const [intentions, setIntentions] = useState(['', '', '']);
  const [guide, setGuide] = useState('ben');
  const [error, setError] = useState('');

  const handleComplete = async () => {
    try {
      setError('');
      const validIntentions = intentions.filter((i) => i.trim());
      await completeOnboarding(name, anchor, validIntentions, guide);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const steps = [
    // Step 0: Name
    <div key="name" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">What should we call you?</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
      />
      <button
        onClick={() => name.trim() && setStep(1)}
        disabled={!name.trim()}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-40"
      >
        Continue
      </button>
    </div>,

    // Step 1: Anchor moment
    <div key="anchor" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">When do you want to journal?</h2>
      <p className="text-sm text-text-secondary">Pick a moment in your day to anchor this habit.</p>
      {['After morning coffee', 'During lunch break', 'Before bed', 'After my commute'].map((option) => (
        <button
          key={option}
          onClick={() => { setAnchor(option); setStep(2); }}
          className={`w-full py-3 px-4 text-left rounded-xl border transition-colors ${
            anchor === option ? 'border-primary bg-surface-elevated' : 'border-border bg-surface hover:bg-surface-elevated'
          }`}
        >
          <span className="text-text-primary text-sm">{option}</span>
        </button>
      ))}
    </div>,

    // Step 2: Intentions
    <div key="intentions" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Set 3 intentions</h2>
      <p className="text-sm text-text-secondary">How do you want to show up? (Not goals — directions.)</p>
      {intentions.map((intention, i) => (
        <input
          key={i}
          value={intention}
          onChange={(e) => {
            const updated = [...intentions];
            updated[i] = e.target.value;
            setIntentions(updated);
          }}
          placeholder={['e.g. Be more present', 'e.g. Listen before reacting', 'e.g. Trust my own pace'][i]}
          className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
        />
      ))}
      <button
        onClick={() => setStep(3)}
        className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors"
      >
        Continue
      </button>
    </div>,

    // Step 3: Pick guide
    <div key="guide" className="space-y-4">
      <h2 className="text-xl font-bold text-text-primary">Choose your guide</h2>
      <p className="text-sm text-text-secondary">They&apos;ll ask the questions. You can change this anytime.</p>
      <GuideSelector value={guide} onChange={setGuide} />
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
