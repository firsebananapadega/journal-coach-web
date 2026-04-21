'use client';

// PWA install detection + native prompt capture.
//
// Platform resolution order:
//   1. installed  — matchMedia standalone OR navigator.standalone (iOS).
//                   If so, no install UI.
//   2. ios        — iPhone/iPad/iPod via navigator.platform, OR iPadOS 13+
//                   (which claims to be Mac — caught via maxTouchPoints).
//                   iOS has no programmatic install API; we teach the
//                   Share → Add to Home Screen gesture.
//   3. android    — any non-iOS mobile where beforeinstallprompt has
//                   fired. We stash the deferred event at app mount
//                   (see installPromptBridge below) and fire .prompt()
//                   when the user taps our custom card.
//   4. desktop    — no install UI; onboarding step auto-skips.
//
// beforeinstallprompt is captured once at app mount (in AuthProvider)
// via installPromptBridge.arm(). Components read the current event
// through this hook.

import { useEffect, useState } from 'react';

export type Platform = 'ios' | 'android' | 'desktop' | 'installed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level bridge so AuthProvider can capture the event at app mount
// (it may fire before any install UI is rendered) and the hook can read
// it whenever the user reaches the install step.
type Listener = (e: BeforeInstallPromptEvent | null) => void;
let _deferred: BeforeInstallPromptEvent | null = null;
let _installed = false;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach((fn) => fn(_deferred));
}

export const installPromptBridge = {
  arm() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferred = e as BeforeInstallPromptEvent;
      notify();
    });
    window.addEventListener('appinstalled', () => {
      _installed = true;
      _deferred = null;
      notify();
    });
  },
  current(): BeforeInstallPromptEvent | null {
    return _deferred;
  },
  markUsed() {
    _deferred = null;
    notify();
  },
  wasInstalled(): boolean {
    return _installed;
  },
};

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'desktop';

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    _installed;
  if (standalone) return 'installed';

  const isiOS =
    /iPhone|iPad|iPod/i.test(navigator.platform) ||
    // iPadOS 13+ reports as Mac
    (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));
  if (isiOS) return 'ios';

  // Android or Chromium-on-mobile: only call it 'android' if we actually
  // captured the install event (or the UA looks Android). We err on the
  // side of showing the Android card if the UA matches, even if the
  // event hasn't fired yet — the card handles the "no deferred prompt"
  // case with fallback copy.
  if (/Android/i.test(navigator.userAgent)) return 'android';

  return 'desktop';
}

export function usePwaInstall() {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());
  const [canPrompt, setCanPrompt] = useState<boolean>(() => !!_deferred);

  useEffect(() => {
    const listener: Listener = (e) => {
      setCanPrompt(!!e);
      setPlatform(detectPlatform());
    };
    _listeners.add(listener);
    // Re-detect when the component mounts (e.g. user reopens from
    // home screen and display-mode is now standalone).
    setPlatform(detectPlatform());
    setCanPrompt(!!installPromptBridge.current());
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const e = installPromptBridge.current();
    if (!e) return 'unavailable';
    await e.prompt();
    const { outcome } = await e.userChoice;
    installPromptBridge.markUsed();
    return outcome;
  }

  return {
    platform,
    canPrompt,
    promptInstall,
  };
}
