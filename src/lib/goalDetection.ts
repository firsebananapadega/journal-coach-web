// Post-entry intention detection using Gemini
// Called AFTER the user finishes an entry (voice or template)
// Never interrupts the flow — only surfaces on the review/save screen
//
// IMPORTANT: We detect INTENTIONS, not goals.
// Intention = directional, identity-based: "Be more present", "Invite stillness"
// Goal = outcome-based, measurable: "Save $10K", "Get promoted", "Lose 20 lbs"
// We ONLY capture intentions. Goals are never stored.

import { callGemini, parseJsonResponse } from './geminiClient';

export interface DetectedGoal {
  title: string;
  reflection: string;
}

const INTENTION_DETECTION_PROMPT = `You are analyzing a journal entry to detect if the person expressed a DIRECTION they want to move in — an intention, not a goal.

CRITICAL DISTINCTION:
- An INTENTION is about how someone wants to SHOW UP or BE. It's directional, open-ended, identity-based.
  Examples: "Be more present with my family", "Invite more stillness into my day", "Listen more, fix less", "Be kinder to myself", "Slow down when I feel rushed"
- A GOAL is about what someone wants to ACHIEVE or GET. It's outcome-based, measurable, time-bound.
  Examples: "Save $10,000", "Get a promotion", "Lose 20 lbs", "Integrate passion projects with financial stability", "Launch my business by June"

You ONLY detect intentions. NEVER detect goals. If someone says "I want to make more money" — that's a goal, ignore it. If someone says "I want to feel less anxious about money" — that's an intention about how they want to feel.

Look for language that signals an intention to shift how they live:
- "I want to be more..." / "I want to feel more..."
- "I need to slow down..." / "I wish I could just..."
- "I keep forgetting to..." (implies wanting to be more mindful)
- "What matters most to me is..." (values signal)
- "I want to show up differently..." / "I want to stop..."

Do NOT flag:
- Career goals, financial targets, fitness metrics
- Project plans, deadlines, milestones
- Anything that could have a number or completion date attached to it
- Vague complaints without a directional desire

If you detect a genuine intention, respond with JSON:
{"detected": true, "title": "Frame as an invitation to hold, starting with a verb about BEING — e.g. 'Be more present with family', 'Invite more rest', 'Listen before reacting'. Never frame as an outcome to achieve.", "reflection": "A warm, one-sentence observation that mirrors what matters to them. Not advice."}

If no intention is detected (including if you only detect goals), respond with:
{"detected": false}

ONLY return valid JSON. Nothing else.`;

export async function detectGoalInText(entryText: string): Promise<DetectedGoal | null> {
  try {
    if (!entryText.trim()) return null;

    const prompt = `${INTENTION_DETECTION_PROMPT}\n\nJournal entry:\n"${entryText}"`;
    const text = await callGemini('gemini-2.5-flash', prompt, 10000);
    const parsed = parseJsonResponse<any>(text, { detected: false });

    if (parsed.detected && parsed.title) {
      return { title: parsed.title, reflection: parsed.reflection || '' };
    }
    return null;
  } catch {
    return null;
  }
}
