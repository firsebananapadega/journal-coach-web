// Universal Voice Capture Engine — Smart Router
// Takes raw speech, Gemini classifies and extracts structured data
// Routes to: priorities (with date awareness), groceries, intentions, habits, journal

import { callGemini, callGeminiDetailed, parseJsonResponse, type TraceFn } from './geminiClient';
import { toLocalDateStr } from './dateUtils';
import type { PriorityCategory } from '../stores/priorityStore';
import type { ListRecord } from '../stores/listStore';

export interface GroceryStore {
  store: string;
  items: string[];
}

export interface PriorityTask {
  text: string;
  when: string; // "today", "tomorrow", "monday", or ISO date
  category: PriorityCategory;
  // Optional time-of-day hint, currently used only for medications
  // (e.g. "morning" / "evening" / "08:00").
  subgroup?: string | null;
  // ─── Routing hints (added in Phase 5 — capture routing) ───
  // The literal list name from speech, e.g. "trip planning" / "gym".
  // The app matches this against the user's actual lists at preview
  // time; if it doesn't match an existing list, the preview surfaces
  // a "+ New list: <hint>" option.
  list_hint?: string | null;
  // ISO date when the model can resolve one explicitly. Distinct from
  // `when` because `when` may stay as "today" while due_date carries
  // a future date the model parsed (e.g. "June 15"). resolveWhen()
  // still works as a fallback.
  due_date?: string | null;
  // "HH:MM" (24h) | "morning" | "afternoon" | "evening" | "night".
  // Time-anchored items used to flow through the separate `plans`
  // channel; we now route them as priorities with this field set so
  // they land in the new tasks table with a time chip.
  time?: string | null;
  // Sprint 3: when the user explicitly asked to be reminded, this is
  // the full UTC ISO timestamp of the reminder. Set only when the
  // utterance contains an explicit "remind me" / "set a reminder" /
  // "ping me" phrasing — NOT for generic time-anchored tasks.
  remind_at_iso?: string | null;
  // Raw phrase the user spoke, surfaced so chrono-node can fix up
  // Gemini's ISO if it looks off. E.g. "remind me tomorrow at 10am".
  reminder_phrase?: string | null;
}

export interface PlanEventParsed {
  title: string;
  time: string | null;
  location: string | null;
  subtasks: string[];
  when: string;
}

export type CompletionType = 'done' | 'bought' | 'taken' | 'skip';

export interface CompletionIntent {
  // The noun phrase the user said they finished, e.g. "milk", "morning meds".
  // The CapturePreviewSheet runs this through fuzzyMatch to find the actual
  // PriorityItem / GroceryItem in the current list.
  phrase: string;
  type: CompletionType;
}

export interface NotebookChoice {
  slug: string;
  name: string;
  hint?: string; // optional one-liner helping Gemini pick (e.g., "gratitude and appreciation")
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
  completions: CompletionIntent[];
  // Present-tense pantry-state assertions. Distinct from `completions`
  // (past-tense purchases). Powers the "I have eggs and butter" flow:
  // matches against the existing list to check off, surfaces the rest
  // for the preview sheet's pantry-sync section.
  //
  // Each entry has a bare noun phrase plus optional quantity signals:
  //   qty_hint  — coarse band: 'low' | 'medium' | 'high' | null.
  //               Drives bucket routing in the preview ('low' →
  //               keep-on-list rather than check-off).
  //   qty_count — specific integer when the user volunteered one
  //               ("three onions left" → 3). Display-only — preview
  //               renders "(3 left)" inline. Doesn't affect routing.
  have_items: Array<{
    name: string;
    qty_hint?: 'low' | 'medium' | 'high' | null;
    qty_count?: number | null;
  }>;
  // Sprint 2: which notebook the `journal` content (if any) belongs
  // in. Gemini's best guess; user overrides in the preview sheet.
  notebook_slug: string | null;
  notebook_confidence: number;
}

const VALID_CATEGORIES: PriorityCategory[] = [
  'medications',
  'errands',
  'work',
  'home',
  'bills',
  'other',
];

function isCategory(v: unknown): v is PriorityCategory {
  return typeof v === 'string' && (VALID_CATEGORIES as string[]).includes(v);
}

function isCompletionType(v: unknown): v is CompletionType {
  return v === 'done' || v === 'bought' || v === 'taken' || v === 'skip';
}

