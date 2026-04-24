'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useJournalStore } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { MoodSelector } from '@/components/MoodSelector';
import { t } from '@/lib/translations';

export default function FreeWritePage() {
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const showToast = useUiStore((s) => s.showToast);
  const [content, setContent] = useState('');
  const [moodScore, setMoodScore] = useState<number | null>(null);
  const [moodLabel, setMoodLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startTime = useRef(Date.now());

  useEffect(() => {
    textareaRef.current?.focus();
    startTime.current = Date.now();
  }, []);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    try {
      await createEntry({
        entry_type: 'freeform',
        content_text: content,
        title: `Free write — ${new Date().toLocaleDateString()}`,
        mood_score: moodScore,
        mood_label: moodLabel,
        duration_seconds: duration,
        word_count: wordCount,
      });
      showToast(t('write.saved'));
      router.push('/home');
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-bg">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
        <button onClick={() => router.push('/home')} className="text-text-secondary text-lg">✕</button>
        <span className="text-sm font-semibold text-text-primary">{t('write.title')}</span>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('write.placeholder')}
          className="w-full bg-transparent text-text-primary text-[15px] leading-relaxed resize-none outline-none min-h-[300px] placeholder:text-text-tertiary"
        />

        {content.trim() && (
          <>
            <MoodSelector value={moodScore} onChange={(score, label) => { setMoodScore(score); setMoodLabel(label); }} />
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {saving ? t('write.saving') : t('write.save')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
