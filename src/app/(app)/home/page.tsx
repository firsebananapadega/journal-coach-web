'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  DndContext,
  closestCenter,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

const STORAGE_KEY = 'home_bubble_order';

// ---------- Sortable bubble ----------

function SortableBubble({
  item,
  editMode,
  onTap,
}: {
  item: BubbleItem;
  editMode: boolean;
  onTap: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !editMode });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: editMode ? 'none' : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <button
        onClick={() => {
          if (!editMode) onTap();
        }}
        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-colors w-full ${
          item.done
            ? 'border-success/30 bg-success/5 opacity-60'
            : 'border-border bg-surface hover:border-primary/50'
        } ${editMode ? 'animate-wiggle' : ''}`}
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
      </button>
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
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const [reflection, setReflection] = useState<WeeklyReflectionData | null>(null);

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

  // Apply saved order
  const orderedItems = useMemo<BubbleItem[]>(() => {
    if (!savedOrder) return allItems;
    const map = new Map(allItems.map((item) => [item.id, item]));
    const ordered: BubbleItem[] = [];
    for (const id of savedOrder) {
      const item = map.get(id);
      if (item) {
        ordered.push(item);
        map.delete(id);
      }
    }
    // Append any new items not in saved order
    for (const item of map.values()) {
      ordered.push(item);
    }
    return ordered;
  }, [allItems, savedOrder]);

  // Sensors: immediate drag when in edit mode (no delay needed — edit button activates)
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 5 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = orderedItems.findIndex((i) => i.id === active.id);
      const newIndex = orderedItems.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(orderedItems, oldIndex, newIndex);
      const ids = newOrder.map((i) => i.id);
      setSavedOrder(ids);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    },
    [orderedItems]
  );

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
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

    // Load saved bubble order
    const orderStr = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (orderStr) {
      try {
        setSavedOrder(JSON.parse(orderStr));
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

      {/* Draggable bubble grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedItems.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {orderedItems.map((item) => (
              <SortableBubble
                key={item.id}
                item={item}
                editMode={editMode}
                onTap={() => router.push(item.href)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {editMode && (
        <p className="text-xs text-text-tertiary text-center">Drag bubbles to rearrange</p>
      )}

      {/* Weekly Reflection */}
      {reflection && (
        <WeeklyReflectionCard reflection={reflection} guideName={guide.name} />
      )}

      {/* Habits */}
      {activeHabits.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Today&apos;s habits</h2>
          <div className="space-y-1">
            {activeHabits.map((habit) => {
              const isDone = todayCompletions.has(habit.id);
              return (
                <button
                  key={habit.id}
                  onClick={() => toggleCompletion(habit.id, today)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                    isDone ? 'bg-success/10' : 'bg-surface hover:bg-surface-elevated'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isDone ? 'bg-success border-success' : 'border-border'
                    }`}
                  >
                    {isDone && <span className="text-white text-xs font-bold">&#10003;</span>}
                  </div>
                  <span className={`text-sm ${isDone ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                    {habit.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
