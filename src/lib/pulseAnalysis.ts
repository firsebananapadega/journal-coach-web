import { callGemini, parseJsonResponse } from '@/lib/geminiClient';
import { getLanguage, getLocale } from '@/lib/language';
import type { JournalEntry } from '@/stores/journalStore';

export interface PulseAnalysis {
  wentRightThemes: string[];
  improvementThemes: string[];
  intentionThemes: string[];
  insight: string;
  analyzedCount: number;
  generatedAt: string;
}

const CACHE_KEY = 'pulse_analysis';

export function getCachedPulseAnalysis(currentCount: number): PulseAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as PulseAnalysis;
    if (currentCount - cached.analyzedCount >= 3) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function generatePulseAnalysis(
  pulseEntries: JournalEntry[]
): Promise<PulseAnalysis> {
  if (pulseEntries.length < 3) {
    throw new Error('Need at least 3 pulse entries to analyze');
  }

  const summaries = pulseEntries.map((e) => {
    const date = new Date(e.created_at).toLocaleDateString(getLanguage(), {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const meta = e.metadata as Record<string, string> | null;
    const mode = meta?.pulseMode || 'unknown';

    if (mode === 'morning') {
      return `${date} (morning):\n  Intention: ${meta?.intention || '(empty)'}`;
    } else if (mode === 'evening') {
      return `${date} (evening):\n  Went right: ${meta?.wentRight || '(empty)'}\n  Could do better: ${meta?.doneBetter || '(empty)'}`;
    }
    // Legacy format (alive/drained)
    return `${date}:\n  Alive: ${meta?.alive || '(empty)'}\n  Drained: ${meta?.drained || '(empty)'}`;
  });

  const locale = getLocale();
  const langDirective =
    locale === 'es'
      ? '\nIMPORTANT: Respond entirely in Mexican Spanish (español mexicano).\n'
      : '';

  const prompt = `You are analyzing a person's daily pulse journal. They answer different questions morning and evening:
- Morning: "What would make today feel like a win?" (their intention)
- Evening: "What went right today?" and "What could you have done better?"

Here are their entries (newest first):
${summaries.join('\n\n')}

Analyze their patterns and respond as JSON only:
{
  "wentRightThemes": ["theme1", "theme2", ...],  // 3-5 recurring patterns in what goes well for them
  "improvementThemes": ["theme1", "theme2", ...], // 3-5 recurring areas they want to improve
  "intentionThemes": ["theme1", "theme2", ...], // 3-5 recurring themes in their morning intentions
  "insight": "2-3 paragraph analysis (under 200 words) of patterns you see: what consistently goes well, what they keep wanting to improve, whether their intentions connect to their outcomes, and any growth you notice. Be specific. Write in second person (you)."
}
${langDirective}
Respond with valid JSON only. No markdown fences.`;

  const text = await callGemini('gemini-2.5-flash', prompt, 30000);
  const fallback: PulseAnalysis = {
    wentRightThemes: [],
    improvementThemes: [],
    intentionThemes: [],
    insight: '',
    analyzedCount: pulseEntries.length,
    generatedAt: new Date().toISOString(),
  };

  const parsed = parseJsonResponse<Omit<PulseAnalysis, 'analyzedCount' | 'generatedAt'>>(
    text,
    { wentRightThemes: [], improvementThemes: [], intentionThemes: [], insight: '' }
  );

  const result: PulseAnalysis = {
    ...parsed,
    analyzedCount: pulseEntries.length,
    generatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch { /* quota exceeded */ }

  return result;
}
