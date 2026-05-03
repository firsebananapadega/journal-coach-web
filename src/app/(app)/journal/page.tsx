'use client';

// /journal was the journal-wall freeform-write surface (a borderless
// textarea + mic + save-to-notebook sheet). PR 2 retires it: the
// Journal system notebook (/notebooks/journal) already has BookPage's
// composer for the same purpose, and the journal wall itself is gone.
// Redirecting preserves any deep links and the wallNav slot lookup
// fallback.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function JournalRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/notebooks/journal');
  }, [router]);
  return null;
}
