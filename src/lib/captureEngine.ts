// Universal Voice Capture Engine — Smart Router
// Takes raw speech, Gemini classifies and extracts structured data
// Routes to: priorities (with date awareness), groceries, intentions, habits, journal

import { callGemini, parseJsonResponse } from './geminiClient';
import { toLocalDateStr } from './dateUtils';

export interface GroceryStore {
  store: string;
  items: string[];
}

export interface PriorityTask {
  text: string;
  when: string; // "today", "tomorrow", "monday", or ISO date
}

export interface PlanEventParsed {
  title: string;
  time: string | null;
  location: string | null;
  subtasks: string[];
  when: string;
}

export interface CaptureResult {
  priorities: PriorityTask[];
  plans: PlanEventParsed[];
  groceries: GroceryStore[];
  intentions: string[];
  habits: string[];
  ideas: string[];
  gratitude: string[];
  journal: string | null;
}

const ROUTER_PROMPT = `You are a smart voice assistant that categorizes and extracts structured data from free-form speech. The user just spoke naturally about their day, tasks, shopping, goals, etc.

YOUR JOB: Analyze everything they said and extract data into the correct categories. They may talk about multiple things in one go.

IMPORTANT: Today's date is {TODAY}.

CATEGORIES:

1. **priorities** — Actionable tasks/to-dos. Things they need to DO.
   Each task MUST include a "when" field indicating WHICH DAY it's for:
   - "today" — if no date is mentioned, or they say "today"
   - "tomorrow" — if they say "tomorrow"
   - A specific day name like "monday", "tuesday", etc. — if they mention a day of the week
   - An ISO date like "2026-04-07" — if they mention a specific date

   Examples:
   - "I need to finish the report" → {"text": "Finish the report", "when": "today"}
   - "tomorrow I need to call the dentist" → {"text": "Call the dentist", "when": "tomorrow"}
   - "on Monday pick up dry cleaning" → {"text": "Pick up dry cleaning", "when": "monday"}
   - "I need to submit taxes by April 15th" → {"text": "Submit taxes", "when": "2026-04-15"}

2. **groceries** — Items to buy, grouped by store. If no store is mentioned, use "General".
   Examples: "get milk from Costco", "spinach and mushrooms from the Indian store", "I need bananas"
   Group items by the store they mentioned. If they say "from Costco" then following items belong to Costco until they mention another store.

3. **intentions** — How they want to BE or SHOW UP (not achieve). Aspirational, about character/presence.
   Examples: "I want to be more patient", "I need to listen more before reacting", "be present with my family"
   NOT goals like "get a promotion" or "lose weight"

4. **habits** — Recurring behaviors they want to build or maintain.
   Examples: "I should meditate every morning", "read before bed", "drink more water"

5. **journal** — Reflective, emotional, or narrative content. How they feel, what happened, what they're processing.
   Examples: "I've been feeling stressed about work", "had a great conversation with my mom"
   Capture the essence of what they're reflecting on, cleaned up slightly for readability but preserving their voice.

6. **ideas** — Creative thoughts, business ideas, things to explore someday, "what if" scenarios.
   Examples: "I should build an app for...", "what if I tried...", "I have an idea for..."

7. **gratitude** — Things the person is grateful for or appreciating.
   Examples: "I'm grateful for...", "I appreciate...", "thankful for..."

8. **plans** — Timed events, appointments, meals, meetups, activities, travel. Things HAPPENING at a specific time or on a specific day.
   Each plan has: _time_reasoning (your internal reasoning about times — FILL THIS FIRST), title, time (HH:MM in 24h format, "morning", "afternoon", "evening", or null), location (or null), subtasks (array of strings for prep/related items, or empty []), when (same date rules as priorities).

   TEMPORAL REASONING — THINK BEFORE YOU ASSIGN TIMES:
   For each plan, you MUST fill "_time_reasoning" FIRST. In it, write out your reasoning:
   1. What time-of-day context did the user provide? (morning/afternoon/evening/night/none)
   2. What specific times were mentioned? List them all.
   3. What is the logical relationship between the times? (e.g., "flight at 11, leave 2 hours before = leave at 9")
   4. Given the context, are these times AM or PM? (e.g., "night" context = PM, "flight at 11 at night" = 23:00, "leave at 9" in the same night context = 21:00)
   5. How many distinct events are there? (Don't split one event into multiple plans)

   TIME FORMAT RULES:
   - ALWAYS output time in 24-hour format: 21:00 (not 9:00 PM), 14:00 (not 2:00 PM)
   - Context inheritance: if the user says "Saturday night" and then mentions times, ALL those times inherit the "night" (PM) context unless explicitly stated otherwise
   - Inference chain: "flight at 11" + "night" context = 23:00. "leave 2 hours before" = 21:00. Both inherit PM from "night."
   - Common sense: "breakfast" = morning. "lunch" = afternoon. "dinner" = evening. "flight at night" = PM.

   DEDUPLICATION: One described event = ONE plan. Don't split details into separate plans.

   PLAN vs TASK: Plans are EVENTS (things happening at a time/place). Priorities are TASKS (to-do items to check off).

   Examples:
   - "breakfast at Luna Saturday morning" → {"_time_reasoning": "Saturday morning context. Breakfast = morning. Time: morning.", "title": "Breakfast at Luna", "time": "morning", "location": "Luna", "subtasks": [], "when": "saturday"}
   - "2pm lunch with parents, pick up pizza and bring wine" → {"_time_reasoning": "Explicit 2pm = 14:00. One event with prep subtasks.", "title": "Lunch with parents", "time": "14:00", "location": null, "subtasks": ["Pick up pizza", "Bring wine"], "when": "today"}
   - "Saturday night her parents are leaving, flight at 11, we need to head out by 9 from my place to the airport" → {"_time_reasoning": "Context: Saturday NIGHT. Flight at 11 = 23:00 (night context). Leave at 9 = 21:00 (same night context, 2 hours before flight). One event: airport drop-off.", "title": "Airport drop-off — flight at 11 PM", "time": "21:00", "location": "Airport", "subtasks": ["Leave from my place by 9 PM"], "when": "saturday"}

RULES:
- Only include categories where you actually detect relevant content
- If something could be both a priority and a habit, ask: is it a one-time task (priority) or recurring (habit)?
- For groceries, be smart about grouping by store. Items mentioned after a store name belong to that store until another store is named.
- For journal content, preserve the user's voice but clean up speech artifacts (um, uh, like, you know)
- If the entire speech is just reflective/emotional, it's ALL journal content — don't force-extract priorities
- Return empty arrays/null for categories with no matching content
- ALWAYS include the "when" field for every priority task. Default to "today" if no date is mentioned.

Respond with ONLY valid JSON:
{"priorities": [{"text": "task", "when": "today"}], "plans": [], "groceries": [], "intentions": [], "habits": [], "ideas": [], "gratitude": [], "journal": null}`;

