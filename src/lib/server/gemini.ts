// SERVER-ONLY: do not import from client components. Lives under
// src/lib/server/ by convention. Reads non-NEXT_PUBLIC_ env vars so any
// accidental client import would also surface as undefined keys.
//
// Bypasses the @google/generative-ai SDK and calls the Gemini REST API
// directly. The SDK (v0.24.1) does not expose `thinkingConfig` in its
// GenerationConfig type, and Pro models default to extended thinking
// (20-30s of silent reasoning) which made guided sessions take minutes.
// Setting thinkingBudget=128 caps thinking to ~2-3s and keeps responses
// within the "seconds not minutes" bar the product needs.

const PRO_KEY = process.env.GEMINI_PRO_API_KEY;
const PRO_DAILY_CAP = parseInt(process.env.GEMINI_PRO_DAILY_CAP ?? '100', 10);
// Internal timeout must stay under the API route maxDuration (60s).
const DEFAULT_TIMEOUT_MS = 50_000;
const FLASH_FALLBACK_MODEL = 'gemini-2.5-flash';
const PRO_THINKING_BUDGET = parseInt(process.env.GEMINI_PRO_THINKING_BUDGET ?? '128', 10);

// Flash keys — round-robin pool. Picks up GEMINI_FLASH_API_KEY plus
// numbered siblings _2 .. _5. Empty/undefined slots are filtered out.
// Each free-tier key has its own RPM ceiling, so rotating across them
// multiplies effective burst capacity (3 keys → ~3× RPM headroom)
// without changing any per-key tier billing.
function loadFlashKeys(): string[] {
  const raw = [
    process.env.GEMINI_FLASH_API_KEY,
    process.env.GEMINI_FLASH_API_KEY_2,
    process.env.GEMINI_FLASH_API_KEY_3,
    process.env.GEMINI_FLASH_API_KEY_4,
    process.env.GEMINI_FLASH_API_KEY_5,
  ];
  return raw
    .map((k) => (k ?? '').trim())
    .filter((k) => k.length > 0);
}
const FLASH_KEYS: string[] = loadFlashKeys();

// Per-instance round-robin cursor. Survives a request, resets on cold
// start. Approximate fairness across concurrent calls is fine — the
// cursor is monotonic per instance.
let flashCursor = 0;

// Per-instance in-memory daily counter. Cold starts reset, which under-
// counts (safer). The Tier-1 RPD ceiling on the real key is the hard
// backstop against runaway charges.
const proCounts = new Map<string, number>();

function pacificDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function isProModel(modelName: string): boolean {
  return modelName.toLowerCase().includes('pro');
}

function getProUsedToday(): number {
  return proCounts.get(pacificDateKey()) ?? 0;
}

function incrementProUsed() {
  const k = pacificDateKey();
  proCounts.set(k, (proCounts.get(k) ?? 0) + 1);
  for (const key of proCounts.keys()) {
    if (key !== k) proCounts.delete(key);
  }
}

export interface GeminiServerResult {
  text: string;
  usedFallback?: boolean;
  modelUsed: string;
}

