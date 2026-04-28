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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { callGemini } from '@/lib/geminiClient';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';
import JaneMascot from '@/components/mascot/JaneMascot';

// Jane's system prompt. Deliberately pushy about Markdown because the
// previous "plain paragraphs, no markdown headers" rule produced wall-
// of-text answers for questions that clearly asked for structure
// ("compare these 4 cities"). Gemini 2.5 Flash honors formatting
// instructions well when they're explicit.
const JANE_SYSTEM = `You are Jane, a warm, direct assistant inside a journaling PWA. Your reply is rendered as GitHub-Flavored Markdown (tables, lists, bold, italic, headings, separators, blockquotes, inline code all work).

# HOW TO REPLY

**Match the shape of the question.**
- A simple factual question → 1–2 sentences, no headings, no lists. Just the answer.
- A how-to or step-by-step request → a numbered list. Bold the verb in each step.
- A comparison or decision question → a Markdown table with one row per option and meaningful columns (cost, time, difficulty, vibe, etc.). Follow the table with a one-line **bottom line** recommendation.
- A brainstorm or enumeration → a bullet list. One idea per bullet, not stacked sub-bullets.
- An emotionally loaded or reflective question → prose, short paragraphs, no headings. Warm tone.
- A long structured request (planning, travel itinerary, project breakdown) → ## H2 section headings, short supporting paragraphs, lists inside each section, a final **Summary** section with the key takeaway.

**Formatting conventions:**
- Use **bold** to mark the single most important phrase per paragraph. Don't bold whole sentences.
- Use *italic* for quoted self-talk, titles, or subtle emphasis.
- Use \`---\` as a separator only between clearly distinct major sections.
- Use \`>\` blockquotes for warnings or caveats.
- Never render raw URLs — always use Markdown links.

**Voice:**
- Direct, specific, warm. No "As an AI language model" disclaimers. No preamble ("Great question!").
- If the request is ambiguous, ask ONE short clarifying question, then stop.
- If you don't know, say so in one line. Don't invent facts or statistics.

**What to avoid:**
- No apologies for your format or length.
- No meta-commentary about what you're about to do ("Let me break this down for you…") — just do it.
- No emoji unless the user's message uses emoji.

Return ONLY the Markdown reply. Nothing else.`;

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

// Map raw Gemini / proxy error strings to human-readable copy for the
// chat UI. The previous behaviour dumped whatever string the server
// returned (e.g. "rate_limited:pro") straight into the feed — ugly and
// confusing. Known codes are translated; everything else falls back to
// a generic friendly line so we never show a machine token.
function humanizeError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw);
  const lower = msg.toLowerCase();
  if (lower.includes('rate_limited') || lower.includes('rate limit') || lower.includes('429')) {
    return 'Jane is getting a lot of questions right now. Wait a minute and try again.';
  }
  if (lower.includes('unauthorized') || lower.includes('401')) {
    return 'Jane couldn’t reach Gemini — sign out and back in, then try again.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'That took too long to come back. Try again when your connection’s steadier.';
  }
  if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('failed to fetch')) {
    return 'Couldn’t reach the network. Check your connection and try again.';
  }
  if (lower.includes('safety') || lower.includes('blocked')) {
    return 'Jane can’t answer that one. Try rephrasing.';
  }
  // Unknown error — swallow the raw text, show a generic line.
  return 'Something went sideways on my end. Try again in a moment.';
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

  // Auto-grow the composer textarea as the user types or dictates.
  // Capped at 40dvh so a long message doesn't eat the whole screen.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxPx = Math.floor(window.innerHeight * 0.4);
    ta.style.height = `${Math.min(ta.scrollHeight, maxPx)}px`;
  }, [draft]);

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
      setError(humanizeError(err));
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
          <span aria-hidden className="inline-flex items-center justify-center w-5 h-5">
            <JaneMascot size="xs" pose="idle" animate={false} />
          </span>
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
            <div className="mt-8 flex flex-col items-center gap-3 text-center text-sm text-text-tertiary">
              <JaneMascot size="lg" pose="wave" glow />
              <p>{t('ask.placeholder')}</p>
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
              {turn.role === 'user' ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary text-white px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.text}
                </div>
              ) : (
                // Jane's replies get full Markdown rendering (tables,
                // headings, lists, bold, italic, blockquotes, GFM).
                // The long selector list styles every element inline
                // so we don't depend on the typography plugin.
                <div
                  className="max-w-[90%] rounded-2xl rounded-bl-md bg-surface-elevated text-text-primary border border-border px-4 py-3 text-[14px] leading-relaxed
                             [&_>_*:first-child]:mt-0 [&_>_*:last-child]:mb-0
                             [&_p]:my-2 [&_p]:leading-relaxed
                             [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1.5
                             [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5
                             [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1
                             [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-1
                             [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-1
                             [&_li]:leading-relaxed
                             [&_strong]:font-semibold
                             [&_em]:italic [&_em]:text-text-secondary
                             [&_hr]:my-3 [&_hr]:border-border
                             [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                             [&_code]:text-xs [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                             [&_pre]:bg-surface [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:text-xs
                             [&_blockquote]:pl-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:text-text-secondary [&_blockquote]:italic [&_blockquote]:my-2
                             [&_table]:w-full [&_table]:text-[13px] [&_table]:border-collapse [&_table]:my-3
                             [&_thead]:border-b [&_thead]:border-border
                             [&_th]:text-left [&_th]:font-semibold [&_th]:px-2 [&_th]:py-1.5 [&_th]:align-top
                             [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:border-t [&_td]:border-border"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {turn.text}
                  </ReactMarkdown>
                </div>
              )}
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
            <div className="mx-auto mt-1 inline-flex items-start gap-2 px-3 py-2 rounded-xl bg-error/10 border border-error/30 text-error text-xs leading-relaxed max-w-[90%]">
              <span aria-hidden className="shrink-0 mt-[1px]">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Composer — stacked layout: full-width textarea on top, mic +
          send row below. Textarea auto-grows with content; mic and send
          sit below so tap targets never compete with the textarea. */}
      <div
        className="relative z-10 shrink-0 px-5 pt-2 bg-gradient-to-t from-bg via-bg to-transparent"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto space-y-2">
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
            rows={3}
            className="
              w-full resize-none
              bg-surface-elevated border border-border rounded-2xl
              px-4 py-3 text-[15px] text-text-primary
              focus:border-primary outline-none
              min-h-[72px]
            "
            style={{ maxHeight: '40dvh' }}
          />

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              {...micButtonProps}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
              className={`
                flex-1 h-12 rounded-2xl flex items-center justify-center gap-2 shadow-warm-sm text-sm font-semibold
                ${isListening ? 'bg-error text-white' : 'bg-surface-elevated border border-border text-primary'}
                transition-colors
              `}
              aria-pressed={isListening}
              aria-label={isListening ? t('journalWrite.micStop') : t('journalWrite.micStart')}
            >
              {isListening ? (
                <>
                  <span className="block w-2.5 h-2.5 rounded-sm bg-white" aria-hidden />
                  <span>{t('template.stopRecording')}</span>
                </>
              ) : (
                <>
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
                  <span>{t('template.tapToSpeak')}</span>
                </>
              )}
            </motion.button>

            <motion.button
              type="button"
              whileTap={prefersReducedMotion || !canSend ? undefined : { scale: 0.94 }}
              onClick={send}
              disabled={!canSend}
              className="
                shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-warm-md
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
    </div>
  );
}