export function resolveWhen(when: string, referenceDate?: string): string {
  const ref = referenceDate ? new Date(referenceDate + 'T12:00:00') : new Date();
  const whenLower = (when || 'today').toLowerCase().trim();

  if (whenLower === 'today') {
    return toLocalDateStr(ref);
  }

  if (whenLower === 'tomorrow') {
    const d = new Date(ref);
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  }

  // Check if it's already an ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(whenLower)) {
    return whenLower;
  }

  // Day of week names
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = dayNames.indexOf(whenLower);
  if (dayIndex !== -1) {
    const current = ref.getDay();
    let daysAhead = dayIndex - current;
    if (daysAhead <= 0) daysAhead += 7; // next occurrence
    const d = new Date(ref);
    d.setDate(d.getDate() + daysAhead);
    return toLocalDateStr(d);
  }

  // Fallback: today
  return toLocalDateStr(ref);
}

export async function classifyCapture(speechText: string): Promise<CaptureResult> {
  const todayStr = toLocalDateStr(new Date());
  const { getLocale } = await import('./language');
  const langHint = getLocale() === 'es' ? '\nNote: The user is speaking in Mexican Spanish. Understand and classify accordingly, but return JSON keys in English as specified above.' : '';
  const prompt = ROUTER_PROMPT.replace('{TODAY}', todayStr) + langHint + `\n\nUser said:\n"${speechText}"\n\nRespond with JSON only.`;
  const text = await callGemini('gemini-2.5-flash', prompt, 25000);
  const parsed = parseJsonResponse<Record<string, unknown>>(text, {});

  // Normalize priorities — handle both string[] and {text, when}[] formats
  let priorities: PriorityTask[] = [];
  if (Array.isArray(parsed.priorities)) {
    priorities = parsed.priorities.map((p: unknown) => {
      if (typeof p === 'string') {
        return { text: p, when: 'today' };
      }
      if (p && typeof p === 'object') {
        const obj = p as Record<string, unknown>;
        return {
          text: typeof obj.text === 'string' ? obj.text : String(obj.text || ''),
          when: typeof obj.when === 'string' ? obj.when : 'today',
        };
      }
      return { text: String(p), when: 'today' };
    });
  }

  // Normalize groceries — Gemini may return various formats
  let groceries: GroceryStore[] = [];
  try {
    const raw = parsed.groceries;
    if (Array.isArray(raw)) {
      groceries = raw.map((g: Record<string, unknown>) => ({
        store: (g.store as string) || 'General',
        items: Array.isArray(g.items) ? g.items as string[] : [],
      }));
    } else if (raw && typeof raw === 'object') {
      groceries = Object.entries(raw as Record<string, unknown>).map(([store, items]) => ({
        store,
        items: Array.isArray(items) ? items as string[] : [],
      }));
    }
  } catch {}

  // Normalize plans
  let plans: PlanEventParsed[] = [];
  if (Array.isArray(parsed.plans)) {
    plans = parsed.plans.map((p: unknown) => {
      if (p && typeof p === 'object') {
        const obj = p as Record<string, unknown>;
        return {
          title: typeof obj.title === 'string' ? obj.title : String(obj.title || ''),
          time: typeof obj.time === 'string' ? obj.time : null,
          location: typeof obj.location === 'string' ? obj.location : null,
          subtasks: Array.isArray(obj.subtasks) ? (obj.subtasks as string[]) : [],
          when: typeof obj.when === 'string' ? obj.when : 'today',
        };
      }
      return { title: String(p), time: null, location: null, subtasks: [], when: 'today' };
    });
  }

  return {
    priorities,
    plans,
    groceries,
    intentions: Array.isArray(parsed.intentions) ? parsed.intentions as string[] : [],
    habits: Array.isArray(parsed.habits) ? parsed.habits as string[] : [],
    ideas: Array.isArray(parsed.ideas) ? parsed.ideas as string[] : [],
    gratitude: Array.isArray(parsed.gratitude) ? parsed.gratitude as string[] : [],
    journal: typeof parsed.journal === 'string' ? parsed.journal : null,
  };
}

