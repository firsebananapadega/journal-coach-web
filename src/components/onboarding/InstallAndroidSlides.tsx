'use client';

// Android install walkthrough. Two shapes:
//   (a) canPrompt = true  → single slide: native prompt path
//       (the InstallStep passes a finalCta that fires
//        usePwaInstall().promptInstall())
//   (b) canPrompt = false → 2 slides: Chrome menu → Install app
//
// Like the iOS slides, each is an SVG fallback — drop a real PNG
// into public/onboarding/android-{1,2}.png and wire imageSrc in
// InstallStep.tsx when ready.

import type { InstallSlide } from './InstallCarousel';
import { t } from '@/lib/translations';

const ACCENT = 'var(--theme-primary, #C4553D)';
const FG = '#e7e9ed';
const MUTED = '#8d9198';
const CHROME = '#1c1d20';
const SCREEN = '#0f1012';

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 220 400"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
      style={{ filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.35))' }}
    >
      <rect x="0" y="0" width="220" height="400" rx="28" fill="#0a0b0d" />
      <rect x="6" y="6" width="208" height="388" rx="24" fill={SCREEN} />
      <text x="20" y="22" fontSize="9" fill={FG} fontWeight="600">
        9:41
      </text>
      {children}
    </svg>
  );
}

// ── canPrompt=true single slide ──
function AndroidPrompt() {
  return (
    <PhoneFrame>
      {/* Chrome app bar */}
      <rect x="12" y="30" width="196" height="30" rx="7" fill={CHROME} />
      <text x="110" y="49" fontSize="8" fill={MUTED} textAnchor="middle">
        🔒 journalcoach.app
      </text>

      {/* Page hero */}
      <defs>
        <linearGradient id="abggg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="12" y="66" width="196" height="150" rx="10" fill="url(#abggg)" />
      <circle cx="110" cy="140" r="24" fill={ACCENT} opacity="0.55" />

      {/* Install card mockup (what Chrome shows when prompt fires) */}
      <g transform="translate(12 240)">
        <rect x="0" y="0" width="196" height="120" rx="14" fill={CHROME} />
        <rect x="12" y="14" width="36" height="36" rx="8" fill={ACCENT} opacity="0.85" />
        <text x="56" y="28" fontSize="9" fill={FG} fontWeight="700">
          Install JournalCoach?
        </text>
        <text x="56" y="42" fontSize="7" fill={MUTED}>
          journalcoach.app
        </text>
        <rect x="12" y="64" width="172" height="30" rx="8" fill={ACCENT} />
        <text x="98" y="83" fontSize="9" fontWeight="700" fill="#fff" textAnchor="middle">
          Install
        </text>
        <text x="98" y="107" fontSize="7" fill={MUTED} textAnchor="middle">
          Cancel
        </text>
      </g>
    </PhoneFrame>
  );
}

// ── canPrompt=false slide 1: open menu ──
function AndroidMenu1() {
  return (
    <PhoneFrame>
      <rect x="12" y="30" width="196" height="30" rx="7" fill={CHROME} />
      <text x="100" y="49" fontSize="8" fill={MUTED} textAnchor="middle">
        🔒 journalcoach.app
      </text>
      {/* three-dot menu — HIGHLIGHTED */}
      <g>
        <circle cx="195" cy="45" r="13" fill={ACCENT} opacity="0.22" />
        <circle cx="195" cy="45" r="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <circle cx="195" cy="41" r="1.3" fill={ACCENT} />
        <circle cx="195" cy="45" r="1.3" fill={ACCENT} />
        <circle cx="195" cy="49" r="1.3" fill={ACCENT} />
      </g>
      <defs>
        <linearGradient id="abggg2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="12" y="66" width="196" height="320" rx="10" fill="url(#abggg2)" />
      <circle cx="110" cy="220" r="28" fill={ACCENT} opacity="0.55" />
    </PhoneFrame>
  );
}

// ── canPrompt=false slide 2: tap Install app menu item ──
function AndroidMenu2() {
  return (
    <PhoneFrame>
      <rect x="12" y="30" width="196" height="30" rx="7" fill={CHROME} />
      <text x="100" y="49" fontSize="8" fill={MUTED} textAnchor="middle">
        🔒 journalcoach.app
      </text>
      {/* Menu dropdown */}
      <g transform="translate(100 68)">
        <rect x="0" y="0" width="108" height="220" rx="10" fill={CHROME} />
        {/* items */}
        <g fontSize="8" fill={FG}>
          {['New tab', 'New incognito tab', 'History', 'Downloads', 'Bookmarks'].map((label, i) => (
            <g key={label} transform={`translate(10 ${18 + i * 22})`}>
              <text x="0" y="0" fill={MUTED}>
                {label}
              </text>
            </g>
          ))}
          {/* HIGHLIGHTED: Install app */}
          <g transform="translate(-2 128)">
            <rect x="0" y="0" width="108" height="24" rx="6" fill={ACCENT} opacity="0.2" />
            <text x="12" y="16" fill={ACCENT} fontWeight="700">
              Install app
            </text>
            {/* plus icon */}
            <g transform="translate(88 9)">
              <line x1="0" y1="3" x2="6" y2="3" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
              <line x1="3" y1="0" x2="3" y2="6" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
            </g>
          </g>
          {['Settings', 'Help & feedback'].map((label, i) => (
            <g key={label} transform={`translate(10 ${168 + i * 22})`}>
              <text x="0" y="0" fill={MUTED}>
                {label}
              </text>
            </g>
          ))}
        </g>
      </g>
    </PhoneFrame>
  );
}

export function getAndroidPromptSlides(): InstallSlide[] {
  return [{ id: 'android-prompt', Illustration: AndroidPrompt, caption: t('onboarding.install.androidBody') }];
}

export function getAndroidManualSlides(): InstallSlide[] {
  return [
    { id: 'android-m1', Illustration: AndroidMenu1, caption: t('onboarding.install.androidStep1') },
    { id: 'android-m2', Illustration: AndroidMenu2, caption: t('onboarding.install.androidStep2') },
  ];
}
