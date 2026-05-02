'use client';

import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAuthStore } from '@/stores/authStore';
import { useHabitStore } from '@/stores/habitStore';
import { useJournalStore } from '@/stores/journalStore';
import { useLettersStore, type WeeklyLetter, type ArchiveItem } from '@/stores/lettersStore';
import { getTimeOfDay } from '@/lib/guidanceEngine';
import { getGuideOrDefault } from '@/lib/guideConfigs';
import { toLocalDateStr, entryDateStr } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/translations';
import { getLanguage, getLocale } from '@/lib/language';
import { getTranslatedTemplateName } from '@/lib/templateNameTranslation';
import {
  getCachedReflection,
  generateWeeklyReflection,
  type WeeklyReflectionData,
} from '@/lib/weeklyReflection';
import WeeklyReflectionCard from '@/components/WeeklyReflectionCard';
import DailyPulseCard from '@/components/DailyPulseCard';
import PresenceCapture from '@/components/PresenceCapture';
import MakeAChangeButton from '@/components/plans/MakeAChangeButton';
import ActivePlanCard from '@/components/plans/ActivePlanCard';
import WoopSheet from '@/components/plans/WoopSheet';
import { usePlanStore } from '@/stores/planStore';
import Link from 'next/link';
import { motion } from 'framer-motion';
import GuideMascot from '@/components/mascot/GuideMascot';
import JaneMascot from '@/components/mascot/JaneMascot';
import Mascot from '@/components/mascot/Mascot';
import type { GuideId } from '@/lib/guideConfigs';
import { fadeUp, prefersReducedMotion } from '@/lib/motionVariants';

interface TemplateInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
}

interface BubbleItem {
  id: string;
  icon:
    | string
    | { type: 'avatar'; src: string; alt: string }
    | { type: 'mascot'; guide: GuideId | 'jane' };
  label: string;
  href: string;
  done?: boolean;
}

const ICONS: Record<string, string> = {
  moon: '\uD83C\uDF19',
  sun: '\u2600\uFE0F',
  heart: '\u2764\uFE0F',
  face: '\uD83D\uDE0A',
  cloud: '\u2601\uFE0F',
  calendar: '\uD83D\uDCC5',
  target: '\uD83C\uDFAF',
  document: '\uD83D\uDCC4',
};

const GRID_SLOTS_KEY = 'home_grid_slots';
const GRID_SIZE = 18; // 3 columns x 6 rows

// ---------- Bubble content (shared between normal render and drag overlay) ----------

function BubbleContent({ item, editMode, isDragging: dragging }: { item: BubbleItem; editMode: boolean; isDragging?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1 w-full ${editMode && !dragging ? 'animate-wiggle' : ''}`}>
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all ${
          dragging
            ? 'border-primary bg-primary/10 scale-110 shadow-lg'
            : item.done
            ? 'border-success/30 bg-success/5 opacity-60'
            : 'border-border bg-surface hover:border-primary/50'
        }`}
      >
        {typeof item.icon === 'string' ? (
          <span className="text-3xl">{item.icon}</span>
        ) : item.icon.type === 'avatar' ? (
          <Image
            src={item.icon.src}
            alt={item.icon.alt}
            width={56}
            height={56}
            className="rounded-full object-cover w-full h-full"
          />
        ) : item.icon.guide === 'jane' ? (
          <JaneMascot fill pose="idle" />
        ) : (
          <Mascot guide={item.icon.guide} pose="idle" fill />
        )}
      </div>
      <span className="text-[11px] text-text-primary text-center leading-tight line-clamp-2">
        {item.label}
      </span>
      {item.done && <span className="text-[9px] text-success">{t('common.done')}</span>}
    </div>
  );
}

// ---------- Droppable grid slot ----------

