'use client';

// PR 2 retired /home as a real surface. The page used to be the
// journal-wall Pulse landing; PR 1 already moved Pulse into
// /notebooks/pulse, and PR 2 collapses the journal wall entirely.
// /home now redirects to /today so:
//   • iOS PWA home-screen installs (which often shipped with a /home
//     start_url) still work
//   • Push notifications routed at /home (legacy paths) still land
//     somewhere coherent
//   • Old shared / bookmarked links don't 404

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/today');
  }, [router]);
  return null;
}
