import type { ReactNode } from 'react';
import type { BodhiPose } from '../poses';
import { headTransform } from '../poses';

// Jane — the assistant behind /ask. "Night-owl poet" character direction
// per the user's pick: near-black straight shoulder-length hair with a
// blunt fringe, deep plum open cardigan over a cream top, calm
// introspective expression. Drawn from scratch so she reads as visually
// distinct from Sage (auburn waves, sage-green cardigan, warm smile).
//
// Only `idle` and `wave` poses are exercised in the app today (/home
// bubble and /ask empty state). Other poses fall back to idle arms.
// Jane isn't a persona-bearing GuideId, so her palette lives inline
// rather than in palettes.ts.

const HAIR = '#1F1C22';
const HAIR_LIGHT = '#3A3440';
const FRINGE_SHADOW = '#121014';

const SKIN = '#ECC9A2';
const SKIN_SHADOW = '#D0AC83';

const CARDIGAN = '#6B3F62';
const CARDIGAN_DARK = '#4C2C48';
const CARDIGAN_ACCENT = '#8A5A83';

const CREAM = '#F6EFE2';
const CREAM_SHADOW = '#E2D6BD';

const EYE_DARK = '#15100F';
const EYE_IRIS = '#3D2A28';

const MOUTH = '#552532';
const SPARKLE = '#E9C77B';

export interface JaneBodyProps {
  pose: BodhiPose;
}

