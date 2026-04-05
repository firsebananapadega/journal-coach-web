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

export interface CaptureResult {
  priorities: PriorityTask[];
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

RULES:
- Only include categories where you actually detect relevant content
- If something could be both a priority and a habit, ask: is it a one-time task (priority) or recurring (habit)?
- For groceries, be smart about grouping by store. Items mentioned after a store name belong to that store until another store is named.
- For journal content, preserve the user's voice but clean up speech artifacts (um, uh, like, you know)
- If the entire speech is just reflective/emotional, it's ALL journal content — don't force-extract priorities
- Return empty arrays/null for categories with no matching content
- ALWAYS include the "when" field for every priority task. Default to "today" if no date is mentioned.

Respond with ONLY valid JSON:
{"priorities": [{"text": "task", "when": "today"}], "groceries": [], "intentions": [], "habits": [], "ideas": [], "gratitude": [], "journal": null}`;

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
  const prompt = ROUTER_PROMPT.replace('{TODAY}', todayStr) + `\n\nUser said:\n"${speechText}"\n\nRespond with JSON only.`;
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

  return {
    priorities,
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