const ROUTER_PROMPT = `You are a smart voice assistant that categorizes and extracts structured data from free-form speech. The user just spoke naturally about their day, tasks, shopping, goals, etc.

YOUR JOB: Analyze everything they said and extract data into the correct categories. They may talk about multiple things in one go.

IMPORTANT: Today's date is {TODAY}.

CATEGORIES:

1. **priorities** — Actionable tasks/to-dos. Things they need to DO. INCLUDES time-anchored events (appointments, meals, meetups, travel) — these get \`time\` + \`due_date\` set.
   Each task MUST include a "when" field AND a "category" field. Optional fields: subgroup, list_hint, due_date, time.

   "when" — WHICH DAY the task is for (loose textual hint; the app resolves it):
   - "today" — if no date is mentioned, or they say "today"
   - "tomorrow" — if they say "tomorrow"
   - A specific day name like "monday", "tuesday", etc.
   - An ISO date like "2026-04-07"

   "due_date" — OPTIONAL ISO date (YYYY-MM-DD). Fill this when the user names a specific future date or relative date that resolves to one (e.g. "June 15", "next Friday", "in two weeks", "this weekend"). Use {TODAY} as the anchor. Skip for vague dates like "soon" or "later". When set, this OVERRIDES "when" for routing.

   "time" — OPTIONAL. ALWAYS in 24-hour format ("HH:MM") OR one of: "morning", "afternoon", "evening", "night". Set this when the user mentions a specific time or part-of-day for an appointment / meal / meetup / activity. Examples:
   - "concert at 7pm" → time: "19:00"
   - "breakfast Saturday morning" → time: "morning"
   - "leave by 9 at night" → time: "21:00" (night context = PM)
   - "flight at 11" with "Saturday night" context → time: "23:00"

   "list_hint" — OPTIONAL. The literal list/project phrase the user said. Surface ONLY when the user's wording explicitly names a list, project, or context bucket. Accept ALL of these surface forms — with or without the word "for":
   - "for the trip" → list_hint: "trip"
   - "add to my gym list" → list_hint: "gym"
   - "for project Apollo" → list_hint: "Apollo" (drop the literal word "project")
   - "project Wellbloom, finish the spec and email Sam" → list_hint: "Wellbloom" (bare leading "project X" — NO "for" needed)
   - "on project Wellbloom schedule kickoff" → list_hint: "Wellbloom"
   - "Wellbloom project: review the spec" → list_hint: "Wellbloom" (suffix form, colon-separated)
   - "project...Wellbloom...finish the design review" → list_hint: "Wellbloom" (dictation ellipses between "project" and the name)
   - "work stuff" → list_hint: "work"
   - "office supplies for the quarterly report" → list_hint: "office"
   Do NOT invent list_hint from category alone. If the user just says "I need to call the dentist", do NOT emit list_hint:"errands". Only fill list_hint when there's a clear list/project word in the speech. Always strip the words "project" / "list" from the hint itself — the name is what goes in list_hint, not the label.

   "category" — exactly one of these strings:
   - "medications" — taking pills, doses, drug names, mg, "take my X" / "X in the morning". For this category, also fill optional "subgroup" with a time-of-day hint ("morning", "afternoon", "evening", "night") if mentioned, else null.
   - "errands" — pickups, drop-offs, calls, appointments (doctor, dentist, haircut), "stop by", "swing by"
   - "work" — meetings, deadlines, reports, emails, projects with a clear work/career framing
   - "home" — chores, cleaning, repairs, laundry, dishes, plants
   - "bills" — pay X, rent, utilities, taxes, subscriptions, insurance
   - "other" — anything that doesn't clearly fit the above

   Examples:
   - "I need to finish the report" → {"text": "Finish the report", "when": "today", "category": "work"}
   - "tomorrow I need to call the dentist" → {"text": "Call the dentist", "when": "tomorrow", "category": "errands"}
   - "on Monday pick up dry cleaning" → {"text": "Pick up dry cleaning", "when": "monday", "category": "errands"}
   - "I need to submit taxes by April 15th" → {"text": "Submit taxes", "when": "2026-04-15", "due_date": "2026-04-15", "category": "bills"}
   - "take my vitamin D in the morning" → {"text": "Vitamin D", "when": "today", "category": "medications", "subgroup": "morning"}
   - "do the laundry tonight" → {"text": "Do the laundry", "when": "today", "category": "home"}
   - "for the trip do book hotel and check passport" → two priorities, both with list_hint:"trip"
   - "concert at the Greek June 15 at 7pm" → {"text": "Concert at the Greek", "when": "2026-06-15", "due_date": "2026-06-15", "time": "19:00", "category": "other"}
   - "Saturday night drop off her parents at the airport, flight at 11, leave by 9" → {"text": "Drop off parents at airport", "when": "saturday", "time": "21:00", "category": "errands"}
   - "this weekend deliver more mail" → {"text": "Deliver more mail", "when": "saturday", "due_date": "<ISO of next Saturday>", "category": "errands"}
   - "for project Apollo I need to write the spec and ping Sam" → two priorities, both with list_hint:"project Apollo"

2. **groceries** — Items to buy, grouped by store. If no store is mentioned, use "General".
   Examples: "get milk from Costco", "spinach and mushrooms from the Indian store", "I need bananas"
   Group items by the store they mentioned. If they say "from Costco" then following items belong to Costco until they mention another store.
   SPEECH QUIRK: "by" and "buy" often sound identical in transcription; treat both as the verb "buy" (e.g. "from Trader Joe's by kale and celery" is the same as "from Trader Joe's buy kale and celery").
   FORMATTING: Each item name MUST be sentence case — first letter capitalized, the rest lowercase EXCEPT for proper nouns / brand names. Examples: "Milk", "Bell peppers", "Trader Joe's pasta", "Costco rotisserie chicken". Never return ALL-CAPS items, never return all-lowercase items.
   CANONICAL GROCERY EXAMPLES:
   - "from Trader Joe's buy kale and celery" → groceries: [{"store": "Trader Joe's", "items": ["Kale", "Celery"]}]
   - "at Costco I need milk, eggs, bread" → groceries: [{"store": "Costco", "items": ["Milk", "Eggs", "Bread"]}]

   CRITICAL DISAMBIGUATION — GROCERY vs TASK:
   Groceries are things to BUY from a store. Tasks (priorities) are things to DO. The phrase "I need" is ambiguous:
   - "I need MILK" → grocery (noun object, buy-context)
   - "I need TO call Sam" → priority (verb object, do-context)
   - "I need to finish the report" → priority
   - "I need tomatoes for dinner" → grocery (noun)
   The rule: if the word after "need"/"needs"/"want" is the word "to" followed by a verb, it is a TASK. If it is a noun (food, product), it is a GROCERY.

   CRITICAL DISAMBIGUATION — LIST / PROJECT TASKS vs GROCERIES:
   When the user says "for <project/list name>" followed by things to DO (verbs), those are PRIORITIES with list_hint set — NOT groceries. Only treat "for <store>" as grocery when the activity is buying.
   CONTRAST EXAMPLES:
   - "for my work list, finish the Q3 report and email Sam" → priorities: [{"text":"Finish the Q3 report","list_hint":"work",...}, {"text":"Email Sam","list_hint":"work",...}]. groceries: []. (Verbs finish/email → tasks, not groceries.)
   - "for project Apollo write the spec and ping Sam" → priorities: [{"text":"Write the spec","list_hint":"project Apollo",...}, {"text":"Ping Sam","list_hint":"project Apollo",...}]. groceries: [].
   - "for the Mexico trip book hotel, check passport, and buy sunscreen" → priorities: [{"text":"Book hotel","list_hint":"Mexico trip",...}, {"text":"Check passport","list_hint":"Mexico trip",...}]. groceries: [{"store":"General","items":["sunscreen"]}]. (Book/check → tasks, buy → grocery.)
   - "call dentist tomorrow, pay rent, meeting with Sam at 2pm" → priorities: 3 items, all verbs. groceries: [].
   - "add to my gym list: running shoes and water bottle" → groceries: []; priorities: [{"text":"Running shoes","list_hint":"gym",...}, {"text":"Water bottle","list_hint":"gym",...}]. ("add to list" is a list intent, items listed are things to acquire for that list — treat as priorities under the named list, NOT as groceries.)

   NEVER emit a grocery just because a store-like noun or the verb "need" appears. Require a BUY/GROCERY context (buy/bought/grab/pick up/shopping) AND the item to be a noun (not a verb).

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

9. **completions** — User saying they FINISHED, BOUGHT, TOOK, or want to CANCEL a task or grocery item.
   Emit one entry per phrase. Each entry: {"phrase": "<the noun phrase>", "type": "done" | "bought" | "taken" | "skip"}.
   - type "done"   — phrases: "I've done X", "I'm done with X", "completed X", "finished X", "X is done"
   - type "bought" — phrases: "I bought X", "I got X", "I picked up X", "grabbed X", "got X from <store>"
   - type "taken"  — phrases: "I took my X", "I've taken X", "took the X" (specifically for medications)
   - type "skip"   — phrases: "scratch X", "remove X", "skip X", "cancel X", "I'm skipping X today"
   The "phrase" field is JUST the noun (the thing they finished), not the verb, and not the store. Examples:
   - "I bought the milk and eggs" → completions: [{"phrase":"milk","type":"bought"}, {"phrase":"eggs","type":"bought"}]
   - "I bought celery and bread from Costco" → completions: [{"phrase":"celery","type":"bought"}, {"phrase":"bread","type":"bought"}] (NOT also a Costco grocery group)
   - "scratch the dentist appointment" → completions: [{"phrase":"dentist appointment","type":"skip"}]
   - "took my morning meds" → completions: [{"phrase":"morning meds","type":"taken"}]
   - "I finished the Q3 report" → completions: [{"phrase":"Q3 report","type":"done"}]
   CRITICAL: completions describe items that were ALREADY on the list. They are NOT new priorities AND NOT new groceries. When the user says "I bought / got / picked up" something, emit it ONLY in completions. Do NOT also add it to the "priorities" or "groceries" arrays. The app will check off the matching item. The only exception is if the user is EXPLICITLY adding a new shopping list ("I want to add to my list: …", "remind me to buy …"); past-tense "I bought" / "I got" is always a completion.

9C. **have_items** — User asserting PRESENT-TENSE state about what they currently have at home (typically reading off the fridge / pantry). DIFFERENT from completions:
   - "I bought X" → past-tense purchase action → completions with type "bought".
   - "I have X" / "I still have X" → present-tense state assertion → have_items.

   Each entry is an object: {"name": "<noun>", "qty_hint": "low" | "medium" | "high" | null, "qty_count": <integer|null>}

   Quantity rules:
   - qty_count: integer ≥ 1 ONLY when the user said a specific number ("three onions" → 3). Drop fractions ("half a gallon"), ranges ("two or three"), and non-numeric quantifiers ("a few" → null).
   - qty_hint (band):
     - "low" — user signaled running low: "only one X left", "running low on X", "almost out of X", "a couple X left", "queda poco X".
     - "high" — user signaled abundance: "plenty of X", "lots of X", "X is full", "X is good", "mucho X", "X lleno".
     - "medium" — explicit "enough" framing without abundance language: "I have enough X", "X is fine", "tengo suficiente X".
     - null — no quantity language.
   - Auto-rule: qty_count === 1 AND no other quantity language → set qty_hint = "low" (one of anything you'd inventory is realistically low).
   - For qty_count >= 2, leave qty_hint = null unless the user explicitly used low/medium/high language — we don't guess whether 3 onions is enough.

   English examples:
   - "I have eggs and butter" → [{"name":"eggs","qty_hint":null,"qty_count":null},{"name":"butter","qty_hint":null,"qty_count":null}]
   - "I have one grapefruit" → [{"name":"grapefruit","qty_hint":"low","qty_count":1}]
   - "three onions left" → [{"name":"onions","qty_hint":null,"qty_count":3}]
   - "two avocados" (within an "I have" context) → [{"name":"avocados","qty_hint":null,"qty_count":2}]
   - "running low on celery" → [{"name":"celery","qty_hint":"low","qty_count":null}]
   - "plenty of milk" → [{"name":"milk","qty_hint":"high","qty_count":null}]
   - "I have enough rice" → [{"name":"rice","qty_hint":"medium","qty_count":null}]
   - "I still have rice and pasta" → [{"name":"rice","qty_hint":null,"qty_count":null},{"name":"pasta","qty_hint":null,"qty_count":null}]
   - "in the fridge I've got milk, OJ, yogurt" → [{"name":"milk",…},{"name":"OJ",…},{"name":"yogurt",…}]
   - "about half a gallon of milk" → [{"name":"milk","qty_hint":null,"qty_count":null}] (non-integer dropped)

   Spanish examples:
   - "Tengo huevos y mantequilla" → [{"name":"huevos",…},{"name":"mantequilla",…}]
   - "Tengo solo un aguacate" → [{"name":"aguacate","qty_hint":"low","qty_count":1}]
   - "Tengo tres cebollas" → [{"name":"cebollas","qty_hint":null,"qty_count":3}]
   - "Queda poco arroz" → [{"name":"arroz","qty_hint":"low","qty_count":null}]
   - "Todavía tengo arroz y pasta" → [{"name":"arroz",…},{"name":"pasta",…}]

   GUARDRAILS — emit nothing in have_items for any of these:
   - Vague / collective phrases: "I have everything", "I have all my groceries", "I have lots of stuff" → have_items: []
   - Negation: "I don't have eggs" → groceries[] (need to buy), NOT have_items.
   - Past-tense purchase: "I bought milk" → completions, NOT have_items.
   - Tasks / non-grocery nouns: "I have a meeting at 3" → priorities, NOT have_items.
   - Bare possessions unrelated to pantry: "I have a car" → ignore.
   Items in have_items are ALSO NOT emitted in groceries[] or completions. The same noun never appears in two channels at once.

8. **plans** — DEPRECATED CHANNEL. Always return [] here. Time-anchored events (appointments, meals, meetups, travel, flights) now flow through **priorities** with the \`time\` and \`due_date\` fields set. Apply the temporal-reasoning rules below when populating priority \`time\` for events.

   TEMPORAL REASONING — THINK BEFORE YOU ASSIGN TIMES (applies to priority.time):
   1. What time-of-day context did the user provide? (morning/afternoon/evening/night/none)
   2. What specific times were mentioned? List them all internally.
   3. What is the logical relationship between the times? (e.g., "flight at 11, leave 2 hours before = leave at 9")
   4. Given the context, are these times AM or PM? (e.g., "night" context = PM, "flight at 11 at night" = 23:00, "leave at 9" in the same night context = 21:00)
   5. How many distinct events are there? (Don't split one event into multiple priorities)

   TIME FORMAT RULES:
   - ALWAYS output time in 24-hour format: 21:00 (not 9:00 PM), 14:00 (not 2:00 PM)
   - Context inheritance: if the user says "Saturday night" and then mentions times, ALL those times inherit the "night" (PM) context unless explicitly stated otherwise
   - Inference chain: "flight at 11" + "night" context = 23:00. "leave 2 hours before" = 21:00. Both inherit PM from "night."
   - Common sense: "breakfast" = morning. "lunch" = afternoon. "dinner" = evening. "flight at night" = PM.

   DEDUPLICATION: One described event = ONE priority. Don't split details into separate priorities.

RULES:
- Only include categories where you actually detect relevant content
- If something could be both a priority and a habit, ask: is it a one-time task (priority) or recurring (habit)?
- For groceries, be smart about grouping by store. Items mentioned after a store name belong to that store until another store is named.
- For journal content, preserve the user's voice but clean up speech artifacts (um, uh, like, you know)
- If the entire speech is just reflective/emotional, it's ALL journal content — don't force-extract priorities
- Return empty arrays/null for categories with no matching content
- ALWAYS include the "when" field for every priority task. Default to "today" if no date is mentioned.

9B. **REMINDERS** — When the user explicitly asks to be reminded ("remind me", "set a reminder", "ping me", "don't let me forget", etc.), set two extra fields on the relevant priority:
   - "remind_at_iso" — full ISO 8601 UTC timestamp the reminder should fire, using {TODAY} as the anchor. Convert FROM the user's timezone {USER_TZ} TO UTC. Example: user's TZ America/Los_Angeles, they say "remind me tomorrow at 10 am" and {TODAY} is 2026-04-23, emit "2026-04-24T17:00:00Z".
   - "reminder_phrase" — the literal time expression the user spoke, e.g. "tomorrow at 10 am" or "in 2 hours". Used for display + chrono-node fallback.
   If the user gave a time-anchored task WITHOUT "remind me" framing (e.g. "dinner at 7"), DO NOT set remind_at_iso — the time field alone handles that.
   Examples:
   - "remind me tomorrow at 10 to pick up the book" → priority with text:"Pick up the book", remind_at_iso:"2026-04-24T17:00:00Z" (PT → UTC), reminder_phrase:"tomorrow at 10"
   - "remind me in 30 minutes to take the laundry out" → reminder_phrase:"in 30 minutes", remind_at_iso computed
   - "dinner at 7" → time:"19:00", NO remind_at_iso

10. **notebook_slug** — When "journal" is a non-empty string, classify which notebook this journal content belongs in.
   Available notebooks (use the slug exactly):
{NOTEBOOK_CHOICES}
   - "journal" is the default / generic catch-all. Use it for general thoughts, reflections, daily stuff that doesn't clearly fit elsewhere.
   - "gratitude" — use when the content is primarily thankfulness, appreciation, or naming things the user is grateful for. Phrases like "I'm grateful / thankful for…", "I appreciate…".
   - "prompts" — use when the user is dictating a command block, prompt, instruction for an AI (Claude, Gemini, etc.), or something obviously meant to be copy-pasted verbatim. Phrases like "Prompt for Claude…", "tell Claude to…", "here's a prompt…", or enumerated step-by-step instructions meant for a machine.
   - Project notebooks (if listed above): use when the user explicitly names the project or when the content is clearly about that project.
   Also emit "notebook_confidence" as a number 0.0–1.0. Default to "journal" with confidence 0.5 when unsure. Omit ("journal" default) when "journal" itself is null.

Respond with ONLY valid JSON:
{"priorities": [{"text": "task", "when": "today", "category": "other", "subgroup": null, "list_hint": null, "due_date": null, "time": null, "remind_at_iso": null, "reminder_phrase": null}], "plans": [], "groceries": [], "intentions": [], "habits": [], "ideas": [], "gratitude": [], "journal": null, "completions": [], "have_items": [{"name": "item", "qty_hint": null, "qty_count": null}], "notebook_slug": "journal", "notebook_confidence": 0.8}`;

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

