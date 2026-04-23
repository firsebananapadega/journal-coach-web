'use client';

// /ask — "Ask Jane": a persona-less Gemini pipe. Bubble lives on the
// Pulse tab. Jane has no mascot, no greeting pattern, no memory
// across sessions — just a direct pipe to Gemini for quick questions.
//
// Deliberately kept simple and ephemeral for Sprint 1: closing the
// page clears the conversation. If we want persistence later we'll
// treat it as a separate entry type.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { callGemini } from '@/lib/geminiClient';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

const JANE_SYSTEM = `You are Jane, a concise and helpful assistant.
Answer the user's question directly and practically. No preamble,
no roleplay, no "As an AI". Plain paragraphs, no markdown headers.
If the question is ambiguous, ask one short clarifying question.
Keep answers short unless the user asks for depth.`;

interface Turn {
  role: 'user' | 'jane';
  text: string;
}

function buildPrompt(turns: Turn[]): string {
  const history = turns
    .map((t) => (t.role === 'user' ? `User: ${t.text}` : `Jane: ${t.text}`))
    .join('\n\n');
  return `${JANE_SYSTEM}\n\n${history}\n\nJane:`;
}

export default function AskPage() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const { isListening, micButtonProps } = useSelectionAwareMic({
    textareaRef,
    value: draft,
    onChange: setDraft,
    autoRestart: false,
  });

  // Auto-focus input on mount.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Scroll to newest message when a turn lands.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [turns, thinking]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || thinking) return;
    setError(null);
    const nextTurns: Turn[] = [...turns, { role: 'user' as const, text }];
    setTurns(nextTurns);
    setDraft('');
    setThinking(true);
    try {
      const reply = await callGemini('gemini-2.5-flash', buildPrompt(nextTurns));
      setTurns((prev) => [...prev, { role: 'jane', text: reply.trim() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, turns]);

  const canSend = draft.trim().length > 0 && !thinking;

  return (
    <div className="relative flex flex-col h-[100dvh] overflow-hidden bg-bg">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: 'var(--theme-primary-glow)' }}
      />

      {/* Top bar */}
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
        <span className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary uppercase tracking-widest">
          <span aria-hidden>✨</span>
          {t('ask.title')}
        </span>
        <span className="w-10" />
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-4"
      >
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {turns.length === 0 && !thinking && (
            <div className="mt-20 text-center text-sm text-text-tertiary">
              {t('ask.placeholder')}
            </div>
          )}

          {turns.map((turn, i) => (
            <motion.div
              key={i}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 6 }}
              animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  turn.role === 'user'
                    ? 'bg-primary text-white rounded-br-md'
                    : 'bg-surface-elevated text-text-primary border border-border rounded-bl-md'
                }`}
              >
                {turn.text}
              </div>
            </motion.div>
          ))}

          <AnimatePresence>
            {thinking && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-start"
              >
                <div className="bg-surface-elevated border border-border rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="block w-1.5 h-1.5 rounded-full bg-text-tertiary"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          delay: i * 0.15,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="text-xs text-error text-center mt-1">{error}</div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div
        className="relative z-10 shrink-0 px-5 pt-2 bg-gradient-to-t from-bg via-bg to-transparent"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto flex items-end gap-2">
          <motion.button
            type="button"
            {...micButtonProps}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
            className={`
              shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-warm-md
              ${isListening ? 'bg-error text-white' : 'bg-surface-elevated border border-border text-primary'}
              transition-colors
            `}
            aria-pressed={isListening}
            aria-label={isListening ? t('journalWrite.micStop') : t('journalWrite.micStart')}
          >
            {isListening ? (
              <span className="block w-2.5 h-2.5 rounded-sm bg-white" aria-hidden />
            ) : (
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </motion.button>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && canSend) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('ask.prompt')}
            rows={1}
            className="
              flex-1 resize-none
              bg-surface-elevated border border-border rounded-2xl
              px-4 py-2.5 text-sm text-text-primary
              focus:border-primary outline-none
              max-h-32
            "
          />

          <motion.button
            type="button"
            whileTap={prefersReducedMotion || !canSend ? undefined : { scale: 0.94 }}
            onClick={send}
            disabled={!canSend}
            className="
              shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-warm-md
              bg-primary text-white hover:bg-primary-dark transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
            aria-label={t('common.send')}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
