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
import Link from 'next/link';
import { motion } from 'framer-motion';
import GuideMascot from '@/components/mascot/GuideMascot';
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
  icon: string | { type: 'avatar'; src: string; alt: string };
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
        ) : (
          <Image
            src={item.icon.src}
            alt={item.icon.alt}
            width={56}
            height={56}
            className="rounded-full object-cover w-full h-full"
          />
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

export default function HomePage() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { habits, fetchHabits, completions, fetchCompletions, toggleCompletion } = useHabitStore();
  const { entries, fetchEntries } = useJournalStore();
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
  // Free-thought bubble is the only optional bubble now. The guide
  // bubble was removed entirely once the Journal-wall center button
  // started showing the user's chosen guide directly. This default
  // is true so existing users still see Free Thought; opt-out lives
  // in /settings.
  const [showFreeThoughtBubble, setShowFreeThoughtBubble] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('show_free_thought_bubble') !== 'false';
    } catch {
      return true;
    }
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

  const pulseCount = useMemo(() => entries.filter((e) => e.entry_type === 'pulse').length, [entries]);

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

    // Guided session with the user's chosen guide — moved off the
    // Journal-wall center button (which is now the book / writing
    // surface) into a Pulse bubble.
    items.push({
      id: '__guided__',
      icon: '💬', // 💬 speech balloon
      label: t('home.guidedSession'),
      href: '/guided',
    });

    // Ask Jane — bare Gemini Q&A, no persona. Ephemeral chat surface.
    items.push({
      id: '__askjane__',
      icon: '✨', // ✨ sparkles
      label: t('home.askJane'),
      href: '/ask',
    });

    if (showFreeThoughtBubble) {
      items.push({
        id: '__voice__',
        // Open book — replaces the old microphone emoji per user
        // feedback ("more like a beautiful book").
        icon: '\uD83D\uDCD6',
        label: t('home.freeThought'),
        href: '/voice',
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
  }, [showFreeThoughtBubble, templates, enabledIds, templateCompletedToday]);

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

    const ftPref = typeof window !== 'undefined' ? localStorage.getItem('show_free_thought_bubble') : null;
    setShowFreeThoughtBubble(ftPref !== 'false');

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
  }, [fetchHabits, fetchCompletions, fetchEntries, today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

      {/* Daily Pulse — morning/evening reflection prompts. The body
          & mind check-in is now the final two steps of the same flow
          (one question per screen) so users get a single contained
          ritual instead of a separate always-visible card. */}
      <DailyPulseCard entries={entries} />

      {/* Patterns link — after 7+ pulses */}
      {pulseCount >= 7 && (
        <Link
          href="/pulse"
          className="flex items-center justify-between bg-surface/50 rounded-xl border border-border px-4 py-2.5 hover:border-primary/30 transition-colors"
        >
          <span className="text-sm text-text-secondary">{t('pulse.viewPatterns')}</span>
          <span className="text-text-tertiary">→</span>
        </Link>
      )}

      {/* Drag-and-drop bubble grid — trims trailing empty rows unless editing */}
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

      {/* Weekly Reflection */}
      {reflection && (
        <WeeklyReflectionCard reflection={reflection} guideName={guide.name} />
      )}

      {/* Habits moved to Tasks tab */}
    </div>
  );
}