export type CaptureOrigin = 'groceries' | 'tasks' | 'auto';

export async function classifyCapture(
  speechText: string,
  opts?: {
    onTrace?: TraceFn;
    // Names of grocery items already on the user's list. Surfaced to the
    // model so it can match phrases like "I bought celery" against an
    // existing "Celery (1 bunch)" item and emit it as a completion
    // rather than duplicating it as a new grocery.
    existingGroceries?: string[];
    // Texts of priority items already on today's list. Same reasoning
    // for "I finished the Q3 report" matches against the existing item.
    existingPriorities?: string[];
    // Notebooks the user has. When provided, Gemini picks one to route
    // the journal content into. Include all active notebooks (system
    // + user project notebooks). When omitted, routing falls back to
    // the default "journal" slug.
    notebookChoices?: NotebookChoice[];
    // Soft routing hint: which tab the user was on when they tapped
    // the mic. Breaks ties for ambiguous nouns (e.g. "oranges and
    // milk" on /groceries → groceries; on /today → groceries still,
    // but the model knows the bias). Never overrides explicit
    // signals like "I bought" / "I have to".
    origin?: CaptureOrigin;
  },
): Promise<CaptureResult> {
  const onTrace = opts?.onTrace;
  const todayStr = toLocalDateStr(new Date());
  onTrace?.('classifyCapture: start', { chars: speechText.length });
  const { getLocale } = await import('./language');
  const langHint = getLocale() === 'es' ? '\nNote: The user is speaking in Mexican Spanish. Understand and classify accordingly, but return JSON keys in English as specified above.' : '';
  const groceriesHint =
    opts?.existingGroceries && opts.existingGroceries.length > 0
      ? `\n\nCURRENT GROCERY LIST (these can be checked off via completions): ${opts.existingGroceries.join(', ')}`
      : '';
  const prioritiesHint =
    opts?.existingPriorities && opts.existingPriorities.length > 0
      ? `\n\nCURRENT TASK LIST (these can be checked off via completions): ${opts.existingPriorities.join(', ')}`
      : '';
  // Build the NOTEBOOK_CHOICES block for the prompt. Always includes
  // the three system notebooks (journal/gratitude/prompts) if caller
  // didn't provide them, so the model always has a valid menu.
  const defaultChoices: NotebookChoice[] = [
    { slug: 'journal', name: 'Journal', hint: 'default / general thoughts' },
    { slug: 'gratitude', name: 'Gratitude', hint: 'thankfulness, appreciation' },
    { slug: 'prompts', name: 'Prompts', hint: 'command blocks for AI, verbatim copy-paste' },
  ];
  const choices = opts?.notebookChoices && opts.notebookChoices.length > 0
    ? opts.notebookChoices
    : defaultChoices;
  const notebookBlock = choices
    .map((c) => `     - "${c.slug}" (${c.name})${c.hint ? ` — ${c.hint}` : ''}`)
    .join('\n');
  const userTz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      : 'UTC';
  const originHint =
    opts?.origin === 'groceries'
      ? '\n\nUSER CONTEXT: The user was on the Groceries tab when they spoke. When intent is genuinely ambiguous between a task and a grocery, prefer the grocery routing. (Don\'t override unambiguous signals like "I have to call X" or "remind me" — only break ties this way.)'
      : opts?.origin === 'tasks'
      ? '\n\nUSER CONTEXT: The user was on a Tasks tab (Today / Lists / Upcoming) when they spoke. When intent is genuinely ambiguous between a task and a grocery, prefer the task routing. (Don\'t override unambiguous signals like "I bought" or "from <store>" — only break ties this way.)'
      : '';
  const prompt =
    ROUTER_PROMPT
      .replace('{TODAY}', todayStr)
      .replace('{USER_TZ}', userTz)
      .replace('{NOTEBOOK_CHOICES}', notebookBlock) +
    langHint +
    originHint +
    groceriesHint +
    prioritiesHint +
    `\n\nUser said:\n"${speechText}"\n\nRespond with JSON only.`;
  onTrace?.('classifyCapture: prompt built', { chars: prompt.length });
  // Route through callGeminiDetailed when we have a trace so the auth +
  // fetch milestones inside geminiClient flow into the same timeline.
  let text: string;
  if (onTrace) {
    const detailed = await callGeminiDetailed('gemini-2.5-flash', prompt, { timeoutMs: 25000, onTrace });
    text = detailed.text;
  } else {
    text = await callGemini('gemini-2.5-flash', prompt, 25000);
  }
  onTrace?.('classifyCapture: response received', { chars: text.length });
  const parsed = parseJsonResponse<Record<string, unknown>>(text, {});
  onTrace?.('classifyCapture: parsed json');

  // Normalize priorities — handle string[], {text, when}[], and the new
  // {text, when, category, subgroup, list_hint?, due_date?, time?}[] shapes.
  // Default category to 'other' for older Gemini responses or malformed
  // entries. Routing-hint fields are all optional.
  let priorities: PriorityTask[] = [];
  if (Array.isArray(parsed.priorities)) {
    priorities = parsed.priorities.map((p: unknown): PriorityTask => {
      if (typeof p === 'string') {
        return { text: p, when: 'today', category: 'other', subgroup: null };
      }
      if (p && typeof p === 'object') {
        const obj = p as Record<string, unknown>;
        const due =
          typeof obj.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.due_date)
            ? obj.due_date
            : null;
        const rawRemind =
          typeof obj.remind_at_iso === 'string' && obj.remind_at_iso.trim()
            ? obj.remind_at_iso.trim()
            : null;
        // Quick sanity check: require a Date-parseable string. Anything
        // malformed gets dropped — the caller / preview sheet can then
        // fall back to chrono-node on reminder_phrase.
        const remindAtIso = rawRemind && !isNaN(Date.parse(rawRemind)) ? rawRemind : null;
        return {
          text: typeof obj.text === 'string' ? obj.text : String(obj.text || ''),
          when: typeof obj.when === 'string' ? obj.when : 'today',
          category: isCategory(obj.category) ? obj.category : 'other',
          subgroup: typeof obj.subgroup === 'string' ? obj.subgroup : null,
          list_hint:
            typeof obj.list_hint === 'string' && obj.list_hint.trim()
              ? obj.list_hint.trim()
              : null,
          due_date: due,
          time:
            typeof obj.time === 'string' && obj.time.trim() ? obj.time.trim() : null,
          remind_at_iso: remindAtIso,
          reminder_phrase:
            typeof obj.reminder_phrase === 'string' && obj.reminder_phrase.trim()
              ? obj.reminder_phrase.trim()
              : null,
        };
      }
      return { text: String(p), when: 'today', category: 'other', subgroup: null };
    });
  }

  // Normalize completions — drop malformed entries (no phrase or bad type).
  let completions: CompletionIntent[] = [];
  if (Array.isArray(parsed.completions)) {
    completions = parsed.completions
      .map((c: unknown): CompletionIntent | null => {
        if (!c || typeof c !== 'object') return null;
        const obj = c as Record<string, unknown>;
        if (typeof obj.phrase !== 'string' || !obj.phrase.trim()) return null;
        if (!isCompletionType(obj.type)) return null;
        return { phrase: obj.phrase.trim(), type: obj.type };
      })
      .filter((c): c is CompletionIntent => c !== null);
  }

  // Normalize have_items. Accepts both shapes for back-compat:
  //   - string[]                                   (legacy / regex fallback)
  //   - Array<{name, qty_hint?, qty_count?}>       (new structured)
  // Output is always the structured shape. Trim + case-insensitive
  // dedupe + cap at 50.
  const have_items: Array<{
    name: string;
    qty_hint: 'low' | 'medium' | 'high' | null;
    qty_count: number | null;
  }> = [];
  const isQtyHint = (v: unknown): v is 'low' | 'medium' | 'high' =>
    v === 'low' || v === 'medium' || v === 'high';
  if (Array.isArray(parsed.have_items)) {
    const seen = new Set<string>();
    for (const raw of parsed.have_items as unknown[]) {
      let name: string;
      let qty_hint: 'low' | 'medium' | 'high' | null = null;
      let qty_count: number | null = null;
      if (typeof raw === 'string') {
        name = raw.trim();
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.name !== 'string') continue;
        name = obj.name.trim();
        if (isQtyHint(obj.qty_hint)) qty_hint = obj.qty_hint;
        if (typeof obj.qty_count === 'number' && Number.isInteger(obj.qty_count) && obj.qty_count >= 1) {
          qty_count = obj.qty_count;
        }
      } else {
        continue;
      }
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Auto-derive: a count of exactly 1 with no other quantity
      // language is universally "running low." Higher counts leave
      // qty_hint alone — 3 onions might be high or low depending
      // on item; we don't second-guess.
      if (qty_count === 1 && qty_hint === null) qty_hint = 'low';
      have_items.push({ name, qty_hint, qty_count });
      if (have_items.length >= 50) break;
    }
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

  const rawSlug = typeof parsed.notebook_slug === 'string' ? parsed.notebook_slug.trim().toLowerCase() : null;
  const validSlugs = new Set(choices.map((c) => c.slug));
  const notebookSlug = rawSlug && validSlugs.has(rawSlug) ? rawSlug : (typeof parsed.journal === 'string' ? 'journal' : null);
  const rawConf = typeof parsed.notebook_confidence === 'number' ? parsed.notebook_confidence : 0.5;
  const notebookConfidence = Math.max(0, Math.min(1, rawConf));

  // ── Reminder time sanity check ──
  // Gemini's TZ math is unreliable — it regularly emits remind_at_iso
  // 7-9 hours off because it confuses UTC with the user's local tz.
  // When we have a reminder_phrase, run chrono-node ON THE CLIENT
  // (uses the browser's local timezone) and let its result override
  // Gemini's ISO. chrono handles "in 5 minutes" / "tomorrow at 10"
  // / "next Friday at 3pm" correctly relative to the client's wall
  // clock. Fall back to Gemini's ISO only if chrono fails AND Gemini's
  // value looks sane (not >1h in the past).
  try {
    const { parseTimePhrase } = await import('./reminderParse');
    const nowMs = Date.now();
    for (const p of priorities) {
      const phrase = p.reminder_phrase ?? null;
      const geminiIso = p.remind_at_iso ?? null;
      if (phrase) {
        const parsed = parseTimePhrase(phrase);
        if (parsed) {
          p.remind_at_iso = parsed.iso;
          continue;
        }
      }
      if (geminiIso) {
        const t = Date.parse(geminiIso);
        // If it's >1h in the past relative to now, assume Gemini's
        // TZ math was wrong; drop so cron doesn't fire immediately.
        if (!isNaN(t) && t < nowMs - 60 * 60 * 1000) {
          p.remind_at_iso = null;
        }
      }
    }
  } catch {
    // chrono load failed — leave Gemini's values as-is.
  }

  // ── Cross-channel dedupe ─────────────────────────────────────
  // Defense-in-depth: the prompt tells Gemini "the same noun never
  // appears in two channels at once" but the model occasionally
  // double-emits (e.g. "beetroot. I have one beetroot." → both
  // groceries[] and have_items[]). The regex fallback can also
  // double-emit when a transcript has a HAVE-cue line and a separate
  // grocery-cue line referencing the same noun. have_items wins
  // because it carries qty/state info; the bare grocery emit is
  // dropped.
  //
  // Conservative: case-insensitive exact-match only. "beetroot" and
  // "red beetroot" stay as two separate items (different specifications).
  let dedupedGroceries = groceries;
  let dedupedCompletions = completions;
  if (have_items.length > 0) {
    const haveNames = new Set(
      have_items.map((h) => h.name.trim().toLowerCase()),
    );
    if (groceries.length > 0) {
      dedupedGroceries = groceries
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (item) => !haveNames.has(item.trim().toLowerCase()),
          ),
        }))
        .filter((g) => g.items.length > 0);
    }
    if (completions.length > 0) {
      dedupedCompletions = completions.filter(
        (c) => !haveNames.has(c.phrase.trim().toLowerCase()),
      );
    }
  }

  return {
    priorities,
    plans,
    groceries: dedupedGroceries,
    intentions: Array.isArray(parsed.intentions) ? parsed.intentions as string[] : [],
    habits: Array.isArray(parsed.habits) ? parsed.habits as string[] : [],
    ideas: Array.isArray(parsed.ideas) ? parsed.ideas as string[] : [],
    gratitude: Array.isArray(parsed.gratitude) ? parsed.gratitude as string[] : [],
    journal: typeof parsed.journal === 'string' ? parsed.journal : null,
    completions: dedupedCompletions,
    have_items,
    notebook_slug: notebookSlug,
    notebook_confidence: notebookConfidence,
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
    result.completions.length > 0 ||
    result.have_items.length > 0 ||
    (result.journal !== null && result.journal.trim().length > 0)
  );
}

