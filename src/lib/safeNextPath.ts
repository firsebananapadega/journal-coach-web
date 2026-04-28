// Validates a `?next=...` query param so we never redirect off-origin.
// Allows same-origin paths only: must start with '/' and the next char
// must not be another '/' or a backslash (which some browsers normalize
// to a protocol-relative URL).
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > 512) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}
