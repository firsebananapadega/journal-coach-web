// Shared HMAC token helpers for notification-action callbacks.
// Used by both the Edge Function (to mint tokens) and the Next.js
// API routes (to verify them).
//
// Token shape: `${base64url(payloadJson)}.${base64url(HMAC-SHA256(payloadJson, secret))}`.
// Payload: { task_id, action, exp } where exp is a unix-ms timestamp.
//
// The Edge Function mints these with a 48-hour expiry when it sends
// the push — gives the user plenty of time to tap Snooze / Done from
// a dismissed or stale notification.

import { createHmac, timingSafeEqual } from 'node:crypto';

export type ReminderAction = 'snooze' | 'done';

export interface ReminderTokenPayload {
  task_id: string;
  action: ReminderAction;
  exp: number; // unix ms
}

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

export function signReminderToken(
  payload: ReminderTokenPayload,
  secret: string,
): string {
  const body = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(body).digest();
  return `${b64url(Buffer.from(body))}.${b64url(sig)}`;
}

export function verifyReminderToken(
  token: string,
  secret: string,
): ReminderTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sigB64] = parts;

  let body: Buffer;
  try {
    body = b64urlDecode(bodyB64);
  } catch {
    return null;
  }
  const expected = createHmac('sha256', secret).update(body).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  let payload: ReminderTokenPayload;
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.task_id || !payload.action || !payload.exp) return null;
  if (Date.now() > payload.exp) return null;
  return payload;
}
