import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JournalCoach",
  description: "Tap and talk. Science-backed journaling with AI guidance.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JournalCoach",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#141517",
  // `interactive-widget=resizes-content` tells modern mobile browsers
  // (iOS 16.4+, Android Chrome) to REFLOW the layout when the soft
  // keyboard opens instead of panning the page. Combined with `h-dvh`
  // on chat containers, this gives the Claude-style behavior where
  // the message history stays visible and the input rides up above
  // the keyboard — no content hidden, no visual jank.
  interactiveWidget: "resizes-content",
};

// Inline guard — runs BEFORE React hydration. The strategy is
// "default ON, JS removes when safe", which closes the iOS PWA flash
// window because:
//
//   1. The server-rendered <html className="wall-pending"> ships with
//      the class already set. iOS's app-switcher snapshot captures
//      the page WITH the class on, so when iOS shows the snapshot
//      on re-launch the body content is hidden by CSS from the very
//      first painted byte — before any JS even runs.
//
//   2. This script then runs synchronously in <head> (before <body>
//      paints), and IMMEDIATELY removes the class if the current URL
//      is on the user's correct wall (or is a non-wall route like
//      /auth/welcome). For correct-wall cold loads the user sees no
//      hidden frame at all.
//
//   3. For wrong-wall cold loads (and bfcache resumes), the class
//      stays on. AppLayout's render guard returns LoadingScreen
//      (which is exempted from the hide rule via .loading-screen-root)
//      and fires a redirect. AppLayout's effect removes the class
//      once we've landed on the correct wall.
//
//   4. visibilitychange→hidden / pagehide proactively re-add the
//      class so subsequent backgrounding produces a hidden snapshot
//      too — defense in depth in case the user backgrounds again
//      after a navigation.
const WALL_PENDING_INLINE_SCRIPT = `
(function() {
  var html = document.documentElement;
  // Mirror of wallForPath() in src/lib/wallState.ts. Keep in sync.
  function pathToWall(p) {
    if (p === '/today' || p === '/lists' || p.indexOf('/lists/') === 0 ||
        p === '/upcoming' || p === '/groceries' || p === '/priorities' ||
        p === '/plans' || p === '/habits') return 'tasks';
    if (p === '/pulse' || p === '/history' || p === '/journal' ||
        p === '/notebooks' || p.indexOf('/notebooks/') === 0 ||
        p === '/patterns' || p === '/intentions' ||
        p.indexOf('/intentions/') === 0 || p === '/templates' ||
        p === '/home' || p === '/write') return 'journal';
    return null;
  }
  function isCorrectWall() {
    var w = pathToWall(location.pathname);
    if (!w) return true;
    try {
      var pu = localStorage.getItem('cached_primary_use');
      if (pu === 'tasks' && w === 'journal') return false;
      if (pu === 'journal' && w === 'tasks') return false;
      var raw = localStorage.getItem('wallState.v1');
      if (raw) {
        var ws = JSON.parse(raw);
        if (ws.activeWall === 'tasks' && w === 'journal') return false;
        if (ws.activeWall === 'journal' && w === 'tasks') return false;
      }
    } catch (e) {}
    return true;
  }
  function add() { html.classList.add('wall-pending'); }
  function maybeClear() {
    if (isCorrectWall()) html.classList.remove('wall-pending');
  }
  // Initial run: HTML ships with class on. If the URL is on the
  // correct wall (or is a non-wall route), remove it immediately so
  // the cold-load paint is unblocked.
  maybeClear();
  window.addEventListener('pagehide', add);
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) maybeClear();
  });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') add();
    else if (document.visibilityState === 'visible') maybeClear();
  });
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `wall-pending` ships ON by default. The inline <script> below
    // removes it synchronously when safe (correct wall or non-wall
    // route). Ensures iOS app-switcher snapshots capture the hidden
    // state, not whatever stale wall content was last on screen.
    <html lang="en" className={`${geistSans.variable} h-full wall-pending`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: WALL_PENDING_INLINE_SCRIPT }} />
      </head>
      <body className="min-h-full bg-bg text-text-primary">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
