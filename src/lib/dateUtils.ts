/**
 * Returns a YYYY-MM-DD string in the user's LOCAL timezone.
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts a Supabase timestamptz string (UTC) to a local YYYY-MM-DD string.
 */
export function entryDateStr(createdAt: string): string {
  return toLocalDateStr(new Date(createdAt));
}

/**
 * Returns today's date as YYYY-MM-DD in local timezone.
 */
export function todayStr(): string {
  return toLocalDateStr(new Date());
}