// ─── Destination resolver ─────────────────────────────────────────────
//
// Used by CapturePreviewSheet to decide where each priority should go
// by default. The user can override in the dropdown before saving.
//
//   - 'today'    → write to legacy priorityStore.items (per-day row)
//   - 'upcoming' → write to tasks table with list_id = null + due_date
//                  set; surfaces only in the Upcoming tab. This is the
//                  home for dated events ("Concert June 15") that don't
//                  belong to a project list.
//   - 'list'     → write to tasks table with list_id = listId
//   - 'new-list' → create a list named newName, then write to tasks
//
// Defaulting rules:
//   - If list_hint matches an existing list (case-insensitive substring
//     in either direction), pick that list.
//   - Else if list_hint is non-empty, propose 'new-list' with the hint
//     as the proposed name.
//   - Else if due_date is set and is strictly in the future, pick
//     'upcoming' (the canonical home for dated events; Inbox stays a
//     pure triage queue for undated stuff).
//   - Else 'today'.

export type Destination =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'list'; listId: string }
  | { kind: 'new-list'; newName: string };

export function resolveDestination(
  item: {
    list_hint?: string | null;
    due_date?: string | null;
    remind_at_iso?: string | null;
  },
  lists: ListRecord[],
  todayStr?: string,
): Destination {
  const hint = (item.list_hint ?? '').trim().toLowerCase();
  if (hint) {
    const match = lists.find((l) => {
      const name = l.name.toLowerCase();
      return name.includes(hint) || hint.includes(name);
    });
    if (match) return { kind: 'list', listId: match.id };
    return { kind: 'new-list', newName: item.list_hint!.trim() };
  }
  // Reminder-carrying tasks ALWAYS land in the tasks table (via the
  // 'upcoming' destination) so pg_cron can see remind_at. The legacy
  // daily_priorities table has no reminder columns, so 'today' would
  // silently drop the reminder.
  if (item.remind_at_iso) return { kind: 'upcoming' };
  const today = todayStr ?? toLocalDateStr(new Date());
  if (item.due_date && item.due_date > today) {
    return { kind: 'upcoming' };
  }
  return { kind: 'today' };
}

