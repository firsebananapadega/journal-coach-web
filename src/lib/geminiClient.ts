// Centralized Gemini API client with round-robin key rotation
// Spreads load across all keys evenly, skips exhausted keys,
// automatically retries with the next healthy key on failure

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

// ── Key Discovery ──────────────────────────────────────────────────

const ALL_KEYS: string[] = [
  process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  process.env.NEXT_PUBLIC_ALT_GEMINI_API_KEY,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_3,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_4,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_5,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_6,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_7,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_8,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_9,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_10,
].filter((k): k is string => !!k && k.length > 0);

const isDev = process.env.NODE_ENV === 'development';

if (isDev && typeof window !== 'undefined') {
  console.log(
    `[Gemini] ${ALL_KEYS.length} key(s) loaded:`,
    ALL_KEYS.map((k, i) => `#${i + 1} ${k.substring(0, 8)}…`).join('  ')
  );
}

// ── Config ─────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 2_500;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 65 * 1000;

// ── Per-Key State ──────────────────────────────────────────────────

interface KeyState {
  cooldownUntil: number;
  reason: 'quota' | 'rate_limit';
}

const keyStates = new Map<string, KeyState>();
let roundRobinIndex = 0;

// ── Helpers ────────────────────────────────────────────────────────

function isRateLimitError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('too many requests')
  );
}

function isQuotaExhausted(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes('quota') || msg.includes('resource_exhausted');
}

function keyLabel(key: string): string {
  const idx = ALL_KEYS.indexOf(key);
  return `#${idx + 1} (${key.substring(0, 8)}…)`;
}

function markKeyFailed(key: string, error: unknown) {
  const isQuota = isQuotaExhausted(error);
  const cooldown = isQuota ? QUOTA_COOLDOWN_MS : RATE_LIMIT_COOLDOWN_MS;
  keyStates.set(key, {
    cooldownUntil: Date.now() + cooldown,
    reason: isQuota ? 'quota' : 'rate_limit',
  });
}

function markKeySuccess(key: string) {
  if (keyStates.has(key)) {
    keyStates.delete(key);
  }
}

function getRotatedActiveKeys(): string[] {
  const now = Date.now();
  const active: string[] = [];

  for (let i = 0; i < ALL_KEYS.length; i++) {
    const idx = (roundRobinIndex + i) % ALL_KEYS.length;
    const key = ALL_KEYS[idx];
    const state = keyStates.get(key);
    if (!state || state.cooldownUntil <= now) {
      active.push(key);
    }
  }

  if (active.length > 0) return active;

  const sorted = [...ALL_KEYS].sort((a, b) => {
    const sa = keyStates.get(a);
    const sb = keyStates.get(b);
    return (sa?.cooldownUntil ?? 0) - (sb?.cooldownUntil ?? 0);
  });

  keyStates.delete(sorted[0]);
  return [sorted[0]];
}

// ── Public API ─────────────────────────────────────────────────────

export function getModel(modelName: string, apiKey?: string): GenerativeModel {
  const key = apiKey || getRotatedActiveKeys()[0];
  if (!key) throw new Error('No Gemini API key configured');
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: modelName });
}

export async function callGemini(
  modelName: string,
  prompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  if (ALL_KEYS.length === 0) {
    throw new Error('No Gemini API key configured. Add NEXT_PUBLIC_GEMINI_API_KEY to .env.local');
  }

  roundRobinIndex = (roundRobinIndex + 1) % ALL_KEYS.length;

  let lastError: Error | null = null;

  for (let round = 0; round < 2; round++) {
    if (round > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    const keys = getRotatedActiveKeys();

    for (const key of keys) {
      try {
        const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: modelName });

        const result = await Promise.race([
          model.generateContent(prompt).then((r) => r.response.text().trim()),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
          ),
        ]);

        markKeySuccess(key);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (isRateLimitError(err)) {
          markKeyFailed(key, err);
          continue;
        }

        break;
      }
    }
  }

  const now = Date.now();
  const exhaustedKeys = ALL_KEYS.filter((k) => {
    const s = keyStates.get(k);
    return s && s.cooldownUntil > now;
  });
  const quotaExhausted = exhaustedKeys.filter((k) => keyStates.get(k)?.reason === 'quota');

  let errorDetail: string;
  if (quotaExhausted.length >= ALL_KEYS.length) {
    errorDetail = `All ${ALL_KEYS.length} API keys have hit their daily quota. Wait for quota to reset.`;
  } else if (exhaustedKeys.length >= ALL_KEYS.length) {
    errorDetail = `All ${ALL_KEYS.length} API keys are rate-limited. Try again shortly.`;
  } else {
    errorDetail = lastError?.message || 'Failed to get response from Gemini';
  }

  throw new Error(errorDetail);
}

export function parseJsonResponse<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
