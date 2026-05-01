'use client';

// /journal — simple writing surface.
//
// Per user feedback (2026-04-23): this should NOT show a feed of
// past entries. The center Journal pill opens a clean page — mic,
// save, and borderless textarea that feels like writing on paper.
// History lives on /notebooks and /notebooks/[slug].
//
// 2026-04-24: tap-Save opens a bottom sheet with a detected-notebook
// chip (overridable) rather than silently defaulting to Journal.
// Action bar is position:fixed so the iOS soft keyboard can't push
// it off-screen.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import SaveEntrySheet from '@/components/journal/SaveEntrySheet';
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

  const [content, setContent] = useState('');
  const [saveSheetOpen, setSaveSheetOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startTime = useRef(Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Auto-start mic on /journal mount. Default OFF (per user) — the
  // writing surface should open keyboard-first; voice is opt-in via
  // the gear toggle. Stored separately from /voice's preference so
  // the two surfaces stay independent.
  const [autoMic, setAutoMic] = useState<boolean>(false);

  const { isListening, toggle, micButtonProps } = useSelectionAwareMic({
    textareaRef,
    value: content,
    onChange: setContent,
    autoRestart: true,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem('journal.autoMic');
    // Default OFF — only enable when explicitly persisted as '1'.
    if (raw === '1') setAutoMic(true);
  }, []);

  const persistAutoMic = (next: boolean) => {
    setAutoMic(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('journal.autoMic', next ? '1' : '0');
    }
  };

  useEffect(() => {
    if (autoMic) {
      // Brief delay so the page has painted before the permission
      // prompt could fire — keeps the UI from flashing.
      const id = window.setTimeout(() => {
        void toggle();
      }, 120);
      return () => window.clearTimeout(id);
    }
    // Default path: keyboard-first, focus the textarea.
    textareaRef.current?.focus();
    // Run-once on mount; don't re-trigger when autoMic toggles
    // mid-session — that would auto-start the mic the moment the
    // user flips the toggle in settings, which feels surprising.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-grow textarea so the page scrolls as the entry grows.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, ta.clientHeight)}px`;
  }, [content]);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const canSave = content.trim().length > 0;

  const handleSavePressed = () => {
    if (!canSave) return;
    if (isListening) toggle();
    setSaveSheetOpen(true);
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
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-10 h-10 -mr-2 flex items-center justify-center text-text-tertiary hover:text-text-secondary"
          aria-label="Journal settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Writing surface — borderless textarea, feels like paper.
          Extra pb to clear the fixed action bar below (~120px). */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 pt-4 pb-[130px]">
        <div className="max-w-md mx-auto">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('journalWrite.placeholder')}
            className="
              w-full
              bg-transparent
              text-[19px] leading-relaxed text-text-primary
              placeholder:text-text-tertiary/60
              border-0 outline-none focus:outline-none focus:ring-0
              resize-none tracking-[0.005em]
            "
            // Fill the visible area between the page header (~70px)
            // and the fixed action bar (~130px from pb above) so the
            // textarea sits flush above Save without leaving an empty
            // strip below it. Matches the BookPage composer's pattern.
            style={{ lineHeight: 1.65, minHeight: 'calc(100dvh - 240px)' }}
          />
          {wordCount > 0 && (
            <p className="mt-4 text-[10px] text-text-tertiary tracking-wider uppercase">
              {wordCount} {t('common.words')}
            </p>
          )}
        </div>
      </div>

      {/* Action bar — position: fixed so iOS keyboard can't hide it.
          The Visual Viewport stays above the keyboard, and iOS 16+
          tracks fixed-bottom elements to that. */}
      <div
        className="fixed bottom-0 inset-x-0 z-20 px-6 pt-3 bg-gradient-to-t from-bg via-bg/95 to-transparent"
        style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
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
            onClick={handleSavePressed}
            disabled={!canSave}
            className="
              flex-1 py-3.5 rounded-2xl font-semibold text-white shadow-warm-md
              bg-primary hover:bg-primary-dark transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {t('journalWrite.save')}
          </motion.button>
        </div>
      </div>

      <SaveEntrySheet
        open={saveSheetOpen}
        content={content}
        wordCount={wordCount}
        durationSeconds={Math.round((Date.now() - startTime.current) / 1000)}
        onClose={() => setSaveSheetOpen(false)}
        onSaved={() => {
          setSaveSheetOpen(false);
          window.setTimeout(
            () => router.replace('/home'),
            prefersReducedMotion ? 150 : 400,
          );
        }}
      />

      {/* Journal settings sheet — opened by the gear in the header.
          One toggle for now: auto-start microphone. Persists to
          localStorage; takes effect on the NEXT open of /journal so
          flipping the toggle mid-session doesn't surprise-start
          the mic. */}
      {settingsOpen && (
        <>
          <motion.div
            initial={prefersReducedMotion ? undefined : { opacity: 0 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setSettingsOpen(false)}
          />
          <motion.div
            initial={prefersReducedMotion ? undefined : { y: '100%' }}
            animate={prefersReducedMotion ? undefined : { y: 0 }}
            exit={prefersReducedMotion ? undefined : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-3xl shadow-warm-xl"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="px-5 py-3 flex items-center justify-between border-b border-border">
              <h2 className="text-base font-bold text-text-primary">Journal settings</h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-text-secondary text-lg w-9 h-9 flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    Auto-start microphone
                  </p>
                  <p className="text-xs text-text-tertiary leading-snug mt-0.5">
                    {autoMic
                      ? 'Mic starts listening as soon as you open Journal.'
                      : 'Journal opens with the keyboard ready to type.'}
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={autoMic}
                  onClick={() => persistAutoMic(!autoMic)}
                  className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                    autoMic ? 'bg-primary' : 'bg-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                      autoMic ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