// ─── Intent-aware capture fallback ────────────────────────────────────
//
// Used when Gemini either throws or returns hasContent=false. Looks at
// the raw transcript and decides whether the user was speaking
// GROCERIES, TASKS, or neither, then produces a CaptureResult shaped
// accordingly. The prior version of this helper always returned
// groceries — which turned every failed classification into a phantom
// "General" grocery item, even when the user was clearly dictating
// tasks. This intent-aware version never silently routes the wrong
// way; the worst case is a single Inbox-bound priority carrying the
// raw transcript so the user can re-route it in the preview sheet.
//
// Signal vocabulary is intentionally conservative. False positives
// are worse than false negatives because a mislabel here is what gets
// shown to the user in the preview — better to over-use "priority"
// than to over-use "grocery" (tasks are trivially re-routeable in the
// preview; groceries have a store slot that's awkward to override).
const FILLER_VERBS = /\b(?:buy|by|get|got|grab|grabbed|pick(?:\s+up)?|picked\s+up|need|needs|needed|want|wanted)\b/i;

// "buy" / "grabbed" / "from <store>" / "at <store>" — clear grocery
// cues. A raw "need X" alone is NOT enough because "I need to call
// Sam" is not grocery.
const GROCERY_CUES = /\b(?:buy|bought|by|grab|grabbed|pick(?:\s+up)?|picked\s+up|groceries|grocery|shopping\s+list)\b/i;
const STORE_CUES = /\b(?:from|at)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9'&\s]{1,40}?)(?=[,:]|\s+(?:buy|by|get|got|grab|grabbed|pick|picked|need|needs|needed|want|wanted|I)\b|$)/i;

