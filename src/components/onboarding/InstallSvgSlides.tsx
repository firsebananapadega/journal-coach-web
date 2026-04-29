'use client';

// Install walkthrough — 3 SVG slides for iOS browsers OTHER than
// Safari (Chrome / DuckDuckGo / Firefox / Edge etc.). Apple forces
// every iOS browser onto WebKit and they all surface the same iOS
// share sheet, so the conceptual flow is identical to Safari's:
//   1. Tap the share icon in the toolbar
//   2. Tap "Add to Home Screen" in the share sheet
//   3. Tap "Add" in the confirmation modal
// We use abstract SVG mockups (rather than Safari screenshots) so
// the chrome doesn't mismatch the user's actual browser. The share
// SHEET content matches across all iOS browsers.
//
// Restored from pre-cd6792c InstallIosSlides.tsx — that commit
// replaced the SVG carousel with photoreal Safari screenshots; this
// file brings the SVG version back as the iOS-non-Safari path.

import type { InstallSlide } from './InstallCarousel';
import { t } from '@/lib/translations';

const ACCENT = 'var(--theme-primary, #C4553D)';
const FG = '#e7e9ed';
const MUTED = '#8d9198';
const CHROME = '#1c1d20';
const SCREEN = '#0f1012';
const GLOW = 'rgba(245,166,35,0.22)';

// Outer phone bezel + screen frame. Children render inside the screen.
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
      {/* Bezel */}
      <rect x="0" y="0" width="220" height="400" rx="34" fill="#0a0b0d" />
      {/* Screen */}
      <rect x="6" y="6" width="208" height="388" rx="28" fill={SCREEN} />
      {/* Dynamic island / speaker slot */}
      <rect x="90" y="12" width="40" height="10" rx="5" fill="#0a0b0d" />
      {/* Status bar */}
      <text x="20" y="30" fontSize="9" fill={FG} fontWeight="600">
        9:41
      </text>
      <g fill={FG} transform="translate(182, 22)">
        {/* signal */}
        <rect x="0" y="4" width="2" height="4" rx="0.5" />
        <rect x="3" y="3" width="2" height="5" rx="0.5" />
        <rect x="6" y="2" width="2" height="6" rx="0.5" />
        <rect x="9" y="1" width="2" height="7" rx="0.5" />
        {/* battery */}
        <rect x="16" y="2" width="14" height="6" rx="1.5" stroke={FG} fill="none" strokeWidth="0.8" />
        <rect x="17" y="3" width="10" height="4" rx="0.8" fill={FG} />
      </g>
      {children}
    </svg>
  );
}

function GlowRing({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  // Two-layer pulse: a wide soft halo + a tighter inner halo, then a
  // sharp accent ring.
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 12} fill={GLOW} opacity="0.55">
        <animate attributeName="opacity" values="0.25;0.85;0.25" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="r" values={`${r + 9};${r + 16};${r + 9}`} dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={r + 6} fill={GLOW} opacity="0.85">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="r" values={`${r + 4};${r + 8};${r + 4}`} dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke={ACCENT} strokeWidth="2" opacity="0.95" />
    </g>
  );
}

