// /presence — DISABLED as a standalone tab. The mid-day Presence
// pause now lives on /home (Pulse tab) alongside morning + evening
// pulses. Any deep links (push notifications, home-screen shortcuts)
// still pointing here bounce to /home so the experience stays whole.

import { redirect } from 'next/navigation';

// Force dynamic so Next doesn't try to statically prerender — the
// redirect must execute at request time, not build time.
export const dynamic = 'force-dynamic';

export default function PresenceRedirect() {
  redirect('/home');
}
