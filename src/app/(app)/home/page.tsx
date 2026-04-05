'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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

// ---------- Grid slot cell ----------

function GridCell({
  item,
  slotIndex,
  editMode,
  isSelected,
  onTap,
  onEditTap,
}: {
  item: BubbleItem | null;
  slotIndex: number;
  editMode: boolean;
  isSelected: boolean;
  onTap: () => void;
  onEditTap: () => void;
}) {
  if (!item) {
    // Empty slot — only visible in edit mode
    if (!editMode) return <div />;
    return (
      <button
        onClick={onEditTap}
        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 border-dashed transition-colors w-full min-h-[88px] ${
          isSelected ? 'border-primary bg-primary/10' : 'border-border/40'
        }`}
      >
        <span className="text-xl text-text-tertiary/40">+</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        if (editMode) {
          onEditTap();
        } else {
          onTap();
        }
      }}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-colors w-full ${
        isSelected
          ? 'border-primary border-2 bg-primary/10'
          : item.done
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
  const [gridSlots, setGridSlots] = useState<(string | null)[]>(Array(GRID_SIZE).fill(null));
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
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

  // Build a map from item ID to BubbleItem for quick lookup
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);

  // Sync gridSlots with allItems: ensure all items are placed, remove stale ones
  useEffect(() => {
    setGridSlots((prev) => {
      const currentIds = new Set(allItems.map((i) => i.id));
      // Clean stale IDs from slots
      const cleaned = prev.map((id) => (id && currentIds.has(id) ? id : null));
      // Find items not yet placed in any slot
      const placedIds = new Set(cleaned.filter(Boolean) as string[]);
      const unplaced = allItems.filter((i) => !placedIds.has(i.id));
      // Place unplaced items in first available empty slots
      const result = [...cleaned];
      let emptyIdx = 0;
      for (const item of unplaced) {
        while (emptyIdx < GRID_SIZE && result[emptyIdx] !== null) emptyIdx++;
        if (emptyIdx < GRID_SIZE) {
          result[emptyIdx] = item.id;
          emptyIdx++;
        }
      }
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(result));
      }
      return result;
    });
  }, [allItems]);

  const handleSlotTap = useCallback(
    (slotIndex: number) => {
      if (selectedSlot === null) {
        // First tap — select this slot
        setSelectedSlot(slotIndex);
      } else if (selectedSlot === slotIndex) {
        // Tapped the same slot — deselect
        setSelectedSlot(null);
      } else {
        // Second tap — swap the two slots
        setGridSlots((prev) => {
          const newSlots = [...prev];
          const temp = newSlots[selectedSlot];
          newSlots[selectedSlot] = newSlots[slotIndex];
          newSlots[slotIndex] = temp;
          localStorage.setItem(GRID_SLOTS_KEY, JSON.stringify(newSlots));
          return newSlots;
        });
        setSelectedSlot(null);
      }
    },
    [selectedSlot]
  );

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => !prev);
    setSelectedSlot(null);
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

      {/* Fixed-position bubble grid */}
      <div className="grid grid-cols-3 gap-2">
        {gridSlots.map((itemId, slotIndex) => {
          const item = itemId ? itemMap.get(itemId) ?? null : null;
          return (
            <GridCell
              key={slotIndex}
              item={item}
              slotIndex={slotIndex}
              editMode={editMode}
              isSelected={editMode && selectedSlot === slotIndex}
              onTap={() => item && router.push(item.href)}
              onEditTap={() => handleSlotTap(slotIndex)}
            />
          );
        })}
      </div>

      {editMode && (
        <p className="text-xs text-text-tertiary text-center">
          {selectedSlot !== null ? 'Tap another position to swap' : 'Tap a bubble to select, then tap where to move it'}
        </p>
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