// Present-tense "I have X" / "we have X" / Spanish "tengo X" — the
// have-flow surface. Negative lookahead on "have to" so "I have to
// call mom" still falls through to TASK_CUES. Order matters in the
// fallback router: HAVE_CUES is checked BEFORE TASK_CUES because
// "I have to" overlaps with naive "I have" matching.
const HAVE_CUES = /\b(?:i\s+(?:still\s+)?have|we\s+(?:still\s+)?have|tengo|tenemos|todavía\s+(?:tengo|tenemos))\b(?!\s+to\b)/i;

// "need to / have to / gotta / call / email / finish / submit /
// schedule / meeting with / pay" — task verbs. Matching any of these
// anywhere in the transcript pushes the fallback toward priorities.
const TASK_CUES =
  /\b(?:need\s+to|needs\s+to|have\s+to|has\s+to|gotta|got\s+to|must|should|call|calling|email|emailing|text|texting|message|finish|finishing|submit|submitting|send|sending|write|writing|review|reviewing|meet(?:ing)?\s+with|schedule|pay(?:ing)?|book|booking|draft|drafting|prep(?:are)?|update|file|follow\s+up|ping)\b/i;

// "for project X" / "for my X list" / "add to my X list" / bare
// "project X" / "on project X" — hints that items should be grouped
// under a named list / project. Stops as soon as a task verb appears
// so "for the Mexico trip book hotel" captures "Mexico trip", not
// "Mexico trip book hotel". Handles dictation ellipses between
// "project" and the name ("project...Wellbloom" → "Wellbloom").
const LIST_HINT_CUES =
  /(?:\bfor\s+(?:my\s+)?(?:the\s+)?(?:project\s+|list\s+)?|\bon\s+(?:my\s+|project\s+|the\s+)|\bin\s+(?:my\s+|project\s+|the\s+)|\badd(?:ing)?\s+to\s+(?:my\s+)?|\bunder\s+(?:my\s+)?|(?:^|[,.;:!?\u2014\u2013\-]\s*|\s+)(?:project|list)[:\s.\u2026]+)([A-Za-z][A-Za-z0-9'&\s]{1,40}?)(?:\s+list|\s+project|(?=[,:.]|\s+I\s|\s+(?:need|needs|have|has|gotta|got|must|should|call|calling|email|emailing|text|texting|message|finish|finishing|submit|submitting|send|sending|write|writing|review|reviewing|meet|schedule|pay|book|booking|draft|drafting|prep|update|file|follow|ping|buy|by|get|got|grab|grabbed|pick|picked)\b|$))/i;

// Hint-captured names that are common stop-words mean the regex
// gobbled the wrong thing (e.g. "I have a project to finish" would
// otherwise capture "to"). Drop them so we don't route to a phantom
// "to" list.
const HINT_STOP_WORDS = new Set([
  'to', 'of', 'the', 'a', 'an', 'for', 'from', 'with',
  'on', 'at', 'in', 'by', 'and', 'or', 'but', 'so',
]);

// Stripped off the front of split fragments (tasks + grocery items) so
// a trailing conjunction in the split regex doesn't leave "and bread"
// or "then go home" showing up in the UI.
const LEADING_CONJUNCTION = /^(?:and|then|also|or|plus)\s+/i;

// Extract items from the body when we know they're grocery-shaped.
// Reused by the grocery branch; exported so tests can verify directly.
export function parseGroceryFallback(text: string): GroceryStore[] {
  const raw = text.trim();
  if (!raw) return [];

  const storeMatch = raw.match(STORE_CUES);
  const store = storeMatch ? storeMatch[1].trim().replace(/\s+/g, ' ') : 'General';

  let body = raw;
  if (storeMatch) body = body.replace(storeMatch[0], ' ');
  body = body
    .replace(FILLER_VERBS, ' ')
    .replace(/\b(?:i|please|also|too|some|a|an|the)\b/gi, ' ')
    .replace(/[.!?;:]/g, ' ')
    .trim();

  const items = body
    .split(/\s*,\s*|\s+and\s+|\s+then\s+/i)
    .map((s) =>
      s
        .trim()
        .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
        .replace(LEADING_CONJUNCTION, ''),
    )
    .filter((s) => s.length > 0 && /[a-z0-9]/i.test(s));

  if (items.length === 0) {
    return [{ store: 'General', items: [raw] }];
  }
  return [{ store, items }];
}

// Splits body text into multiple task fragments. Handles "and", "then",
// commas, semicolons, and clause-starting "also". Each fragment becomes
// one priority.
function splitTasks(body: string): string[] {
  return body
    .split(/\s*(?:,|;|\s+and\s+|\s+then\s+|\s+also\s+)\s*/i)
    .map((s) =>
      s
        .trim()
        // Strip leading AND trailing punctuation (dots/dashes/ellipses)
        // so dictation residue ("...finish the spec") renders clean.
        .replace(/^[-–—.\s\u2026]+|[-–—\s.!?;:\u2026]+$/g, '')
        .replace(LEADING_CONJUNCTION, ''),
    )
    .filter((s) => s.length > 1 && /[a-z0-9]/i.test(s));
}

// Detect "remind me" / "set a reminder" framing in raw transcript.
// Used both by parseIntentFallback (Gemini-failed path) and by the
// UI as a safety net.
const REMINDER_CUES = /\b(?:remind(?:\s+me)?|set\s+(?:a\s+)?reminder|don'?t\s+(?:let\s+me\s+)?forget|ping\s+me)\b/i;

function extractReminderFromText(text: string): { iso: string; phrase: string } | null {
  // Lazy-load chrono so this module stays sync-safe where it was
  // before. `require` is available here since the file is consumed in
  // Next's Node/Edge runtime + client bundles via webpack.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chrono = require('chrono-node') as typeof import('chrono-node');
    const results = chrono.parse(text, new Date(), { forwardDate: true });
    if (results.length === 0) return null;
    const r = results[0];
    const d = r.start.date();
    if (!d || isNaN(d.getTime())) return null;
    return { iso: d.toISOString(), phrase: r.text };
  } catch {
    return null;
  }
}

/** Parse a "have-flow" line into bare have_items entries. The
 *  fallback can't extract specific quantities (no NLP); every item
 *  emerges with qty_hint=null + qty_count=null. Reuses the grocery
 *  splitter's tokenizer for comma/and-separated nouns. */
export function parseHaveFallback(
  text: string,
): Array<{ name: string; qty_hint: null; qty_count: null }> {
  const raw = text.trim();
  if (!raw) return [];
  // Strip the leading "I have" / "we still have" / "tengo" framing
  // and any filler so we're left with just the noun list.
  const stripped = raw
    .replace(HAVE_CUES, ' ')
    .replace(FILLER_VERBS, ' ')
    .replace(/\b(?:i|we|please|also|too|some|a|an|the|left|in|the|fridge|pantry)\b/gi, ' ')
    .replace(/[.!?;:]/g, ' ')
    .trim();
  const items = stripped
    .split(/\s*,\s*|\s+and\s+|\s+then\s+|\s+y\s+/i)
    .map((s) =>
      s.trim().replace(/^[-–—\s]+|[-–—\s]+$/g, '').replace(LEADING_CONJUNCTION, ''),
    )
    .filter((s) => s.length > 0 && /[a-z0-9]/i.test(s));
  return items.map((name) => ({ name, qty_hint: null, qty_count: null }));
}

// Main entry point. Returns a CaptureResult that represents our best
// structural guess given only regex heuristics. Callers SHOULD prefer
// the Gemini-classified result when available; this exists for the
// failure path only.
//
// `origin` is a soft routing tiebreaker: when the line has no clear
// HAVE/TASK/GROCERY signal but the user was on /groceries when they
// spoke, prefer grocery routing (otherwise we'd default to a single
// priority and dump grocery dictation into Tasks — the bug the user
// hit).
export function parseIntentFallback(
  text: string,
  origin: CaptureOrigin = 'auto',
): CaptureResult {
  const empty: CaptureResult = {
    priorities: [],
    plans: [],
    groceries: [],
    intentions: [],
    habits: [],
    ideas: [],
    gratitude: [],
    journal: null,
    completions: [],
    have_items: [],
    notebook_slug: null,
    notebook_confidence: 0.5,
  };
  const raw = text.trim();
  if (!raw) return empty;

  // Gemini-failed reminder path: if the user said "remind me / set
  // a reminder / don't forget" AND chrono can extract a time,
  // emit a single reminder-carrying priority so the task still
  // lands in the tasks table with remind_at populated. Preserves
  // the user's intent even when the main classifier is down.
  const hasReminderCue = REMINDER_CUES.test(raw);
  const reminder = hasReminderCue ? extractReminderFromText(raw) : null;
  if (reminder) {
    // Strip the reminder framing + the time phrase from the task
    // text so we don't end up with "Set a reminder at 5pm to wash
    // clothes" as the task name. Keep the remaining imperative.
    let body = raw
      .replace(REMINDER_CUES, ' ')
      .replace(reminder.phrase, ' ')
      .replace(/\b(?:to|that|i|please|at|in|on)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!body) body = 'Reminder';
    // Capitalize first letter for display
    body = body.charAt(0).toUpperCase() + body.slice(1);
    return {
      ...empty,
      priorities: [
        {
          text: body,
          when: 'today',
          category: 'other',
          subgroup: null,
          list_hint: null,
          due_date: null,
          time: null,
          remind_at_iso: reminder.iso,
          reminder_phrase: reminder.phrase,
        },
      ],
    };
  }

  // HAVE_CUES wins FIRST — "I have eggs and milk" should land in
  // have_items, not as priorities (the bug the user hit when Gemini
  // was rate-limited). Negative-lookahead on "have to" inside
  // HAVE_CUES means imperative tasks ("I have to call mom") still
  // fall through to the TASK_CUES branch below.
  const hasHaveCue = HAVE_CUES.test(raw);
  if (hasHaveCue) {
    const items = parseHaveFallback(raw);
    if (items.length > 0) {
      return { ...empty, have_items: items };
    }
  }

  const hasGroceryCue = GROCERY_CUES.test(raw) || STORE_CUES.test(raw);
  const hasTaskCue = TASK_CUES.test(raw);
  const listHintMatch = raw.match(LIST_HINT_CUES);
  let listHint = listHintMatch ? listHintMatch[1].trim().replace(/\s+/g, ' ') : null;
  // If the regex gobbled a stop-word (happens on "I have a project to
  // finish" → captures "to"), drop the hint so we don't create a
  // phantom list.
  if (listHint && HINT_STOP_WORDS.has(listHint.toLowerCase())) {
    listHint = null;
  }

  // TASK CUE WINS if both are present — "for the trip buy sunscreen
  // and book hotel" is two tasks about the trip, not one grocery
  // under a store. The preview sheet still surfaces the raw
  // transcript so the user can re-route if we got it wrong, but we
  // never silently drop tasks into groceries.
  if (hasTaskCue) {
    // Strip list-hint phrase from the body so the extracted tasks
    // don't contain "for my work list" in their text.
    let body = raw;
    if (listHintMatch) body = body.replace(listHintMatch[0], ' ');
    const fragments = splitTasks(body);
    const priorities: PriorityTask[] =
      fragments.length > 0
        ? fragments.map((f) => ({
            text: f,
            when: 'today',
            category: 'other',
            subgroup: null,
            list_hint: listHint,
            due_date: null,
            time: null,
          }))
        : [
            {
              text: raw,
              when: 'today',
              category: 'other',
              subgroup: null,
              list_hint: listHint,
              due_date: null,
              time: null,
            },
          ];
    return { ...empty, priorities };
  }

  if (hasGroceryCue) {
    return { ...empty, groceries: parseGroceryFallback(raw) };
  }

  // Origin tiebreaker: no HAVE/TASK/GROCERY cue matched, but the
  // user was on /groceries when they spoke. Treat the line as
  // groceries (unchecked) rather than dumping into Tasks. Avoids
  // the failure mode where a Gemini outage routes "celery, mangoes,
  // carrots" to Tasks just because none of the verbs matched.
  if (origin === 'groceries') {
    const items = parseGroceryFallback(raw);
    if (items.length > 0) {
      return { ...empty, groceries: items };
    }
  }

  // No strong signal. Drop the transcript as a SINGLE Inbox-bound
  // priority so the user's words land somewhere actionable and they
  // can re-route / split / delete in the preview. Explicitly NOT a
  // grocery — this was the bug that prompted the rebuild.
  return {
    ...empty,
    priorities: [
      {
        text: raw,
        when: 'today',
        category: 'other',
        subgroup: null,
        list_hint: listHint,
        due_date: null,
        time: null,
      },
    ],
  };
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
