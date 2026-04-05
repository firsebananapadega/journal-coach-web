// Universal Voice Capture Engine — Smart Router
// Takes raw speech, Gemini classifies and extracts structured data
// Routes to: priorities, groceries, intentions, habits, journal

import { callGemini, parseJsonResponse } from './geminiClient';

export interface GroceryStore {
  store: string;
  items: string[];
}

export interface CaptureResult {
  priorities: string[];
  groceries: GroceryStore[];
  intentions: string[];
  habits: string[];
  journal: string | null;
}

const ROUTER_PROMPT = `You are a smart voice assistant that categorizes and extracts structured data from free-form speech. The user just spoke naturally about their day, tasks, shopping, goals, etc.

YOUR JOB: Analyze everything they said and extract data into the correct categories. They may talk about multiple things in one go.

CATEGORIES:

1. **priorities** — Actionable tasks/to-dos for the day. Things they need to DO.
   Examples: "I need to finish the report", "call the dentist", "pick up dry cleaning"

2. **groceries** — Items to buy, grouped by store. If no store is mentioned, use "General".
   Examples: "get milk from Costco", "spinach and mushrooms from the Indian store", "I need bananas"
   Group items by the store they mentioned. If they say "from Costco" then following items belong to Costco until they mention another store.

3. **intentions** — How they want to BE or SHOW UP (not achieve). Aspirational, about character/presence.
   Examples: "I want to be more patient", "I need to listen more before reacting", "be present with my family"
   NOT goals like "get a promotion" or "lose weight"

4. **habits** — Recurring behaviors they want to build or maintain.
   Examples: "I should meditate every morning", "read before bed", "drink more water"

5. **journal** — Reflective, emotional, or narrative content. How they feel, what happened, what they're processing.
   Examples: "I've been feeling stressed about work", "had a great conversation with my mom", "I'm grateful for..."
   Capture the essence of what they're reflecting on, cleaned up slightly for readability but preserving their voice.

RULES:
- Only include categories where you actually detect relevant content
- If something could be both a priority and a habit, ask: is it a one-time task (priority) or recurring (habit)?
- For groceries, be smart about grouping by store. Items mentioned after a store name belong to that store until another store is named.
- For journal content, preserve the user's voice but clean up speech artifacts (um, uh, like, you know)
- If the entire speech is just reflective/emotional, it's ALL journal content — don't force-extract priorities
- Return empty arrays/null for categories with no matching content

Respond with ONLY valid JSON:
{"priorities": [], "groceries": [], "intentions": [], "habits": [], "journal": null}`;

export async function classifyCapture(speechText: string): Promise<CaptureResult> {
  const prompt = ROUTER_PROMPT + `\n\nUser said:\n"${speechText}"\n\nRespond with JSON only.`;
  const text = await callGemini('gemini-2.5-flash', prompt, 25000);
  const parsed = parseJsonResponse<any>(text, {});

  // Normalize groceries — Gemini may return various formats
  let groceries: GroceryStore[] = [];
  try {
    const raw = parsed.groceries;
    if (Array.isArray(raw)) {
      groceries = raw.map((g: any) => ({
        store: g.store || 'General',
        items: Array.isArray(g.items) ? g.items : [],
      }));
    } else if (raw && typeof raw === 'object') {
      // Handle format like { "Safeway": ["apples", "milk"], "Costco": ["bread"] }
      groceries = Object.entries(raw).map(([store, items]) => ({
        store,
        items: Array.isArray(items) ? items : [],
      }));
    }
  } catch {}

  return {
    priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
    groceries,
    intentions: Array.isArray(parsed.intentions) ? parsed.intentions : [],
    habits: Array.isArray(parsed.habits) ? parsed.habits : [],
    journal: typeof parsed.journal === 'string' ? parsed.journal : null,
  };
}

export function hasContent(result: CaptureResult): boolean {
  return (
    result.priorities.length > 0 ||
    result.groceries.length > 0 ||
    result.intentions.length > 0 ||
    result.habits.length > 0 ||
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
  if (result.journal) parts.push('journal entry');
  return parts.join(', ');
}