function DroppableSlot({
  slotIndex,
  item,
  editMode,
  isDraggedOver,
  isBeingDragged,
  onTap,
}: {
  slotIndex: number;
  item: BubbleItem | null;
  editMode: boolean;
  isDraggedOver: boolean;
  isBeingDragged: boolean;
  onTap: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot-${slotIndex}`,
    data: { slotIndex },
  });

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: item ? `drag-${item.id}` : `empty-${slotIndex}`,
    data: { slotIndex, itemId: item?.id },
    disabled: !item,
  });

  const highlight = isOver || isDraggedOver;

  // Merge refs
  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      setDragRef(node);
    },
    [setDropRef, setDragRef],
  );

  if (!item) {
    if (!editMode) return <div ref={setDropRef} className="min-h-[80px]" />;
    return (
      <div ref={setDropRef} className="flex flex-col items-center gap-1 w-full">
        <div
          className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${
            highlight ? 'border-primary bg-primary/10' : 'border-border/40'
          }`}
        >
          <span className="text-lg text-text-tertiary/40">+</span>
        </div>
        <span className="text-[11px] text-transparent">empty</span>
      </div>
    );
  }

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...listeners}
      onClick={() => { if (!editMode) onTap(); }}
      className={`cursor-pointer select-none ${isDragging || isBeingDragged ? 'opacity-30' : ''}`}
      style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
    >
      <BubbleContent item={item} editMode={editMode} />
    </div>
  );
}

// ---------- Main page ----------

// Templates + bubble grid disabled while exploring the consolidated
// Pulse-tab shape (mid-day Presence pause moved here too). Flip to
// true to restore in one edit — all underlying state, fetchers, and
// drag-and-drop wiring stay intact behind this flag.
const SHOW_BUBBLE_GRID = false;

// Mid-day Presence pause renders on /home from this hour onward
// (and through to the 4 AM pulse-day rollover handled inside the
// component). Before this hour it's "too early for mid-day," so we
// hide it to keep the morning pulse visually un-cluttered.
const PRESENCE_VISIBLE_FROM_HOUR = 11;

