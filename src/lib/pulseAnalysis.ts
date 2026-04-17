import { callGemini, parseJsonResponse } from '@/lib/geminiClient';
import { getLanguage, getLocale } from '@/lib/language';
import type { JournalEntry } from '@/stores/journalStore';

export interface PulseAnalysis {
  aliveThemes: string[];
  drainedThemes: string[];
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
    // Stale if count has grown by 3+
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
    const meta = e.metadata as { alive?: string; drained?: string } | null;
    return `${date}:\n  Alive: ${meta?.alive || '(empty)'}\n  Drained: ${meta?.drained || '(empty)'}`;
  });

  const locale = getLocale();
  const langDirective =
    locale === 'es'
      ? '\nIMPORTANT: Respond entirely in Mexican Spanish (español mexicano).\n'
      : '';

  const prompt = `You are analyzing a person's daily pulse journal — each day they noted what made them feel most alive and what drained them.

Here are their entries (newest first):
${summaries.join('\n\n')}

Analyze their patterns and respond as JSON only:
{
  "aliveThemes": ["theme1", "theme2", ...],  // 3-5 recurring patterns in what energizes them
  "drainedThemes": ["theme1", "theme2", ...], // 3-5 recurring patterns in what drains them
  "insight": "2-3 paragraph analysis (under 200 words) of what consistently energizes this person, what consistently drains them, and any shifts or growth you notice over time. Be specific — cite patterns, not generalities. Write in second person (you)."
}
${langDirective}
Respond with valid JSON only. No markdown fences.`;

  const text = await callGemini('gemini-2.5-flash', prompt, 30000);
  const fallback: PulseAnalysis = {
    aliveThemes: [],
    drainedThemes: [],
    insight: '',
    analyzedCount: pulseEntries.length,
    generatedAt: new Date().toISOString(),
  };

  const parsed = parseJsonResponse<Omit<PulseAnalysis, 'analyzedCount' | 'generatedAt'>>(
    text,
    { aliveThemes: [], drainedThemes: [], insight: '' }
  );

  const result: PulseAnalysis = {
    ...parsed,
    analyzedCount: pulseEntries.length,
    generatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch { /* quota exceeded — ignore */ }

  return result;
}
