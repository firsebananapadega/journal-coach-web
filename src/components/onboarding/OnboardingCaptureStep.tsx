'use client';

// Onboarding Screen 3 — voice-capture demo (replaces v4's text-only
// FirstWinStep). The user says or types whatever's on their mind;
// we run the real `classifyCapture` engine over it; preview the
// parsed result inline; on save call `commitCapture` so the user
// finishes onboarding with their inbox / today / groceries already
// populated. This is the "magic moment" — show the AI sorting their
// stuff, not just describe it.
//
// Design notes:
//   • Big textarea (rows=6) for plenty of typing room.
//   • Mic button is BELOW the textarea (TapToSpeakButton). No
//     absolute overlay.
//   • The preview is the WOW moment — it mimics the live Today /
//     Groceries / Journal surfaces (same chips, checkboxes, store
//     headers) so the user reads it as "this is what's about to
//     land in my app." Inline-only; CapturePreviewSheet would be
//     too heavy and bring editing affordances we don't want here.
//   • Skip is allowed but de-emphasized — first-win is the
//     activation event.

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { PriorityTask } from '@/lib/captureEngine';
import { useUiStore } from '@/stores/uiStore';
import { useTaskStore } from '@/stores/taskStore';
import { useGroceryStore } from '@/stores/groceryStore';
import { useListStore } from '@/stores/listStore';
import { useSelectionAwareMic } from '@/hooks/useSelectionAwareMic';
import { isSpeechRecognitionSupported } from '@/lib/speechRecognition';
import { classifyCapture, type CaptureResult } from '@/lib/captureEngine';
import { commitCapture } from '@/lib/captureCommit';
import { toLocalDateStr } from '@/lib/dateUtils';
import { prefersReducedMotion } from '@/lib/motionVariants';
import { t } from '@/lib/translations';
import TapToSpeakButton from '@/components/TapToSpeakButton';
import type { Destination } from '@/lib/captureEngine';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

const MIN_CHARS_TO_CLASSIFY = 10;
const MAX_TASKS_SHOWN = 5;

// Mirror of the live category chip palette in TaskCard.tsx so the
// preview rows look identical to what the user lands on post-Save.
// `other` returns no chip — same as the live behavior.
const CATEGORY_CHIP_CLASS: Record<string, string> = {
  medications: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  errands: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  work: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  home: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  bills: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

// Stagger reveal — sections fade-up first, then rows inside each
// section. The user sees their voice "decompose" into surfaces.
const sectionContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};
const rowContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};
const rowItemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

function TasksIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </svg>
  );
}
function JournalIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SectionShell({
  label,
  labelStyle = 'plain',
  count,
  suffix,
  icon,
  children,
}: {
  label: string;
  labelStyle?: 'plain' | 'store';
  count?: number;
  suffix?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : rowItemVariants}
      className="bg-surface border border-border rounded-2xl p-3.5 space-y-2.5 shadow-warm-sm"
    >
      <div className="flex items-center gap-2">
        <span className="text-primary" aria-hidden>{icon}</span>
        <span
          className={
            labelStyle === 'store'
              ? 'text-[12px] uppercase tracking-wider text-text-primary font-bold'
              : 'text-[11px] uppercase tracking-widest text-text-secondary font-semibold'
          }
        >
          {label}
        </span>
        {typeof count === 'number' && (
          <span className="ml-auto text-[11px] tabular-nums text-text-tertiary font-medium">
            · {count}{suffix ? ` ${suffix}` : ''}
          </span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

function PreviewCheckCircle() {
  return (
    <span
      aria-hidden
      className="w-5 h-5 rounded-full border-2 border-border shrink-0"
    />
  );
}
function PreviewCheckSquare() {
  return (
    <span
      aria-hidden
      className="w-5 h-5 rounded-md border-2 border-border shrink-0"
    />
  );
}

function PreviewTaskRow({ index, task }: { index: number; task: PriorityTask }) {
  const chipClass =
    task.category && task.category !== 'other'
      ? CATEGORY_CHIP_CLASS[task.category]
      : null;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-5 text-right text-[15px] font-bold tabular-nums text-text-tertiary">
        {index + 1}
      </span>
      <PreviewCheckCircle />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] text-text-primary leading-snug">{task.text}</p>
        {(chipClass || (task.when && task.when !== 'today') || task.time) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {chipClass && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${chipClass}`}>
                {task.category}
              </span>
            )}
            {task.when && task.when !== 'today' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-surface-elevated text-text-tertiary">
                {task.when}
              </span>
            )}
            {task.time && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-surface-elevated text-text-tertiary">
                {task.time}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewGroceryRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <PreviewCheckSquare />
      <span className="text-[15px] text-text-primary leading-snug">{name}</span>
    </div>
  );
}

export default function OnboardingCaptureStep({ onComplete, onBack }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const lists = useListStore((s) => s.lists);

  const [text, setText] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  const [fellBack, setFellBack] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && isSpeechRecognitionSupported(),
  );

  const mic = useSelectionAwareMic({
    textareaRef,
    value: text,
    onChange: (next) => setText(next.slice(0, 2000)),
    autoRestart: true,
    onError: (kind) => {
      // Surface mic failures so the user knows the tap landed but the
      // browser blocked the recognizer. Without this the button just
      // looks dead.
      const msg =
        kind === 'permission-denied'
          ? t('onboarding.capture.micDenied')
          : kind === 'unsupported'
          ? t('onboarding.capture.micUnsupported')
          : t('onboarding.capture.micFailed');
      showToast(msg, 'error');
    },
  });

  const canClassify = text.trim().length >= MIN_CHARS_TO_CLASSIFY && !classifying;

  const handleClassify = async () => {
    if (!canClassify) return;
    setClassifying(true);
    setFellBack(false);
    try {
      const tasks = useTaskStore.getState().tasks ?? [];
      const groceries = useGroceryStore.getState().items ?? [];
      const result = await classifyCapture(text.trim(), {
        existingPriorities: tasks.map((t) => t.text).filter(Boolean),
        existingGroceries: groceries.map((g) => g.name).filter(Boolean),
      });
      setPreview(result);
      // The classify function falls back to regex internally; we
      // can't tell from the result alone. Soft-label as fallback if
      // the regex shape is obvious (no notebook_slug + only
      // priorities + groceries). Skipping precise detection — the
      // CapturePreviewSheet does it via state passed from /voice;
      // here we just let the user save whatever came back.
    } catch (err) {
      console.warn('[OnboardingCapture] classify failed', err);
      setFellBack(true);
      showToast(t('onboarding.capture.classifyError'), 'error');
    } finally {
      setClassifying(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      // Default destination for every parsed task: today's inbox.
      // The user can re-route from /today after onboarding if they
      // want a different list. Groceries auto-route to the active
      // list (commitCapture lazily creates one).
      const destinations: Destination[] = preview.priorities.map(() => ({ kind: 'today' as const }));
      await commitCapture(preview, destinations, {
        selectedDate: toLocalDateStr(new Date()),
        lists,
      });
      showToast(t('onboarding.capture.savedToast'), 'success');
      onComplete();
    } catch (err) {
      console.warn('[OnboardingCapture] save failed', err);
      // Still let the user advance — onboarding shouldn't block.
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleTryAgain = () => {
    setPreview(null);
    setFellBack(false);
    textareaRef.current?.focus();
  };

  const summary = useMemo(() => {
    if (!preview) return null;
    const taskCount = preview.priorities.length;
    const groceryCount = preview.groceries.reduce((n, g) => n + g.items.length, 0);
    const journalCount = preview.journal ? 1 : 0;
    const ideasCount = preview.ideas.length;
    return { taskCount, groceryCount, journalCount, ideasCount };
  }, [preview]);

  // Preview render
  if (preview && summary) {
    const empty =
      summary.taskCount === 0 &&
      summary.groceryCount === 0 &&
      summary.journalCount === 0 &&
      summary.ideasCount === 0;

    const taskSuffix = t(
      summary.taskCount === 1
        ? 'onboarding.capture.tasksSuffixOne'
        : 'onboarding.capture.tasksSuffixMany',
    );
    const itemSuffix = (n: number) =>
      t(
        n === 1
          ? 'onboarding.capture.itemsSuffixOne'
          : 'onboarding.capture.itemsSuffixMany',
      );

    const tasksToShow = preview.priorities.slice(0, MAX_TASKS_SHOWN);
    const taskOverflow = preview.priorities.length - tasksToShow.length;

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-text-primary leading-tight">
            {t('onboarding.capture.previewTitle')}
          </h2>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            {empty
              ? t('onboarding.capture.previewEmpty')
              : t('onboarding.capture.previewSubtitle')}
          </p>
        </div>

        {!empty && (
          <motion.div
            className="space-y-3"
            initial={prefersReducedMotion ? undefined : 'hidden'}
            animate={prefersReducedMotion ? undefined : 'show'}
            variants={prefersReducedMotion ? undefined : sectionContainerVariants}
          >
            {summary.taskCount > 0 && (
              <SectionShell
                label={t('onboarding.capture.tasksLabel')}
                count={summary.taskCount}
                suffix={taskSuffix}
                icon={<TasksIcon />}
              >
                <motion.ol
                  className="space-y-1"
                  variants={prefersReducedMotion ? undefined : rowContainerVariants}
                >
                  {tasksToShow.map((p, i) => (
                    <motion.li
                      key={i}
                      variants={prefersReducedMotion ? undefined : rowItemVariants}
                    >
                      <PreviewTaskRow index={i} task={p} />
                    </motion.li>
                  ))}
                  {taskOverflow > 0 && (
                    <li className="text-xs text-text-tertiary pl-12 pt-0.5">
                      + {taskOverflow} {t('onboarding.capture.moreSuffix')}
                    </li>
                  )}
                </motion.ol>
              </SectionShell>
            )}

            {preview.groceries.map((g, gi) => (
              <SectionShell
                key={`g-${gi}`}
                label={g.store}
                labelStyle="store"
                count={g.items.length}
                suffix={itemSuffix(g.items.length)}
                icon={<CartIcon />}
              >
                <motion.ul
                  className="space-y-0.5"
                  variants={prefersReducedMotion ? undefined : rowContainerVariants}
                >
                  {g.items.map((item, ii) => (
                    <motion.li
                      key={ii}
                      variants={prefersReducedMotion ? undefined : rowItemVariants}
                    >
                      <PreviewGroceryRow name={item} />
                    </motion.li>
                  ))}
                </motion.ul>
              </SectionShell>
            ))}

            {summary.journalCount > 0 && preview.journal && (
              <SectionShell
                label={t('onboarding.capture.journalLabel')}
                icon={<JournalIcon />}
              >
                <p className="text-[15px] text-text-primary leading-relaxed italic px-1">
                  &ldquo;{preview.journal.slice(0, 200)}
                  {preview.journal.length > 200 ? '…' : ''}&rdquo;
                </p>
              </SectionShell>
            )}
          </motion.div>
        )}

        {fellBack && (
          <p className="text-xs text-text-tertiary leading-snug">
            {t('onboarding.capture.fellBack')}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleTryAgain}
            disabled={saving}
            className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2 disabled:opacity-50"
          >
            ← {t('onboarding.capture.tryAgain')}
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onComplete}
              disabled={saving}
              className="text-xs font-medium text-text-tertiary hover:text-text-secondary px-2 py-2 disabled:opacity-50"
            >
              {t('common.skip')}
            </button>
            {!empty && (
              <motion.button
                type="button"
                onClick={handleSave}
                disabled={saving}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? t('common.saving') : t('onboarding.capture.saveCta')}
                <span aria-hidden>→</span>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Compose render
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-text-primary leading-tight">
          {t('onboarding.capture.title')}
        </h2>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {t('onboarding.capture.subtitle')}
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder={t('onboarding.capture.placeholder')}
          rows={6}
          className="w-full px-4 py-3.5 bg-surface border border-border rounded-2xl text-[16px] leading-relaxed text-text-primary outline-none focus:border-primary placeholder:text-text-tertiary resize-none"
        />
        {speechSupported && (
          <TapToSpeakButton
            isListening={mic.isListening}
            {...mic.micButtonProps}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-text-secondary hover:text-text-primary px-2 py-2"
        >
          ← {t('common.back')}
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="text-xs font-medium text-text-tertiary hover:text-text-secondary px-2 py-2"
          >
            {t('onboarding.capture.skipForNow')}
          </button>
          <motion.button
            type="button"
            onClick={handleClassify}
            disabled={!canClassify}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className="px-5 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-warm-sm hover:bg-primary-dark transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            {classifying ? t('onboarding.capture.classifying') : t('onboarding.capture.seeWhatWeGot')}
            <span aria-hidden>→</span>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
