'use client';

// /journal — simple writing surface.
//
// Per user feedback (2026-04-23): this should NOT show a feed of
// past entries. The center Journal pill opens a clean page — mic,
// save, and borderless textarea that feels like writing on paper.
// History lives on /notebooks and /notebooks/[slug].
//
// Entries auto-assign to the user's Journal system notebook via
// journalStore.createEntry's default lookup.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useJournalStore } from '@/stores/journalStore';
import { useUiStore } from '@/stores/uiStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { t } from '@/lib/translations';
import { getLocale } from '@/lib/language';
import { prefersReducedMotion } from '@/lib/motionVariants';

function formatDayHeader(): string {
  const locale = getLocale() === 'es' ? 'es-MX' : 'en-US';
  return new Date().toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function JournalWritingPage() {
  const router = useRouter();
  const createEntry = useJournalStore((s) => s.createEntry);
  const celebrate = useUiStore((s) => s.celebrate);
  const showToast = useUiStore((s) => s.showToast);

  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startTime = useRef(Date.now());

  const { isListening, toggle, micButtonProps } = useSelectionAwareMic({
    textareaRef,
    value: content,
    onChange: setContent,
    autoRestart: true,
  });

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-grow textarea so the page scrolls as the entry grows.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, ta.clientHeight)}px`;
  }, [content]);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  // Save is unblocked the moment there's content. journalStore will
  // resolve the default Journal notebook server-side — we don't
  // gate on a client-side notebook fetch.
  const canSave = content.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    // Belt-and-braces: stop the mic first so the save cue audio plays
    // and `content` reflects the final transcript.
    if (isListening) toggle();
    setSaving(true);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    try {
      await createEntry({
        entry_type: 'freeform',
        content_text: content.trim(),
        title: null,
        duration_seconds: duration,
        word_count: wordCount,
      });
      celebrate();
      window.setTimeout(
        () => router.replace('/home'),
        prefersReducedMotion ? 150 : 700,
      );
    } catch (err) {
      setSaving(false);
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    }
  };

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vmin] h-[80vmin] rounded-full blur-3xl pointer-events-none opacity-60"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Top bar — date + close */}
      <div
        className="relative z-10 shrink-0 flex items-center justify-between px-5 pt-3 pb-2"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-text-tertiary hover:text-text-secondary"
          aria-label={t('common.back')}
        >
          ← {t('common.back')}
        </button>
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-widest">
          {formatDayHeader()}
        </span>
        <span className="w-10" />
      </div>

      {/* Writing surface — borderless textarea, feels like paper */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-4 pb-6">
        <div className="max-w-md mx-auto">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('journalWrite.placeholder')}
            className="
              w-full min-h-[40vh]
              bg-transparent
              text-base leading-relaxed text-text-primary
              placeholder:text-text-tertiary/60
              border-0 outline-none focus:outline-none focus:ring-0
              resize-none
            "
            style={{ lineHeight: 1.7 }}
          />
          {wordCount > 0 && (
            <p className="mt-4 text-[10px] text-text-tertiary tracking-wider uppercase">
              {wordCount} {t('common.words')}
            </p>
          )}
        </div>
      </div>

      {/* Action bar — mic + save */}
      <div
        className="relative z-10 shrink-0 px-6 pt-2 bg-gradient-to-t from-bg via-bg to-transparent"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <motion.button
            type="button"
            {...micButtonProps}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
            className={`
              relative flex items-center justify-center shrink-0
              w-14 h-14 rounded-full shadow-warm-md
              ${isListening ? 'bg-error text-white' : 'bg-surface-elevated border border-border text-primary'}
              transition-colors
            `}
            aria-pressed={isListening}
            aria-label={isListening ? t('journalWrite.micStop') : t('journalWrite.micStart')}
          >
            {isListening ? (
              <span className="block w-3 h-3 rounded-sm bg-white" aria-hidden />
            ) : (
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
            {isListening && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-error"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1.35, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </motion.button>

          <motion.button
            type="button"
            whileTap={prefersReducedMotion || !canSave ? undefined : { scale: 0.97 }}
            onClick={handleSave}
            disabled={!canSave}
            className="
              flex-1 py-3.5 rounded-2xl font-semibold text-white shadow-warm-md
              bg-primary hover:bg-primary-dark transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {saving ? t('common.saving') : t('journalWrite.save')}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