export function hasContent(result: CaptureResult): boolean {
  return (
    result.priorities.length > 0 ||
    result.plans.length > 0 ||
    result.groceries.length > 0 ||
    result.intentions.length > 0 ||
    result.habits.length > 0 ||
    result.ideas.length > 0 ||
    result.gratitude.length > 0 ||
    (result.journal !== null && result.journal.trim().length > 0)
  );
}

export function summarizeCapture(result: CaptureResult): string {
  const parts: string[] = [];
  if (result.priorities.length > 0) parts.push(`${result.priorities.length} task${result.priorities.length > 1 ? 's' : ''}`);
  if (result.plans.length > 0) parts.push(`${result.plans.length} plan${result.plans.length > 1 ? 's' : ''}`);
  if (result.groceries.length > 0) {
    const totalItems = result.groceries.reduce((sum, g) => sum + g.items.length, 0);
    parts.push(`${totalItems} grocery item${totalItems > 1 ? 's' : ''}`);
  }
  if (result.intentions.length > 0) parts.push(`${result.intentions.length} intention${result.intentions.length > 1 ? 's' : ''}`);
  if (result.habits.length > 0) parts.push(`${result.habits.length} habit${result.habits.length > 1 ? 's' : ''}`);
  if (result.ideas.length > 0) parts.push(`${result.ideas.length} idea${result.ideas.length > 1 ? 's' : ''}`);
  if (result.gratitude.length > 0) parts.push(`${result.gratitude.length} gratitude${result.gratitude.length > 1 ? 's' : ''}`);
  if (result.journal) parts.push('journal entry');
  return parts.join(', ');
}
