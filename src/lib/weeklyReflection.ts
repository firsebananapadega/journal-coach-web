import { callGemini } from '@/lib/geminiClient';

export interface WeeklyReflectionData {
  weekKey: string;
  letter: string;
  themes: string[];
  generatedAt: string;
}

/** Returns ISO week string like "2026-W14" */
export function getWeekKey(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  // ISO week: Thursday determines the week
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

interface EntryInput {
  created_at: string;
  mood_label?: string | null;
  entry_type: string;
  content_text?: string | null;
}

export async function generateWeeklyReflection(
  entries: EntryInput[],
  userName: string,
  guideName: string
): Promise<WeeklyReflectionData> {
  if (entries.length < 3) {
    throw new Error('Need at least 3 entries to generate a weekly reflection');
  }

  const weekKey = getWeekKey();

  // Build entry summaries
  const summaries = entries.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const mood = e.mood_label || 'unspecified';
    const snippet = (e.content_text || '').substring(0, 500);
    return `- ${date} | mood: ${mood} | type: ${e.entry_type}\n  "${snippet}"`;
  });

  const letterPrompt = `You are ${guideName}, a warm and encouraging journaling guide. Write a personal weekly reflection letter to ${userName || 'your journaler'}.

Here are their journal entries from the past week:
${summaries.join('\n\n')}

Instructions:
- Write a warm, personal letter identifying patterns and growth you notice
- Sign the letter as ${guideName}
- End with one reflective question
- Keep under 200 words
- Do NOT use markdown formatting, just plain text with line breaks`;

  const themesPrompt = `Extract 3-5 key themes (single words or short phrases) from these journal entries. Return ONLY a JSON array of strings, nothing else.

Entries:
${summaries.join('\n\n')}`;

  // Run both in parallel
  const [letterText, themesText] = await Promise.all([
    callGemini('gemini-2.0-flash', letterPrompt),
    callGemini('gemini-2.0-flash', themesPrompt),
  ]);

  // Parse themes
  let themes: string[] = [];
  try {
    const cleaned = themesText.replace(/```json\n?|\n?```/g, '').trim();
    themes = JSON.parse(cleaned);
    if (!Array.isArray(themes)) themes = [];
  } catch {
    themes = [];
  }

  const reflection: WeeklyReflectionData = {
    weekKey,
    letter: letterText,
    themes,
    generatedAt: new Date().toISOString(),
  };

  // Cache it
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      `weekly_reflection_${weekKey}`,
      JSON.stringify(reflection)
    );
  }

  return reflection;
}

export function getCachedReflection(): WeeklyReflectionData | null {
  if (typeof window === 'undefined') return null;
  const weekKey = getWeekKey();
  const cached = localStorage.getItem(`weekly_reflection_${weekKey}`);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as WeeklyReflectionData;
  } catch {
    return null;
  }
}
