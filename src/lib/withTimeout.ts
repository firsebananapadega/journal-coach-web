// Promise.race a supplied promise against a deadline. Throws a labeled
// TimeoutError if the deadline trips first. Every Supabase round-trip in
// the app should be wrapped in this — unbounded fetches are exactly the
// class of bug that makes "Saving…" spinners hang forever with no
// recovery path. Prefer a surfaced error the user can retry over an
// infinite spinner.

export class TimeoutError extends Error {
  readonly label: string;
  readonly ms: number;
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.ms = ms;
  }
}

// Accepts any thenable — Supabase's query builders return their own
// PostgrestBuilder type rather than a raw Promise, but they're
// thenable, so Promise.resolve() adapts them cleanly. The cost is a
// harmless micro-task; the benefit is one helper that works for both
// `supabase.from(...).select(...)` and plain `async () => ...` code.
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timerId = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timerId !== undefined) clearTimeout(timerId);
  });
}

export function isTimeoutError(e: unknown): e is TimeoutError {
  return e instanceof TimeoutError;
}
