'use client';

// iOS install walkthrough — uses REAL Safari screenshots with a
// pulsing primary-color hotspot overlay highlighting the exact button
// to tap. Replaces the prior SVG mockups, which felt abstract.
//
// Why 5 slides for "3 steps":
//   The overview screen sells the install as 3 conceptual steps for
//   psychological simplicity (matches user's stated preference). The
//   carousel shows every actual tap (5 of them on iOS 17+ Safari)
//   so the user never gets stuck. Calling it 3 steps but walking
//   through 5 is fine — the user has agreed to install before they
//   reach the carousel; the carousel's job is to be unmissable.
//
// Hotspot coordinates are percentages of the screenshot image
// (276×600 = 0.46 aspect, matching iPhone 15 Pro screen). The
// wrapper div is given the same aspect ratio so percentages map
// directly onto the rendered image.

import { motion } from 'framer-motion';
import type { InstallSlide } from './InstallCarousel';
import { t } from '@/lib/translations';
import { prefersReducedMotion } from '@/lib/motionVariants';

const ACCENT = 'var(--theme-primary, #C4553D)';

interface Hotspot {
  /** CSS percent strings, e.g. "87%". Position relative to the image. */
  left: string;
  top: string;
  width: string;
  height: string;
  /** Border radius — '50%' for circular targets, '14%' for pill rows. */
  radius?: string;
}

function HotspotRing({ hotspot }: { hotspot: Hotspot }) {
  const radius = hotspot.radius ?? '50%';
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: hotspot.left,
        top: hotspot.top,
        width: hotspot.width,
        height: hotspot.height,
        borderRadius: radius,
        boxShadow: `
          0 0 0 3px ${ACCENT},
          0 0 0 8px rgba(245, 166, 35, 0.28),
          0 0 24px 4px rgba(245, 166, 35, 0.45)
        `,
      }}
      animate={
        prefersReducedMotion
          ? undefined
          : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }
      }
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

function ScreenshotSlide({
  src,
  hotspot,
  alt,
}: {
  src: string;
  hotspot: Hotspot;
  alt: string;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div
        className="relative h-full"
        style={{
          aspectRatio: '276 / 600',
          filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.35))',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="block h-full w-full object-cover rounded-[1.6rem]"
          draggable={false}
        />
        <HotspotRing hotspot={hotspot} />
      </div>
    </div>
  );
}

// Hotspot percentages were calibrated by overlaying test rectangles
// on the source screenshots and iterating until each ring sat
// precisely on its target button. Don't eyeball-edit these without
// re-running /tmp/hotspot_check.py — visual alignment matters more
// than they look.

// Sizing note for circular hotspots:
//   The wrapper aspect is 0.46 (height ≫ width), so to render a
//   PERFECT CIRCLE with borderRadius:50%, the hotspot's pixel
//   dimensions must be square. That requires:
//     width_pct / height_pct = 1 / 0.46 ≈ 2.174
//   Otherwise borderRadius:50% draws an ellipse. The ios-1 and
//   ios-3 hotspots below honor this; the ios-2/4/5 pills do not
//   need to.

// ── Slide 1: tap the "•••" menu button at bottom of Safari ──
function IosStep1() {
  return (
    <ScreenshotSlide
      src="/onboarding/ios/ios-1-menu.png"
      alt="Tap the ••• button at the bottom right of Safari"
      hotspot={{
        left: '80.5%',
        top: '91.0%',
        width: '9.8%',
        height: '4.5%',
        radius: '50%',
      }}
    />
  );
}

// ── Slide 2: tap "Share" in the popup menu ──
function IosStep2() {
  return (
    <ScreenshotSlide
      src="/onboarding/ios/ios-2-share.png"
      alt="Tap Share"
      hotspot={{
        left: '35.0%',
        top: '58.5%',
        width: '44.5%',
        height: '5.0%',
        radius: '9999px',
      }}
    />
  );
}

// ── Slide 3: tap "View More" (chevron-down) in the share sheet ──
// Width/height ratio = 19.6/9 ≈ 2.18, so pixel dimensions are
// square ⇒ borderRadius:50% renders a true circle (not an ellipse).
function IosStep3() {
  return (
    <ScreenshotSlide
      src="/onboarding/ios/ios-3-viewmore.png"
      alt="Tap View More"
      hotspot={{
        left: '73.0%',
        top: '83.5%',
        width: '19.6%',
        height: '9.0%',
        radius: '50%',
      }}
    />
  );
}

// ── Slide 4: tap "Add to Home Screen" ──
function IosStep4() {
  return (
    <ScreenshotSlide
      src="/onboarding/ios/ios-4-addtohome.png"
      alt="Tap Add to Home Screen"
      hotspot={{
        left: '4.0%',
        top: '83.5%',
        width: '92.0%',
        height: '4.5%',
        radius: '14px',
      }}
    />
  );
}

// ── Slide 5: tap the blue "Add" button ──
function IosStep5() {
  return (
    <ScreenshotSlide
      src="/onboarding/ios/ios-5-add.png"
      alt="Tap Add"
      hotspot={{
        left: '79.5%',
        top: '10.5%',
        width: '15.5%',
        height: '4.5%',
        radius: '9999px',
      }}
    />
  );
}

export function getIosSlides(): InstallSlide[] {
  return [
    {
      id: 'ios-1',
      Illustration: IosStep1,
      caption: t('onboarding.install.iosStep1'),
    },
    {
      id: 'ios-2',
      Illustration: IosStep2,
      caption: t('onboarding.install.iosStep2'),
    },
    {
      id: 'ios-3',
      Illustration: IosStep3,
      caption: t('onboarding.install.iosStep3'),
    },
    {
      id: 'ios-4',
      Illustration: IosStep4,
      caption: t('onboarding.install.iosStep4'),
    },
    {
      id: 'ios-5',
      Illustration: IosStep5,
      caption: t('onboarding.install.iosStep5'),
    },
  ];
}