// Direct REST call so we can set thinkingConfig.
async function generate(
  apiKey: string,
  modelName: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const t0 = Date.now();
  console.log('[gemini-call]', JSON.stringify({ phase: 'start', model: modelName }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2048,
    },
  };

  // Cap extended thinking on Pro models — this is the key speed lever.
  // 128 is the minimum allowed budget on Gemini 2.5 Pro. Flash models
  // don't use thinkingConfig the same way; omit for them.
  if (isProModel(modelName)) {
    (body.generationConfig as Record<string, unknown>).thinkingConfig = {
      thinkingBudget: PRO_THINKING_BUDGET,
    };
  }

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Gemini request timed out');
    }
    throw err;
  }
  clearTimeout(timer);

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini returned non-JSON (${res.status})`);
  }

  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ??
      `Gemini returned ${res.status}`;
    // Tag upstream rate-limit errors so the route can map them to HTTP 429
    // and the client can render a guide-flavored card instead of a generic
    // connection error. Google returns 429 with messages like
    // "Resource has been exhausted (e.g. check quota)" or codes mentioning
    // RESOURCE_EXHAUSTED / quota.
    const status = (data as { error?: { code?: number; status?: string } })?.error?.code ?? res.status;
    const upstreamStatus = (data as { error?: { status?: string } })?.error?.status ?? '';
    const isRateLimit =
      status === 429 ||
      /RESOURCE_EXHAUSTED/i.test(upstreamStatus) ||
      /quota|rate.?limit|exhausted/i.test(msg);
    if (isRateLimit) {
      throw new Error('RATE_LIMITED:' + msg);
    }
    throw new Error(msg);
  }

  const text =
    (data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    })?.candidates?.[0]?.content?.parts?.[0]?.text;

  const usage = (data as { usageMetadata?: Record<string, number> }).usageMetadata;
  console.log(
    '[gemini-call]',
    JSON.stringify({
      phase: 'done',
      ms: Date.now() - t0,
      model: modelName,
      ok: typeof text === 'string',
      promptTok: usage?.promptTokenCount,
      thoughtTok: usage?.thoughtsTokenCount,
      outTok: usage?.candidatesTokenCount,
    }),
  );

  if (typeof text !== 'string') {
    throw new Error('Gemini returned no text in candidate');
  }

  return text.trim();
}

/**
 * Call a Flash model with round-robin key rotation. Each call picks
 * the next key in the pool; on RATE_LIMITED for that key, immediately
 * advance and retry with the next, up to one full pass through the
 * pool. Non-rate-limit errors (network, timeout, malformed response)
 * surface immediately — those are key-agnostic.
 *
 * Returns the text and the index of the key that succeeded (for log
 * diagnostics — never the key value itself).
 */
async function callFlash(
  modelName: string,
  prompt: string,
  timeoutMs: number,
): Promise<{ text: string; keyIndex: number }> {
  if (FLASH_KEYS.length === 0) {
    throw new Error('GEMINI_FLASH_API_KEY (and _2/_3/_4/_5 variants) are all unset');
  }

  let lastErr: Error | null = null;
  // Try at most `FLASH_KEYS.length` keys before giving up — exactly
  // one rotation through the pool.
  for (let attempt = 0; attempt < FLASH_KEYS.length; attempt++) {
    const idx = flashCursor % FLASH_KEYS.length;
    flashCursor = (flashCursor + 1) % Number.MAX_SAFE_INTEGER;
    const key = FLASH_KEYS[idx];
    try {
      const text = await generate(key, modelName, prompt, timeoutMs);
      if (attempt > 0) {
        // Diagnostic: succeeded on a fallover key. Helps spot when
        // the primary is being hammered.
        console.log('[gemini-flash]', JSON.stringify({
          phase: 'fallover-success',
          attempt,
          keyIndex: idx,
          poolSize: FLASH_KEYS.length,
        }));
      }
      return { text, keyIndex: idx };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = e.message.startsWith('RATE_LIMITED:');
      console.log('[gemini-flash]', JSON.stringify({
        phase: 'attempt-failed',
        attempt,
        keyIndex: idx,
        rateLimit: isRateLimit,
        msg: e.message.slice(0, 140),
      }));
      lastErr = e;
      if (!isRateLimit) {
        // Network / timeout / malformed — same key vs different key
        // makes no difference. Surface immediately.
        throw e;
      }
      // Rate-limited on this key; loop continues with the next.
    }
  }
  // All keys in pool returned RATE_LIMITED. Tag the message so the
  // route can map to HTTP 429.
  const tail = lastErr ? lastErr.message.replace(/^RATE_LIMITED:/, '') : 'all flash keys exhausted';
  throw new Error(`RATE_LIMITED:all ${FLASH_KEYS.length} flash key(s) exhausted — ${tail}`);
}

export async function callGeminiServer(
  modelName: string,
  prompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<GeminiServerResult> {
  const wantsPro = isProModel(modelName);
  const hasFlash = FLASH_KEYS.length > 0;

  if (wantsPro) {
    if (!PRO_KEY) {
      throw new Error('GEMINI_PRO_API_KEY is not configured');
    }
    if (getProUsedToday() >= PRO_DAILY_CAP) {
      if (!hasFlash) {
        throw new Error(`RATE_LIMITED:Pro daily cap (${PRO_DAILY_CAP}) reached and no Flash keys configured`);
      }
      try {
        const { text } = await callFlash(FLASH_FALLBACK_MODEL, prompt, timeoutMs);
        return { text, usedFallback: true, modelUsed: FLASH_FALLBACK_MODEL };
      } catch (err) {
        // If the entire Flash pool is rate-limited, both engines are gone.
        const m = err instanceof Error ? err.message : String(err);
        if (m.startsWith('RATE_LIMITED:')) {
          throw new Error('RATE_LIMITED:both engines exhausted — ' + m.slice('RATE_LIMITED:'.length));
        }
        throw err;
      }
    }
    try {
      const text = await generate(PRO_KEY, modelName, prompt, timeoutMs);
      incrementProUsed();
      return { text, modelUsed: modelName };
    } catch (err) {
      // Pro key 429 — auto-fall-back to Flash pool if available, mark
      // as fallback so the UI can show the guide's pro-cap line.
      const m = err instanceof Error ? err.message : String(err);
      if (m.startsWith('RATE_LIMITED:') && hasFlash) {
        try {
          const { text } = await callFlash(FLASH_FALLBACK_MODEL, prompt, timeoutMs);
          return { text, usedFallback: true, modelUsed: FLASH_FALLBACK_MODEL };
        } catch (err2) {
          const m2 = err2 instanceof Error ? err2.message : String(err2);
          if (m2.startsWith('RATE_LIMITED:')) {
            throw new Error('RATE_LIMITED:both engines exhausted — ' + m2.slice('RATE_LIMITED:'.length));
          }
          throw err2;
        }
      }
      throw err;
    }
  }

  // Direct flash path — round-robin handles all 3+ keys.
  const { text } = await callFlash(modelName, prompt, timeoutMs);
  return { text, modelUsed: modelName };
}

export function getProUsage(): { used: number; cap: number; date: string } {
  return { used: getProUsedToday(), cap: PRO_DAILY_CAP, date: pacificDateKey() };
}