// ── Slide 1: browser — tap the Share icon ──
function SvgStep1() {
  return (
    <PhoneFrame>
      {/* URL bar at top — generic, no Safari brand wordmark. */}
      <rect x="14" y="40" width="192" height="22" rx="8" fill={CHROME} />
      <text x="110" y="55" fontSize="8" fill={MUTED} textAnchor="middle">
        🔒 journalcoach.app
      </text>

      {/* Page content — warm glow */}
      <rect x="14" y="70" width="192" height="262" rx="10" fill={SCREEN} />
      <defs>
        <linearGradient id="svgPageGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="14" y="70" width="192" height="262" rx="10" fill="url(#svgPageGrad)" />
      <circle cx="110" cy="180" r="24" fill={ACCENT} opacity="0.55" />
      <text x="110" y="220" fontSize="9" fill={FG} textAnchor="middle" opacity="0.7">
        JournalCoach
      </text>

      {/* Bottom toolbar — same icons most iOS browsers expose
          (back, forward, share, bookmark, tabs). Share is HIGHLIGHTED. */}
      <rect x="14" y="338" width="192" height="44" rx="10" fill={CHROME} />
      {/* back chevron centered (38, 360) */}
      <g stroke={MUTED} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="42" y1="354" x2="36" y2="360" />
        <line x1="36" y1="360" x2="42" y2="366" />
      </g>
      {/* forward chevron centered (72, 360) */}
      <g stroke={MUTED} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="68" y1="354" x2="74" y2="360" />
        <line x1="74" y1="360" x2="68" y2="366" />
      </g>
      {/* share — HIGHLIGHTED */}
      <GlowRing cx={110} cy={360} r={13} />
      <g
        transform="translate(110 360)"
        stroke={ACCENT}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Box (open at top) */}
        <path d="M-7 -2 L-7 7 L7 7 L7 -2" />
        <path d="M-7 -2 L-4 -2" />
        <path d="M4 -2 L7 -2" />
        {/* Arrow shaft + chevron */}
        <line x1="0" y1="4" x2="0" y2="-9" />
        <path d="M-4 -5 L0 -9 L4 -5" />
      </g>
      {/* bookmark centered (158, 360) */}
      <path d="M154 354 L154 366 L158 362 L162 366 L162 354 Z" stroke={MUTED} strokeWidth="1.4" fill="none" />
      {/* tabs */}
      <g stroke={MUTED} strokeWidth="1.4" fill="none">
        <rect x="184" y="354" width="10" height="10" rx="2" />
        <rect x="187" y="357" width="10" height="10" rx="2" />
      </g>
    </PhoneFrame>
  );
}

