'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
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
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';
import { toLocalDateStr, entryDateStr } from '@/lib/dateUtils';
import { supabase } from '@/lib/supabase';
import {
  getCachedReflection,
  generateWeeklyReflection,
  type WeeklyReflectionData,
} from '@/lib/weeklyReflection';
import WeeklyReflectionCard from '@/components/WeeklyReflectionCard';

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
const GRID_SIZE = 12; // 3 columns x 4 rows

// ---------- Bubble content (shared between normal render and drag overlay) ----------

function BubbleContent({ item, editMode, isDragging }: { item: BubbleItem; editMode: boolean; isDragging?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-colors w-full ${
        isDragging
          ? 'border-primary border-2 bg-primary/10 opacity-80 scale-105 shadow-lg'
          : item.done
          ? 'border-success/30 bg-success/5 opacity-60'
          : 'border-border bg-surface'
      } ${editMode && !isDragging ? 'animate-wiggle' : ''}`}
    >
      {typeof item.icon === 'string' ? (
        <span className="text-2xl">{item.icon}</span>
      ) : (
        <Image
          src={item.icon.src}
          alt={item.icon.alt}
          width={36}
          height={36}
          className="rounded-full object-cover"
        />
      )}
      <span className="text-xs text-text-primary text-center leading-tight line-clamp-2">
        {item.label}
      </span>
      {item.done && <span className="text-[10px] text-success">Done</span>}
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
    disabled: !editMode || !item,
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
    if (!editMode) return <div ref={setDropRef} className="min-h-[88px]" />;
    return (
      <div
        ref={setDropRef}
        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 border-dashed transition-colors w-full min-h-[88px] ${
          highlight ? 'border-primary bg-primary/10' : 'border-border/40'
        }`}
      >
        <span className="text-xl text-text-tertiary/40">+</span>
      </div>
    );
  }

  return (
    <div
      ref={mergedRef}
      {...attributes}
      {...(editMode ? listeners : {})}
      onClick={() => { if (!editMode) onTap(); }}
      className={`cursor-pointer ${isDragging || isBeingDragged ? 'opacity-30' : ''}`}
      style={{ touchAction: editMode ? 'none' : 'auto' }}
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
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [showGuidedBubble, setShowGuidedBubble] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [gridSlots, setGridSlots] = useState<(string | null)[]>(() => {
    if (typeof window === 'undefined') return Array(GRID_SIZE).fill(null);
    try {
      const saved = localStorage.getItem(GRID_SLOTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === GRID_SIZE) return parsed;
      }
    } catch {}
    return Array(GRID_SIZE).fill(null);
  });
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [reflection, setReflection] = useState<WeeklyReflectionData | null>(null);

  // Drag sensors
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const today = toLocalDateStr(new Date());
  const timeOfDay = getTimeOfDay();
  const name = profile?.display_name;
  const guide = getGuideOrDefault(profile?.preferred_guide);

  const greeting =
    timeOfDay === 'morning'
      ? `Good morning${name ? ', ' + name : ''}.`
      : timeOfDay === 'afternoon'
      ? `Good afternoon${name ? ', ' + name : ''}.`
      : `Good evening${name ? ', ' + name : ''}.`;

  const todayCompletions = completions[today] || new Set<string>();
  const activeHabits = habits.filter((h) => h.is_active);

  const templateCompletedToday = useMemo(() => {
    const completed = new Set<string>();
    entries.forEach((e) => {
      if (e.entry_type === 'template' && e.template_id && entryDateStr(e.created_at) === today) {
        completed.add(e.template_id);
      }
    });
    return completed;
  }, [entries, today]);

  // Build bubble items
  const allItems = useMemo<BubbleItem[]>(() => {
    const items: BubbleItem[] = [];

    if (showGuidedBubble) {
      items.push({
        id: '__guided__',
        icon: { type: 'avatar', src: getGuideAvatar(guide.id as GuideId), alt: guide.name },
        label: guide.name,
        href: '/guided',
      });
    }

    items.push({
      id: '__voice__',
      icon: '\uD83C\uDFA4\uFE0F',
      label: 'Free Thought',
      href: '/voice',
    });

    items.push({
      id: '__priorities__',
      icon: '\uD83C\uDFAF',
      label: 'Priorities',
      href: '/priorities',
    });

    for (const tmpl of templates.filter((t) => enabledIds.includes(t.id))) {
      items.push({
        id: tmpl.id,
        icon: ICONS[tmpl.icon] || '\uD83D\uDCC4',
        label: tmpl.name,
        href: `/template/${tmpl.id}`,
        done: templateCompletedToday.has(tmpl.id),
      });
    }

    return items;
  }, [showGuidedBubble, guide, templates, enabledIds, templateCompletedToday]);

  // Build a map from item ID to BubbleItem for quick lookup
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);

  // Sync gridSlots with allItems: place new items, clean stale ones, persist
  useEffect(() => {
    if (allItems.length === 0) return;
    setGridSlots((prev) => {
      const currentIds = new Set(allItems.map((i) => i.id));
      const cleaned = prev.map((id) => (id && currentIds.has(id) ? id : null));
      const placedIds = new Set(cleaned.filter(Boolean) as string[]);
      const unplaced = allItems.filter((i) => !placedIds.has(i.id));
      if (unplaced.length === 0 && cleaned.every((id, i) => id === prev[i])) {
        return prev; // no changes needed — don't save
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
      // Save ALL positions so they persist across sessions
      localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(result));
      return result;
    });
  }, [allItems]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const slotIndex = event.active.data.current?.slotIndex as number | undefined;
    if (slotIndex !== undefined) setActiveSlot(slotIndex);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSlot(null);
    if (!over) return;

    const fromSlot = active.data.current?.slotIndex as number;
    const toSlot = over.data.current?.slotIndex as number;
    if (fromSlot === undefined || toSlot === undefined || fromSlot === toSlot) return;

    setGridSlots((prev) => {
      const newSlots = [...prev];
      const temp = newSlots[fromSlot];
      newSlots[fromSlot] = newSlots[toSlot];
      newSlots[toSlot] = temp;
      localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(newSlots));
      return newSlots;
    });
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
    setActiveSlot(null);
  }, []);

  const loadData = useCallback(async () => {
    fetchHabits();
    fetchCompletions(today, today);
    fetchEntries();

    const guidedPref = typeof window !== 'undefined' ? localStorage.getItem('show_guided_bubble') : null;
    setShowGuidedBubble(guidedPref !== 'false');

    const stored = typeof window !== 'undefined' ? localStorage.getItem('enabled_template_ids') : null;
    const ids = stored ? (JSON.parse(stored) as string[]) : [];
    setEnabledIds(ids);

    // Load saved grid slot assignments
    const slotsStr = typeof window !== 'undefined' ? localStorage.getItem(GRID_SLOTS_KEY) : null;
    if (slotsStr) {
      try {
        const parsed = JSON.parse(slotsStr) as (string | null)[];
        if (Array.isArray(parsed) && parsed.length === GRID_SIZE) {
          setGridSlots(parsed);
        }
      } catch {
        /* ignore */
      }
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
        if (data) setTemplates(data);
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
      {/* Greeting + Edit button */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-bold text-text-primary mt-1">{greeting}</h1>
        </div>
        <button
          onClick={toggleEditMode}
          className={`mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            editMode ? 'bg-primary text-white' : 'text-text-tertiary hover:text-text-secondary'
          }`}
        >
          {editMode ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* Drag-and-drop bubble grid */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-2">
          {gridSlots.map((itemId, slotIndex) => {
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
        <p className="text-xs text-text-tertiary text-center">Drag bubbles to rearrange</p>
      )}

      {/* Weekly Reflection */}
      {reflection && (
        <WeeklyReflectionCard reflection={reflection} guideName={guide.name} />
      )}

      {/* Habits moved to Tasks tab */}
    </div>
  );
}