export default function JaneBody({ pose }: JaneBodyProps) {
  const showBody = pose !== 'peek';

  return (
    <>
      <defs>
        <linearGradient id="jane-cardigan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CARDIGAN} />
          <stop offset="1" stopColor={CARDIGAN_DARK} />
        </linearGradient>
        <linearGradient id="jane-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={CREAM} />
          <stop offset="1" stopColor={CREAM_SHADOW} />
        </linearGradient>
        <linearGradient id="jane-hair-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={HAIR_LIGHT} />
          <stop offset="1" stopColor={HAIR} />
        </linearGradient>
        <radialGradient id="jane-skin" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FBDFBB" />
          <stop offset="0.6" stopColor={SKIN} />
          <stop offset="1" stopColor={SKIN_SHADOW} />
        </radialGradient>
        <radialGradient id="jane-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#C67885" stopOpacity="0.45" />
          <stop offset="1" stopColor="#C67885" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="jane-sparkle-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={SPARKLE} stopOpacity="0.9" />
          <stop offset="1" stopColor={SPARKLE} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hair-back — straight locks falling past the shoulders. Two tapered
          rectangles, not Sage's S-curves. Drawn behind the body so the
          cardigan overlaps the inner edge. */}
      {showBody && (
        <g id="jane-hair-back">
          <path
            d="M 33 44 L 29 90 L 35 92 L 37 46 Z"
            fill="url(#jane-hair-grad)"
          />
          <path
            d="M 67 44 L 71 90 L 65 92 L 63 46 Z"
            fill="url(#jane-hair-grad)"
          />
          {/* Single straight highlight along each side — catches light on
              the sleek surface. */}
          <path
            d="M 34 50 L 32 86"
            stroke={HAIR_LIGHT}
            strokeOpacity="0.5"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 66 50 L 68 86"
            stroke={HAIR_LIGHT}
            strokeOpacity="0.5"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Body — cardigan + cream top */}
      {showBody && (
        <g id="jane-body">
          {/* Shoulder shadow hint */}
          <ellipse cx="50" cy="55" rx="26" ry="3" fill={CARDIGAN_DARK} opacity="0.3" />
          {/* Cardigan bell. Slightly narrower at the shoulders than Sage
              to read as a more tailored, less flowy silhouette. */}
          <path
            d="M 26 56 C 25 66, 23 78, 18 95 L 82 95 C 77 78, 75 66, 74 56 C 70 54, 62 52, 50 52 C 38 52, 30 54, 26 56 Z"
            fill="url(#jane-cardigan)"
          />
          {/* Cream top in the V — straight vertical sides, no stitch lines */}
          <path d="M 42 53 L 50 78 L 58 53 Z" fill="url(#jane-top)" />
          {/* Cardigan lapel edges — two subtle dark lines along the V */}
          <path
            d="M 42 53 L 50 78"
            stroke={CARDIGAN_ACCENT}
            strokeOpacity="0.7"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          <path
            d="M 58 53 L 50 78"
            stroke={CARDIGAN_ACCENT}
            strokeOpacity="0.7"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          {/* Subtle cardigan folds — three lines (Sage had four), less busy */}
          <g stroke={CARDIGAN_DARK} strokeOpacity="0.32" strokeWidth="0.7" fill="none" strokeLinecap="round">
            <path d="M 30 64 L 27 92" />
            <path d="M 70 64 L 73 92" />
            <path d="M 38 62 L 36 90" />
          </g>
        </g>
      )}

      {/* Neck */}
      {showBody && (
        <path
          d="M 45 48 L 45 54 Q 50 56 55 54 L 55 48 Z"
          fill={SKIN_SHADOW}
          opacity="0.85"
        />
      )}

      {/* Arms — pose-dispatched */}
      {showBody && renderArms(pose)}

      {/* Floating sparkle — single small star top-right. The ✨ brand cue
          for /ask, kept restrained so it doesn't crowd the face. */}
      {showBody && (
        <g opacity="0.95">
          <circle cx="83" cy="26" r="4" fill="url(#jane-sparkle-halo)" />
          <path
            d="M 83 22 L 83.9 25.1 L 87 26 L 83.9 26.9 L 83 30 L 82.1 26.9 L 79 26 L 82.1 25.1 Z"
            fill={SPARKLE}
          />
        </g>
      )}

      {/* Head */}
      <g
        id="jane-head"
        style={{ transformOrigin: '50px 34px' }}
        transform={headTransform(pose)}
      >
        {/* Crown of hair — straighter, flatter dome than Sage's wavy halo.
            Sits close to the scalp, hard outer edge. */}
        <path
          d="M 33 26 Q 32 14 42 12 Q 50 10 58 12 Q 68 14 67 26 L 67 34 L 63 32 Q 50 29 37 32 L 33 34 Z"
          fill={HAIR}
        />
        {/* Subtle crown sheen */}
        <path
          d="M 38 17 Q 46 14 54 15"
          stroke={HAIR_LIGHT}
          strokeWidth="0.9"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Ears — small, partly hidden by straight side locks */}
        <ellipse cx="33" cy="37" rx="2.4" ry="4.2" fill={SKIN_SHADOW} />
        <ellipse cx="67" cy="37" rx="2.4" ry="4.2" fill={SKIN_SHADOW} />

        {/* Head — slightly narrower oval than Sage's (35–65 x-range instead
            of 34–66). Softer jaw, smaller chin. */}
        <path
          d="M 35 30 C 35 19, 42 14, 50 14 C 58 14, 65 19, 65 30 C 65 40, 62 48, 58 51, 54 54 46 54, 42 51, 38 48, 35 40, 35 30 Z"
          fill="url(#jane-skin)"
        />
        {/* Subtle forehead highlight */}
        <ellipse cx="48" cy="22" rx="6" ry="2" fill="#FFE8CB" opacity="0.38" />

        {/* Blunt fringe — thick horizontal shape covering the top third of
            the forehead with a slight diagonal sweep. This is Jane's
            signature silhouette feature. */}
        <path
          d="M 33 20 L 34 28 Q 42 30 50 29 Q 58 30 66 28 L 67 20 Q 58 17 50 17 Q 42 17 33 20 Z"
          fill={HAIR}
        />
        {/* Fringe under-shadow — a hair's-width darker strip along the
            cut line, so the fringe reads as a volume not a flat sticker */}
        <path
          d="M 34 27.5 Q 42 29.5 50 28.5 Q 58 29.5 66 27.5"
          stroke={FRINGE_SHADOW}
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Straight side locks framing the face — thin tapered rectangles
            falling past the jaw. */}
        <path
          d="M 34 29 L 33 48 L 36 48 L 37 31 Z"
          fill={HAIR}
        />
        <path
          d="M 66 29 L 67 48 L 64 48 L 63 31 Z"
          fill={HAIR}
        />

        {/* Brows — straighter than Sage's arches, slight outer lift */}
        <path
          d="M 40 30.5 L 47 30"
          stroke={HAIR}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 53 30 L 60 30.5"
          stroke={HAIR}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Eyes — almond-narrower than Sage's rounder hazel. Dark iris
            against the pale skin reads well even at 24px. */}
        {renderEyes(pose)}

        {/* Nose — small refined form */}
        <path
          d="M 49 36 Q 50 39 50 40.5 Q 50 41.6 50.7 41.7 Q 49 42.2 48.6 41.4 Q 48.2 39.6 49 36 Z"
          fill={SKIN_SHADOW}
          opacity="0.45"
        />
        <circle cx="50" cy="41" r="0.55" fill="#FFDEBF" opacity="0.5" />

        {/* Cheek blush — subtler and slightly plum-toned vs Sage's warm
            pink, to match the cardigan and the nocturnal read */}
        <circle cx="39.5" cy="43" r="3" fill="url(#jane-cheek)" />
        <circle cx="60.5" cy="43" r="3" fill="url(#jane-cheek)" />

        {/* Mouth — thin calm line with a faint upturn. No rendered lip
            highlight on top; keeps the closed-mouth read more serious. */}
        <path
          d="M 45.5 46.2 Q 50 47.6 54.5 46.2"
          stroke={MOUTH}
          strokeWidth="1.05"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

