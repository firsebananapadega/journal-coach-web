'use client';

import { useState } from 'react';
import { useJournalStore, type JournalEntry } from '@/stores/journalStore';
import { toLocalDateStr, entryDateStr } from '@/lib/dateUtils';
import { t } from '@/lib/translations';

interface Props {
  entries: JournalEntry[];
}

export default function DailyPulseCard({ entries }: Props) {
  const createEntry = useJournalStore((s) => s.createEntry);
  const [alive, setAlive] = useState('');
  const [drained, setDrained] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const today = toLocalDateStr(new Date());
  const todayPulse = entries.find(
    (e) => e.entry_type === 'pulse' && entryDateStr(e.created_at) === today
  );

  const handleSubmit = async () => {
    if (!alive.trim() && !drained.trim()) return;
    setSubmitting(true);
    try {
      const contentText = `Alive: ${alive.trim()}\n\nDrained: ${drained.trim()}`;
      const wordCount = contentText.split(/\s+/).filter(Boolean).length;
      await createEntry({
        entry_type: 'pulse',
        content_text: contentText,
        title: 'Daily Pulse',
        metadata: { alive: alive.trim(), drained: drained.trim() },
        word_count: wordCount,
      });
      setAlive('');
      setDrained('');
    } catch (err) {
      console.error('Failed to save pulse:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Completed state — today's pulse already saved
  if (todayPulse) {
    const meta = todayPulse.metadata as { alive?: string; drained?: string } | null;
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left bg-surface rounded-2xl border border-border p-4 transition-colors hover:border-primary/30"
        data-testid="pulse-completed"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <span className="font-semibold text-text-primary text-sm">{t('pulse.saved')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-success">✓</span>
            <span className="text-xs text-text-tertiary">
              {expanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {expanded && meta && (
          <div className="mt-3 space-y-2 pt-3 border-t border-border">
            {meta.alive && (
              <div>
                <span className="text-xs font-medium text-primary">{t('pulse.aliveLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.alive}</p>
              </div>
            )}
            {meta.drained && (
              <div>
                <span className="text-xs font-medium text-accent">{t('pulse.drainedLabel')}</span>
                <p className="text-sm text-text-primary mt-0.5">{meta.drained}</p>
              </div>
            )}
          </div>
        )}
      </button>
    );
  }

  // Input state — no pulse today yet
  return (
    <div className="bg-surface rounded-2xl border border-border p-4 space-y-3" data-testid="pulse-card">
      <div className="flex items-center gap-2">
        <span className="text-lg">✨</span>
        <span className="text-sm font-semibold text-text-primary">{t('pulse.title')}</span>
      </div>

      <textarea
        value={alive}
        onChange={(e) => setAlive(e.target.value)}
        placeholder={t('pulse.alive')}
        rows={2}
        className="w-full px-3 py-2.5 bg-bg border border-border rounded-xl text-text-primary text-sm resize-none outline-none focus:border-primary placeholder:text-text-tertiary"
        data-testid="pulse-alive"
      />

      <textarea
        value={drained}
        onChange={(e) => setDrained(e.target.value)}
        placeholder={t('pulse.drained')}
        rows={2}
        className="w-full px-3 py-2.5 bg-bg border border-border rounded-xl text-text-primary text-sm resize-none outline-none focus:border-primary placeholder:text-text-tertiary"
        data-testid="pulse-drained"
      />

      <button
        onClick={handleSubmit}
        disabled={(!alive.trim() && !drained.trim()) || submitting}
        className="w-full py-2.5 bg-primary text-white font-medium rounded-xl disabled:opacity-40 transition-opacity"
        data-testid="pulse-submit"
      >
        {submitting ? '...' : t('pulse.save')}
      </button>
    </div>
  );
}