// ── Slide 2: iOS share sheet — Add to Home Screen highlighted ──
function SvgStep2() {
  return (
    <PhoneFrame>
      {/* Dim the page underneath */}
      <rect x="14" y="40" width="192" height="260" rx="10" fill={SCREEN} opacity="0.7" />
      <rect x="14" y="40" width="192" height="260" rx="10" fill="#000" opacity="0.3" />

      {/* Share sheet */}
      <rect x="10" y="110" width="200" height="280" rx="18" fill={CHROME} />
      {/* drag handle */}
      <rect x="100" y="118" width="20" height="3" rx="1.5" fill={MUTED} opacity="0.6" />

      {/* App info header */}
      <rect x="20" y="128" width="180" height="42" rx="10" fill="#2a2b2e" />
      <rect x="28" y="136" width="26" height="26" rx="6" fill={ACCENT} opacity="0.7" />
      <text x="60" y="148" fontSize="8" fill={FG} fontWeight="600">
        JournalCoach
      </text>
      <text x="60" y="160" fontSize="6.5" fill={MUTED}>
        journalcoach.app
      </text>

      {/* Horizontal app row */}
      <g transform="translate(24 182)">
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${i * 46} 0)`}>
            <rect x="0" y="0" width="38" height="38" rx="8" fill="#2a2b2e" />
            <circle cx="19" cy="16" r="7" fill={MUTED} opacity="0.5" />
            <text x="19" y="36" fontSize="6" fill={MUTED} textAnchor="middle">
              •••
            </text>
          </g>
        ))}
      </g>

      {/* Action rows */}
      <g fontSize="8" fill={FG}>
        <g transform="translate(20 240)">
          <rect x="0" y="0" width="180" height="26" rx="8" fill="#2a2b2e" />
          <rect x="8" y="6" width="14" height="14" rx="3" fill={MUTED} opacity="0.4" />
          <text x="30" y="18" fill={FG}>
            Copy
          </text>
        </g>

        {/* HIGHLIGHTED: Add to Home Screen */}
        <g transform="translate(20 274)">
          <rect
            x="-2"
            y="-2"
            width="184"
            height="30"
            rx="9"
            fill={ACCENT}
            opacity="0.2"
          />
          <rect x="0" y="0" width="180" height="26" rx="8" fill="#2a2b2e" stroke={ACCENT} strokeWidth="1.2" />
          <g transform="translate(8 6)">
            <rect x="0" y="0" width="14" height="14" rx="3" fill="none" stroke={ACCENT} strokeWidth="1.3" />
            <line x1="7" y1="3" x2="7" y2="11" stroke={ACCENT} strokeWidth="1.3" strokeLinecap="round" />
            <line x1="3" y1="7" x2="11" y2="7" stroke={ACCENT} strokeWidth="1.3" strokeLinecap="round" />
          </g>
          <text x="30" y="18" fill={ACCENT} fontWeight="700">
            Add to Home Screen
          </text>
        </g>

        <g transform="translate(20 308)" opacity="0.7">
          <rect x="0" y="0" width="180" height="26" rx="8" fill="#2a2b2e" />
          <rect x="8" y="6" width="14" height="14" rx="3" fill={MUTED} opacity="0.4" />
          <text x="30" y="18">Find on Page</text>
        </g>

        <g transform="translate(20 342)" opacity="0.6">
          <rect x="0" y="0" width="180" height="26" rx="8" fill="#2a2b2e" />
          <rect x="8" y="6" width="14" height="14" rx="3" fill={MUTED} opacity="0.4" />
          <text x="30" y="18">Markup</text>
        </g>
      </g>
    </PhoneFrame>
  );
}

// ── Slide 3: Add confirmation — tap Add ──
function SvgStep3() {
  return (
    <PhoneFrame>
      {/* Dim underneath */}
      <rect x="14" y="40" width="192" height="356" rx="10" fill={SCREEN} opacity="0.7" />
      <rect x="14" y="40" width="192" height="356" rx="10" fill="#000" opacity="0.4" />

      {/* Modal sheet */}
      <rect x="14" y="78" width="192" height="240" rx="14" fill={CHROME} />

      {/* Header row: Cancel ← → Add (HIGHLIGHTED) */}
      <text x="26" y="100" fontSize="8" fill={MUTED}>
        Cancel
      </text>
      <text x="108" y="100" fontSize="9" fontWeight="700" fill={FG} textAnchor="middle">
        Add to Home Screen
      </text>
      {/* Add button ringed */}
      <rect x="166" y="88" width="34" height="18" rx="4" fill={ACCENT} opacity="0.28" />
      <text x="183" y="100" fontSize="8" fontWeight="700" fill={ACCENT} textAnchor="middle">
        Add
      </text>
      <GlowRing cx={183} cy={97} r={18} />

      {/* App icon + name row */}
      <g transform="translate(26 126)">
        <rect x="0" y="0" width="46" height="46" rx="10" fill={ACCENT} opacity="0.75" />
        <circle cx="23" cy="21" r="10" fill="#fff" opacity="0.25" />
        <rect x="60" y="4" width="100" height="18" rx="5" fill="#2a2b2e" />
        <text x="64" y="16" fontSize="7.5" fill={FG}>
          JournalCoach
        </text>
        <rect x="60" y="26" width="100" height="14" rx="4" fill="#2a2b2e" />
        <text x="64" y="36" fontSize="6.5" fill={MUTED}>
          journalcoach.app
        </text>
      </g>

      {/* Explanatory line */}
      <text x="110" y="210" fontSize="7" fill={MUTED} textAnchor="middle">
        An icon will be added to your Home Screen
      </text>
      <text x="110" y="222" fontSize="7" fill={MUTED} textAnchor="middle">
        so you can quickly access this website.
      </text>
    </PhoneFrame>
  );
}

export function getSvgIosSlides(): InstallSlide[] {
  return [
    { id: 'svg-1', Illustration: SvgStep1, caption: t('onboarding.install.svgStep1') },
    { id: 'svg-2', Illustration: SvgStep2, caption: t('onboarding.install.svgStep2') },
    { id: 'svg-3', Illustration: SvgStep3, caption: t('onboarding.install.svgStep3') },
  ];
}