export default function HomePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);

  // Note: cold-start wall restoration used to live here as a useEffect
  // that bounced the user to /today if wallState said tasks-was-last.
  // It has moved to (app)/layout.tsx where it runs SYNCHRONOUSLY in
  // render, so the wrong-wall page (this page, /home) never paints
  // before the redirect fires. The previous useEffect-based version
  // caused a brief flash of the weekly letter banner before bouncing.

  const { habits, fetchHabits, completions, fetchCompletions, toggleCompletion } = useHabitStore();
  const { entries, fetchEntries } = useJournalStore();
  // Server-delivered weekly letters. The cron at /api/cron/generate-
  // weekly-letters writes rows; we read them here. Falls back to the
  // client-side generated reflection for users who haven't received
  // a server letter yet (e.g. fresh after the feature launch).
  const letters = useLettersStore((s) => s.letters);
  const patterns = useLettersStore((s) => s.patterns);
  const quarterlies = useLettersStore((s) => s.quarterlies);
  const lettersHasFetched = useLettersStore((s) => s.hasFetched);
  const fetchLetters = useLettersStore((s) => s.fetchLetters);
  const markLetterSeen = useLettersStore((s) => s.markSeen);
  const [templates, setTemplates] = useState<TemplateInfo[]>(() => {
    // Load cached templates for instant display while Supabase fetches fresh data
    if (typeof window === 'undefined') return [];
    try {
      const cached = localStorage.getItem('cached_templates');
      if (cached) return JSON.parse(cached);
    } catch {}
    return [];
  });
  const [enabledIds, setEnabledIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('enabled_template_ids');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });
  const [editMode, setEditMode] = useState(false);
  const [dataReady, setDataReady] = useState(() => {
    // If we have cached templates, data is ready immediately
    if (typeof window === 'undefined') return false;
    try {
      return !!localStorage.getItem('cached_templates');
    } catch {}
    return false;
  });
  const [gridSlots, setGridSlots] = useState<(string | null)[]>(() => {
    if (typeof window === 'undefined') return Array(GRID_SIZE).fill(null);
    try {
      const saved = localStorage.getItem(GRID_SLOTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Migrate: if saved grid is smaller, pad with nulls
          if (parsed.length < GRID_SIZE) {
            return [...parsed, ...Array(GRID_SIZE - parsed.length).fill(null)];
          }
          if (parsed.length === GRID_SIZE) return parsed;
        }
      }
    } catch {}
    return Array(GRID_SIZE).fill(null);
  });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [reflection, setReflection] = useState<WeeklyReflectionData | null>(null);
  // Mid-day Presence is no longer one-and-done. Once today's first
  // presence row exists, /home swaps the compose form for a small
  // "+ Add another pause" button. Tapping it flips this state on,
  // re-mounting PresenceCapture; on save the callback flips it back
  // off so the button reappears for the next pause.
  const [addingAnotherPause, setAddingAnotherPause] = useState(false);
  const [woopOpen, setWoopOpen] = useState(false);
  const activePlan = usePlanStore((s) => s.active);
  const fetchActivePlan = usePlanStore((s) => s.fetchActive);
  const isDragging = useRef(false);

  // Drag sensors — long press (500ms) to start drag, same as priorities
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { delay: 500, tolerance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const today = toLocalDateStr(new Date());
  const timeOfDay = getTimeOfDay();
  const name = profile?.display_name;
  const guide = getGuideOrDefault(profile?.preferred_guide);

  const greeting =
    timeOfDay === 'morning'
      ? t('home.goodMorning', { name: name ? ', ' + name : '' })
      : timeOfDay === 'afternoon'
      ? t('home.goodAfternoon', { name: name ? ', ' + name : '' })
      : t('home.goodEvening', { name: name ? ', ' + name : '' });

  const todayCompletions = completions[today] || new Set<string>();
  const activeHabits = habits.filter((h) => h.is_active);

  // Has the user already done today's mid-day Presence pause? Mirrors
  // DailyPulseCard's pulse-day boundary (rolls at 04:00) so an 11 PM
  // capture still counts as "today." When true, /home hides the
  // PresenceCapture compose form — DailyPulseCard renders the entry
  // as a compact done card in its chronological list instead.
  const todaysPresenceDone = useMemo(() => {
    return entries.some((e) => {
      if (e.entry_type !== 'pulse') return false;
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      if (m.pulseMode !== 'presence') return false;
      const d = new Date(e.created_at);
      // Pulse-day rollover at 04:00 — same as DailyPulseCard.
      if (d.getHours() < 4) d.setDate(d.getDate() - 1);
      return toLocalDateStr(d) === today;
    });
  }, [entries, today]);

  // Most-recent archive item — interleaves weekly letters, monthly
  // patterns, and quarterly narrative-arc letters by generated_at so
  // whichever is freshest wins the spotlight. Once the user opens
  // it, it drops to the quieter bottom card. The bottom card still
  // always shows a weekly-letter snippet (monthly + quarterly each
  // have their own /letters/[id] surface).
  const latestLetter: WeeklyLetter | null = letters[0] ?? null;
  const archiveItems: ArchiveItem[] = useMemo(() => {
    const merged: ArchiveItem[] = [
      ...letters.map((l) => ({ kind: 'weekly' as const, ...l })),
      ...patterns.map((p) => ({ kind: 'monthly' as const, ...p })),
      ...quarterlies.map((q) => ({ kind: 'quarterly' as const, ...q })),
    ];
    return merged.sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
  }, [letters, patterns, quarterlies]);
  const unreadItem: ArchiveItem | null = archiveItems.find((i) => !i.seen_at) ?? null;

  const templateCompletedToday = useMemo(() => {
    const completed = new Set<string>();
    entries.forEach((e) => {
      if (e.entry_type === 'template' && e.template_id && entryDateStr(e.created_at) === today) {
        completed.add(e.template_id);
      }
    });
    return completed;
  }, [entries, today]);

  // Build bubble items. No guide bubble — the Journal Wall center
  // button shows the user's chosen guide. Free Thought is toggleable.
  const allItems = useMemo<BubbleItem[]>(() => {
    const items: BubbleItem[] = [];

    // Guided session with the user's chosen guide — the bubble renders
    // the guide's own SVG mascot (not a flat PNG avatar) so the figure
    // reads as the living character the user chose during onboarding.
    items.push({
      id: '__guided__',
      icon: { type: 'mascot', guide: guide.id as GuideId },
      label: t('home.guidedSession'),
      href: '/guided',
    });

    // Ask Jane — bare Gemini Q&A. Jane has her own SVG mascot (see
    // /components/mascot/bodies/JaneBody.tsx); using it in the bubble
    // turns "Ask Jane" into a recognizable character instead of an
    // abstract ✨ sparkle.
    //
    // Toggled OFF 2026-04-24 per user request — they'll go to Gemini
    // directly when they want that. Code + the /ask route remain
    // intact so flipping ASK_JANE_BUBBLE_ENABLED back to true (or
    // exposing it as a per-user setting later) re-enables it without
    // a re-implementation.
    const ASK_JANE_BUBBLE_ENABLED = false;
    if (ASK_JANE_BUBBLE_ENABLED) {
      items.push({
        id: '__askjane__',
        icon: { type: 'mascot', guide: 'jane' },
        label: t('home.askJane'),
        href: '/ask',
      });
    }

    const locale = getLocale();
    for (const tmpl of templates.filter((tp) => enabledIds.includes(tp.id))) {
      items.push({
        id: tmpl.id,
        icon: ICONS[tmpl.icon] || '\uD83D\uDCC4',
        label: getTranslatedTemplateName(tmpl.id, tmpl.name, locale),
        href: `/template/${tmpl.id}`,
        done: templateCompletedToday.has(tmpl.id),
      });
    }

    return items;
  }, [templates, enabledIds, templateCompletedToday]);

  // Build a map from item ID to BubbleItem for quick lookup
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);

  // Sync gridSlots with allItems: place new items, clean stale ones
  // Only run AFTER initial data has loaded (templates from Supabase) to avoid
  // prematurely cleaning out template IDs that haven't appeared in allItems yet.
  useEffect(() => {
    if (!dataReady || allItems.length === 0 || isDragging.current) return;
    setGridSlots((prev) => {
      // Re-read from localStorage to get the latest saved state
      let base = prev;
      try {
        const saved = localStorage.getItem(GRID_SLOTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            if (parsed.length < GRID_SIZE) {
              base = [...parsed, ...Array(GRID_SIZE - parsed.length).fill(null)];
            } else if (parsed.length === GRID_SIZE) {
              base = parsed;
            }
          }
        }
      } catch {}

      const currentIds = new Set(allItems.map((i) => i.id));
      const cleaned = base.map((id: string | null) => (id && currentIds.has(id) ? id : null));
      const placedIds = new Set(cleaned.filter(Boolean) as string[]);
      const unplaced = allItems.filter((i) => !placedIds.has(i.id));
      if (unplaced.length === 0 && cleaned.every((id: string | null, i: number) => id === base[i])) {
        return base; // no changes — use localStorage version as truth
      }
      const result = [...cleaned];
      let emptyIdx = 0;
      for (const item of unplaced) {
        while (emptyIdx < GRID_SIZE && result[emptyIdx] !== null) emptyIdx++;
        if (emptyIdx < GRID_SIZE) {
          result[emptyIdx] = item.id;
          emptyIdx++;
        }
      }
      localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(result));
      return result;
    });
  }, [allItems, dataReady]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    isDragging.current = true;
    const slotIndex = event.active.data.current?.slotIndex as number | undefined;
    if (slotIndex !== undefined) setActiveSlot(slotIndex);
    setEditMode(true);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSlot(null);

    if (over) {
      const fromSlot = active.data.current?.slotIndex as number;
      const toSlot = over.data.current?.slotIndex as number;
      if (fromSlot !== undefined && toSlot !== undefined && fromSlot !== toSlot) {
        setGridSlots((prev) => {
          const newSlots = [...prev];
          const temp = newSlots[fromSlot];
          newSlots[fromSlot] = newSlots[toSlot];
          newSlots[toSlot] = temp;
          localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(newSlots));
          return newSlots;
        });
      }
    }

    // Keep isDragging true long enough to prevent the sync effect from
    // overwriting the new positions if allItems recomputes during this window.
    setTimeout(() => {
      setEditMode(false);
    }, 600);
    // Clear isDragging after edit mode animation settles
    setTimeout(() => {
      isDragging.current = false;
    }, 1200);
  }, []);

  const loadData = useCallback(async () => {
    fetchHabits();
    fetchCompletions(today, today);
    fetchEntries();

    const stored = typeof window !== 'undefined' ? localStorage.getItem('enabled_template_ids') : null;
    const ids = stored ? (JSON.parse(stored) as string[]) : [];
    setEnabledIds(ids);

    // Load saved grid slot assignments (with migration for size changes)
    const slotsStr = typeof window !== 'undefined' ? localStorage.getItem(GRID_SLOTS_KEY) : null;
    if (slotsStr) {
      try {
        const parsed = JSON.parse(slotsStr) as (string | null)[];
        if (Array.isArray(parsed)) {
          if (parsed.length < GRID_SIZE) {
            setGridSlots([...parsed, ...Array(GRID_SIZE - parsed.length).fill(null)]);
          } else if (parsed.length === GRID_SIZE) {
            setGridSlots(parsed);
          }
        }
      } catch { /* ignore */ }
    }

    // Load cached reflection
    const cached = getCachedReflection();
    if (cached) setReflection(cached);

    // Fire the weekly-letters fetch alongside templates. Silent fail
    // is fine — we fall back to the client-generated reflection.
    fetchLetters();

    supabase
      .from('templates')
      .select('id, name, icon, description, category')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (data) {
          setTemplates(data);
          // Cache for instant load next time
          try { localStorage.setItem('cached_templates', JSON.stringify(data)); } catch {}
        }
        setDataReady(true);
      });
  }, [fetchHabits, fetchCompletions, fetchEntries, fetchLetters, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Hydrate the active WOOP plan once on mount. The store guards
  // against running offline; when it bails we just fall back to
  // showing the "Make a change" CTA until reconnect.
  useEffect(() => {
    void fetchActivePlan();
  }, [fetchActivePlan]);

  // Generate weekly reflection if enough entries and not cached
  useEffect(() => {
    if (reflection) return; // already have one
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentEntries = entries.filter(
      (e) => new Date(e.created_at) >= oneWeekAgo
    );
    if (recentEntries.length < 3) return;

    generateWeeklyReflection(recentEntries, name || '', guide.name)
      .then((r) => setReflection(r))
      .catch(() => {
        /* silent — non-critical */
      });
  }, [entries, name, guide.name, reflection]);

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      {/* Greeting */}
      <motion.div
        {...(prefersReducedMotion ? {} : fadeUp)}
        className="flex items-start gap-3"
      >
        <div className="flex-1">
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString(getLanguage(), { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-bold text-text-primary mt-1 leading-tight">{greeting}</h1>
        </div>
        <div className="shrink-0 -mt-1">
          <GuideMascot pose="idle" size="md" animate />
        </div>
      </motion.div>

      {/* Unread-item card — surfaces the latest weekly letter,
          monthly pattern, or quarterly arc, whichever is fresher.
          Tapping routes to /letters/[id] (which handles all three
          kinds) and marks seen. Quarterly cards get the strongest
          treatment because they only land ~4×/year.
          Gated on lettersHasFetched so we never pop in (or out)
          during the fetch window — the card only appears once we
          have the authoritative answer. */}
      {lettersHasFetched && unreadItem && (() => {
        const isMonthly = unreadItem.kind === 'monthly';
        const isQuarterly = unreadItem.kind === 'quarterly';
        const gradientClass = isQuarterly
          ? 'bg-gradient-to-br from-primary/30 via-primary/15 to-transparent border-primary/55 hover:border-primary/80'
          : isMonthly
          ? 'bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-primary/40 hover:border-primary/70'
          : 'bg-gradient-to-br from-primary/15 via-primary/10 to-transparent border-primary/30 hover:border-primary/60';
        const headerGlyph = isQuarterly ? '✺' : isMonthly ? '✦' : '\u{1F48C}';
        const kindBadge = isQuarterly
          ? 'New quarterly letter'
          : isMonthly
          ? 'New monthly pattern'
          : 'New letter';
        const titleLine = isQuarterly
          ? `${guide.name}: a season in review`
          : isMonthly
          ? `${guide.name}: a month of patterns`
          : `${guide.name} wrote you a letter`;
        const previewText =
          unreadItem.kind === 'monthly' ? unreadItem.narrative : unreadItem.letter_text;
        return (
          <Link
            href={`/letters/${unreadItem.id}`}
            onClick={() => markLetterSeen(unreadItem.id, unreadItem.kind)}
            className={`block relative rounded-2xl border p-4 transition-colors ${gradientClass}`}
          >
            <span
              aria-hidden
              className="absolute top-3 right-3 inline-block w-2.5 h-2.5 rounded-full bg-primary"
            />
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl" aria-hidden>{headerGlyph}</span>
              <span className="text-[11px] uppercase tracking-widest text-primary font-bold">
                {kindBadge}
              </span>
            </div>
            <p className="text-sm font-semibold text-text-primary">{titleLine}</p>
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">
              {previewText.slice(0, 160)}…
            </p>
          </Link>
        );
      })()}

      {/* WOOP plan affordance — ActivePlanCard when a plan exists,
          MakeAChangeButton (entry to the 4-step WOOP sheet) otherwise.
          Single-active-plan invariant lives in the store. */}
      {activePlan ? (
        <ActivePlanCard />
      ) : (
        <MakeAChangeButton onTap={() => setWoopOpen(true)} />
      )}

      {/* Daily Pulse — morning/evening reflection prompts. The body
          & mind check-in is now the final two steps of the same flow
          (one question per screen) so users get a single contained
          ritual instead of a separate always-visible card. */}
      <DailyPulseCard entries={entries} />

      {/* Mid-day Presence pause — folded into /home so the Pulse tab
          becomes the single throughout-the-day check-in surface
          (morning + mid-day + evening). Three rendering states:
            (a) Time-gated to mid-day onward so nothing shows before
                the surface is relevant.
            (b) No presence yet today → show the compose form.
            (c) At least one presence done → swap the form for a
                subtle "+ Add another pause" button. Tapping it flips
                addingAnotherPause on which re-mounts the form; the
                form's onSaved callback flips it back off after save
                so the button reappears for the NEXT pause. Lets the
                user record as many mid-day check-ins as they want
                without the form being permanently parked on screen. */}
      {new Date().getHours() >= PRESENCE_VISIBLE_FROM_HOUR && (
        !todaysPresenceDone ? (
          <PresenceCapture />
        ) : addingAnotherPause ? (
          <PresenceCapture onSaved={() => setAddingAnotherPause(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAddingAnotherPause(true)}
            className="w-full py-3 rounded-2xl border border-dashed border-border bg-surface/40 text-text-tertiary hover:text-text-secondary hover:border-text-tertiary/60 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            aria-label={t('presence.addAnother')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{t('presence.addAnother')}</span>
          </button>
        )
      )}

      {/* Drag-and-drop bubble grid — trims trailing empty rows unless editing.
          DISABLED via SHOW_BUBBLE_GRID flag while exploring the consolidated
          shape. Underlying state (templates, gridSlots, drag sensors) all
          stays wired so flipping the flag back to true restores the feature
          exactly as it was. */}
      {SHOW_BUBBLE_GRID && (
        <>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-3 gap-2">
              {(() => {
                if (editMode) return gridSlots;
                // Round the last-filled index up to the end of its row (3 cols)
                // so each visible row is complete and doesn't leave a ragged edge.
                let lastFilled = -1;
                for (let i = gridSlots.length - 1; i >= 0; i--) {
                  if (gridSlots[i] !== null) { lastFilled = i; break; }
                }
                if (lastFilled === -1) return [];
                const cols = 3;
                const end = Math.ceil((lastFilled + 1) / cols) * cols;
                return gridSlots.slice(0, end);
              })().map((itemId, slotIndex) => {
                const item = itemId ? itemMap.get(itemId) ?? null : null;
                return (
                  <DroppableSlot
                    key={slotIndex}
                    slotIndex={slotIndex}
                    item={item}
                    editMode={editMode}
                    isDraggedOver={false}
                    isBeingDragged={activeSlot === slotIndex}
                    onTap={() => item && router.push(item.href)}
                  />
                );
              })}
            </div>

            {/* Drag overlay — the floating bubble that follows your finger */}
            <DragOverlay>
              {activeSlot !== null && gridSlots[activeSlot] ? (
                <BubbleContent
                  item={itemMap.get(gridSlots[activeSlot]!)!}
                  editMode={false}
                  isDragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {editMode && (
            <p className="text-xs text-text-tertiary text-center">{t('home.dragHint')}</p>
          )}
        </>
      )}

      {/* Weekly reflection — once a server-delivered letter has been
          marked seen, it stops showing on /home. The user can always
          re-read it from /letters; cluttering /home with a letter
          they've already opened buries the day's actual ritual.
          The client-cached fallback below only renders when no
          server letter exists at all (legacy users pre-cron).
          Gated on lettersHasFetched: without this, on cold start the
          server letters array is empty so latestLetter is null, and
          this card flashes in for one paint with the title
          "Quinn's Weekly Reflection" (Q + W) before fetchLetters
          resolves and it correctly unmounts. The flash was reported
          as "I see a letter and then it goes away" — fix is to
          delay the fallback decision until we KNOW. */}
      {lettersHasFetched && !unreadItem && !latestLetter && reflection ? (
        <WeeklyReflectionCard
          reflection={{ letter: reflection.letter, themes: reflection.themes }}
          guideName={guide.name}
        />
      ) : null}

      {/* Habits moved to Tasks tab */}

      {/* WOOP creation sheet — portaled, fixed-position. Mounted at
          page level so the sheet animates over the wall layout instead
          of inside the scroll container. */}
      {woopOpen && <WoopSheet open onClose={() => setWoopOpen(false)} />}
    </div>
  );
}