function renderEyes(pose: BodhiPose): ReactNode {
  // Closed-eyed poses (`meditate`) collapse to a calm lash curve.
  if (pose === 'meditate') {
    return (
      <>
        <path
          d="M 41.5 34 Q 44 35.6 46.5 34"
          stroke={EYE_DARK}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 53.5 34 Q 56 35.6 58.5 34"
          stroke={EYE_DARK}
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }
  return (
    <>
      {/* Almond whites — narrower rx + smaller ry than Sage */}
      <ellipse cx="44" cy="33.8" rx="2.3" ry="1.6" fill="#FBFAF4" />
      <ellipse cx="56" cy="33.8" rx="2.3" ry="1.6" fill="#FBFAF4" />
      {/* Iris */}
      <circle cx="44" cy="33.8" r="1.35" fill={EYE_IRIS} />
      <circle cx="56" cy="33.8" r="1.35" fill={EYE_IRIS} />
      {/* Pupil */}
      <circle cx="44" cy="33.8" r="0.75" fill={EYE_DARK} />
      <circle cx="56" cy="33.8" r="0.75" fill={EYE_DARK} />
      {/* Single small highlight — Jane's eye catchlight is minimal, not
          the two-layer shine that makes Sage read bubbly. */}
      <circle cx="44.45" cy="33.25" r="0.4" fill="white" />
      <circle cx="56.45" cy="33.25" r="0.4" fill="white" />
      {/* Upper lash line — short flat strokes, no curl (contrasts with
          Sage's lifted lashes) */}
      <path
        d="M 42 32.6 L 46 32.6"
        stroke={EYE_DARK}
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 54 32.6 L 58 32.6"
        stroke={EYE_DARK}
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.85"
      />
    </>
  );
}

function renderArms(pose: BodhiPose): ReactNode {
  const sleeve = 'url(#jane-cardigan)';

  if (pose === 'wave') {
    // Right arm raised to the upper-right corner — a quieter wave than
    // Sage's bigger overhead reach. Left arm relaxed at her side.
    return (
      <g>
        {/* Raised right arm — curving up from shoulder to hand above the
            sparkle, with open palm visible */}
        <path
          d="M 72 58 Q 78 42 78 22"
          stroke={sleeve}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        {/* Hand at the top — palm open, three finger hints */}
        <circle cx="78" cy="19" r="4" fill={SKIN} />
        {/* Cuff where the sleeve meets the wrist */}
        <ellipse cx="78" cy="25" rx="1.6" ry="1.9" fill={CREAM} />
        {/* Finger divisions */}
        <g stroke={SKIN_SHADOW} strokeOpacity="0.55" strokeWidth="0.55" strokeLinecap="round">
          <path d="M 76 16 L 76 14" />
          <path d="M 78 15 L 78 13" />
          <path d="M 80 16 L 80 14" />
        </g>
        {/* Relaxed left arm — down at side */}
        <path
          d="M 28 58 Q 24 74 27 86"
          stroke={sleeve}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <ellipse cx="27" cy="86" rx="1.5" ry="1.9" fill={CREAM} />
      </g>
    );
  }

  // Default / idle — both arms relaxed forward, hands overlapping in
  // lap. Different from Sage's straight-down idle (which shows cuffs
  // at the bottom corners): Jane's forearms meet at centre, palms
  // down, a "seated at the desk" quiet posture.
  return (
    <g>
      {/* Left arm — shoulder curving inward to hand near centre */}
      <path
        d="M 28 58 Q 32 76 46 82"
        stroke={sleeve}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {/* Right arm — mirrored */}
      <path
        d="M 72 58 Q 68 76 54 82"
        stroke={sleeve}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      {/* Hands resting, overlapping at centre. The right hand sits on
          top of the left; a faint divider suggests the overlap. */}
      <ellipse cx="50" cy="83" rx="7" ry="2.6" fill={SKIN} />
      <path
        d="M 46 83 Q 50 84.2 54 83"
        stroke={SKIN_SHADOW}
        strokeOpacity="0.55"
        strokeWidth="0.6"
        fill="none"
        strokeLinecap="round"
      />
      {/* Cuffs peeking just above the hands */}
      <ellipse cx="44" cy="81" rx="1.4" ry="1.7" fill={CREAM} />
      <ellipse cx="56" cy="81" rx="1.4" ry="1.7" fill={CREAM} />
    </g>
  );
}
