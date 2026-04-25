// Client-side Gemini wrapper. Posts to /api/gemini so API keys never
// ship in the browser bundle. The server route owns key selection,
// rotation, the Pro daily cap, and Pro→Flash fallback.

import { supabase } from './supabase';
import { useAuthStore } from '../stores/authStore';

// Must sit below the server route maxDuration (60s) but above realistic
// Pro-model response time (~18-22s observed). 55s gives the server room
// to respond normally; if the server truly hangs, we release the client
// cleanly rather than spinning forever.
const DEFAULT_TIMEOUT_MS = 55_000;

export type TraceFn = (label: string, meta?: Record<string, unknown>) => void;

export type RateLimitScope = 'pro' | 'all';

export class RateLimitError extends Error {
  scope: RateLimitScope;
  detail: string;
  constructor(scope: RateLimitScope, detail: string) {
    super(`rate_limited:${scope}`);
    this.name = 'RateLimitError';
    this.scope = scope;
    this.detail = detail;
  }
}

export interface GeminiDetailedResult {
  text: string;
  usedFallback?: boolean;
  modelUsed?: string;
}

export interface CallGeminiOptions {
  timeoutMs?: number;
  onTrace?: TraceFn;
  /** Forward to Gemini's responseMimeType. Use 'application/json'
   *  when the prompt expects parseable JSON. Currently a no-op on
   *  the client path — the /api/gemini route doesn't forward it
   *  yet — but keeping the field so server-side invokers can share
   *  the same GeminiInvoker signature. */
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: Record<string, unknown>;
}

// Resolve the auth header for /api/gemini. Two paths:
//
//   FAST PATH — read the access_token directly out of the auth store.
//     The store hydrates on app mount and stays in sync via
//     supabase.auth.onAuthStateChange (see authStore.ts), so the
//     token here is the same one the SDK would return — minus the
//     unnecessary round-trip and minus the well-documented hang where
//     `supabase.auth.getSession()` can sit forever waiting on an
//     in-flight refresh, a service-worker, or browser-extension
//     contention. This is what we use 99% of the time.
//
//   SLOW PATH — only when the store has nothing yet (e.g. cold start
//     before hydration). We race getSession() against a 3-second
//     timeout so the request can never block the whole pipeline.
//
// Either way, we return promptly or throw a clear error. The previous
// implementation could hang the entire guided-session pipeline at
// "auth: getting supabase token" with no timeout.
async function authHeader(onTrace?: TraceFn): Promise<string> {
  const cached = useAuthStore.getState().session?.access_token;
  if (cached) {
    onTrace?.('auth: using cached session');
    return `Bearer ${cached}`;
  }
  onTrace?.('auth: store empty, calling getSession');
  const session = await Promise.race([
    supabase.auth.getSession().then((r) => r.data.session),
    new Promise<null>((_, reject) =>
      setTimeout(
        () => reject(new Error('supabase.auth.getSession() timed out after 3s')),
        3000,
      ),
    ),
  ]);
  if (!session?.access_token) {
    throw new Error('Not signed in');
  }
  return `Bearer ${session.access_token}`;
}

export async function callGeminiDetailed(
  modelName: string,
  prompt: string,
  optionsOrTimeout: number | CallGeminiOptions = DEFAULT_TIMEOUT_MS,
): Promise<GeminiDetailedResult> {
  const opts: CallGeminiOptions =
    typeof optionsOrTimeout === 'number'
      ? { timeoutMs: optionsOrTimeout }
      : optionsOrTimeout;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const trace = opts.onTrace ?? (() => {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  trace('auth: getting supabase token');
  let auth: string;
  try {
    // Pass the trace through so authHeader can report which path
    // (cached vs slow getSession) it took. Helps future debugging.
    auth = await authHeader(trace);
  } catch (err) {
    clearTimeout(timer);
    trace('auth: failed', { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  trace('auth: ok');

  trace('POST /api/gemini', { model: modelName, promptChars: prompt.length });
  let res: Response;
  try {
    res = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({ model: modelName, prompt, timeoutMs }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      trace('client: aborted (timeout)', { timeoutMs });
      throw new Error(`Gemini request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    trace('fetch: threw', { err: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  clearTimeout(timer);
  trace('response received', { status: res.status });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini request failed (${res.status}, no JSON body)`);
  }

  if (res.status === 429) {
    const payload = data as { error?: string; detail?: string; scope?: string };
    const scope: RateLimitScope = payload.scope === 'all' ? 'all' : 'pro';
    trace('rate limited', { scope, detail: payload.detail });
    throw new RateLimitError(scope, payload.detail || 'rate limited');
  }

  if (!res.ok) {
    const err = (data as { error?: string })?.error || `Gemini request failed: ${res.status}`;
    throw new Error(err);
  }

  const result = data as GeminiDetailedResult;
  trace('parsed json', {
    modelUsed: result.modelUsed,
    fallback: !!result.usedFallback,
    textChars: result.text?.length ?? 0,
  });
  return result;
}

export async function callGemini(
  modelName: string,
  prompt: string,
  optsOrTimeout: number | CallGeminiOptions = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const opts: CallGeminiOptions =
    typeof optsOrTimeout === 'number' ? { timeoutMs: optsOrTimeout } : optsOrTimeout;
  const r = await callGeminiDetailed(modelName, prompt, opts);
  return r.text;
}

export function parseJsonResponse<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
