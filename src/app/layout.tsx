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

// PR 2 retired the dual-wall machinery — the inline `wall-pending`
// script that lived here used to hide the body during a wall-mismatch
// redirect on iOS PWA resume. With one wall, no mismatches, no
// hide-then-show dance.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`}>
      <body className="min-h-full bg-bg text-text-primary">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
