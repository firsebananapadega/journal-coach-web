import type { ReactNode } from 'react';
import type { BodhiPose } from '../poses';
import { headTransform } from '../poses';
import type { MascotPalette } from '../palettes';

// Quinn — The Life Coach (Ryan Gosling-coded). Redesigned away from
// the prior "open linen jacket + V undershirt + chest pendant" look,
// which read as scrubs + ID badge ("doctor", per user feedback).
// Vibes the new look targets:
//   - relaxed open-collar camp shirt (no lapel V, no zipper line)
//   - top button undone, hint of collarbone visible — golden-hour casual
//   - voluminous side-swept hair with sun-catching highlights
//   - asymmetric closed-lip smirk as the resting expression (the
//     "I'm in on the joke" look) instead of an open toothy grin
//   - sculpted jawline with a five-o'clock-shadow stubble that hugs
//     the jaw rather than blocking the chin
//   - chunky leather-wrap wristbands (one with a tiny teal bead)
//     — the life-coach-just-back-from-retreat detail
//   - palms-up open-arm idle stays (the welcoming gesture is on-brand)
//     but slightly more relaxed at the elbows

const MOUTH = '#3B2318';
const LIP_TINT = '#9E5C42';
const TEETH = '#FBFAF4';
const BROW = '#4A321E';
const EYE_DARK = '#2A1B12';
const EYE_IRIS = '#6B4A2E';

export interface BodyProps {
  pose: BodhiPose;
  palette: MascotPalette;
}

export default function QuinnBody({ pose, palette }: BodyProps) {
  const showBody = pose !== 'peek';

  return (
    <>
      <defs>
        <linearGradient id="quinn-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.top} />
          <stop offset="1" stopColor={palette.topDark} />
        </linearGradient>
        <radialGradient id="quinn-skin" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFD9AE" />
          <stop offset="0.6" stopColor={palette.skin} />
          <stop offset="1" stopColor={palette.skinShadow} />
        </radialGradient>
        <radialGradient id="quinn-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F09E6B" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F09E6B" stopOpacity="0" />
        </radialGradient>
        {/* Subtle vertical highlight on hair for the side-swept volume */}
        <linearGradient id="quinn-hair-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.hairLight} stopOpacity="0.85" />
          <stop offset="0.6" stopColor={palette.hairLight} stopOpacity="0.25" />
          <stop offset="1" stopColor={palette.hairLight} stopOpacity="0" />
        </linearGradient>
      </defs>

      {showBody && (
        <g id="quinn-body">
          {/* Shoulder shadow hint — wider than before for a relaxed
              shirt drape, not a structured jacket. */}
          <ellipse cx="50" cy="55" rx="29" ry="3.8" fill={palette.topDark} opacity="0.22" />
          {/* Camp-collar shirt — single piece, soft fall from the
              shoulders. Replaces the prior bell-shaped jacket so the
              outline reads "soft fabric" not "structured outerwear". */}
          <path
            d="M 22 56 C 22 65, 20 76, 16 96 L 84 96 C 80 76, 78 65, 78 56
               C 74 53, 64 51, 50 51 C 36 51, 26 53, 22 56 Z"
            fill="url(#quinn-shirt)"
          />
          {/* Open V-neck cut — exposes a small section of collarbone /
              upper chest in skin tone. NOT an undershirt; this is just
              the open shirt itself parting at the top. The narrower V
              + skin (not contrasting fabric) is what kills the
              "scrubs" read. */}
          <path
            d="M 43 51 Q 50 62 57 51 L 56 51 Q 50 60 44 51 Z"
            fill={palette.skin}
          />
          {/* Soft inner shadow at the V — hints depth without a hard
              line, so the neckline reads like a draped opening, not a
              zipper or seam. */}
          <path
            d="M 44 51.5 Q 50 60 56 51.5"
            stroke={palette.skinShadow}
            strokeOpacity="0.45"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
          />
          {/* Camp collar — two soft folded triangles flanking the V */}
          <path
            d="M 38 51 L 44 51 L 43 56 Z"
            fill={palette.topDark}
            opacity="0.6"
          />
          <path
            d="M 62 51 L 56 51 L 57 56 Z"
            fill={palette.topDark}
            opacity="0.6"
          />
          {/* Two tiny pearl-style buttons down the placket — small
              enough to read as detail, not as scrubs snaps. The TOP
              button is deliberately absent (top button undone). */}
          <circle cx="50" cy="65" r="0.7" fill={palette.topDark} opacity="0.7" />
          <circle cx="50" cy="71" r="0.7" fill={palette.topDark} opacity="0.7" />
          {/* Subtle linen-grain texture on the shirt body */}
          <g stroke={palette.topDark} strokeOpacity="0.14" strokeWidth="0.5" fill="none" strokeLinecap="round">
            <path d="M 28 65 Q 30 78 27 90" />
            <path d="M 72 65 Q 70 78 73 90" />
            <path d="M 36 60 Q 37 75 35 88" />
            <path d="M 64 60 Q 63 75 65 88" />
          </g>
          {/* Leather cord with a small wooden bead — the retreat
              memento. Replaces the prior silver pendant which read as
              a clinic ID badge. The cord wraps around the back of the
              neck; we only show the front drape. */}
          <path
            d="M 47 51 Q 49 56 50 60 Q 51 56 53 51"
            stroke="#5C3D24"
            strokeWidth="0.4"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          <ellipse cx="50" cy="60.4" rx="0.95" ry="1.25" fill="#8B6240" stroke="#4A2E1C" strokeWidth="0.25" />
          <ellipse cx="50" cy="60.1" rx="0.4" ry="0.45" fill="#A88262" opacity="0.7" />
        </g>
      )}

      {/* Neck — visible beneath head, slight cylinder */}
      {showBody && (
        <path
          d="M 44 48 L 44 54 Q 50 56 56 54 L 56 48 Z"
          fill={palette.skinShadow}
          opacity="0.9"
        />
      )}

      {/* Arms by pose */}
      {renderArms(pose, palette)}

      {/* Head */}
      <g
        id="quinn-head"
        style={{ transformOrigin: '50px 34px' }}
        transform={headTransform(pose)}
      >
        {/* Ears */}
        <ellipse cx="32" cy="36" rx="3.2" ry="5.5" fill={palette.skinShadow} />
        <ellipse cx="32" cy="37" rx="1.6" ry="3.2" fill="#D4996E" />
        <ellipse cx="68" cy="36" rx="3.2" ry="5.5" fill={palette.skinShadow} />
        <ellipse cx="68" cy="37" rx="1.6" ry="3.2" fill="#D4996E" />

        {/* Head — slightly more sculpted egg shape with a hint of
            jaw definition at the bottom corners. The prior shape was
            rounder/softer; the new shape sharpens the chin angle so
            the jawline reads more "leading-man" than "boyish". */}
        <path
          d="M 34 28 C 34 18, 42 14, 50 14 C 58 14, 66 18, 66 28
             C 66 38, 64 46, 61 50 L 58 53 Q 50 55 42 53 L 39 50
             C 36 46, 34 38, 34 28 Z"
          fill="url(#quinn-skin)"
        />
        {/* Jaw shadow — defines the jawline edge subtly */}
        <path
          d="M 38 47 Q 42 52 50 53 Q 58 52 62 47"
          stroke={palette.skinShadow}
          strokeOpacity="0.4"
          strokeWidth="0.6"
          fill="none"
          strokeLinecap="round"
        />

        {/* Hair — Gosling-coded side sweep. Side part on the LEFT
            (viewer's right), with volume and a forward wisp. */}
        <g>
          {/* Hair main body */}
          <path
            d="M 33 26 Q 33 14 42 12 Q 47 9 51 12 Q 56 9 60 12
               Q 66 13 67 22 Q 67 27 65 28
               Q 64 19 56 17 Q 51 17 49 21
               Q 44 23 41 18 Q 36 22 33 26 Z"
            fill={palette.hair}
          />
          {/* Volume highlight along the top — sun catching the wave */}
          <path
            d="M 39 14 Q 50 10 60 14 Q 56 17 50 16 Q 44 17 39 14 Z"
            fill="url(#quinn-hair-shine)"
            opacity="0.85"
          />
          {/* Forward swept tuft falling over the right brow */}
          <path
            d="M 45 16 Q 50 14 56 17 Q 54 22 49 22 Q 46 21 45 16 Z"
            fill={palette.hairLight}
            opacity="0.75"
          />
          {/* Side part suggestion — a hairline crack near the temple */}
          <path
            d="M 56 12 Q 58 17 60 22"
            stroke={palette.hair}
            strokeOpacity="0.55"
            strokeWidth="0.45"
            fill="none"
            strokeLinecap="round"
          />
          {/* A few stray strands for the lived-in mess */}
          <path
            d="M 38 18 Q 40 16 43 17"
            stroke={palette.hairLight}
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 57 17 Q 60 16 63 19"
            stroke={palette.hairLight}
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>

        {/* Eyebrows — slightly thinner + shaped, with a gentle outer
            arch. Less "thick caterpillar", more "deliberate". */}
        {renderEyebrows(pose)}

        {/* Nose — soft form with a touch more bridge definition */}
        <path
          d="M 49 35 Q 49 38 49.5 41 Q 50 42.5 51.5 42.5 Q 49.5 43 48.5 41.5 Q 48 39 49 35 Z"
          fill={palette.skinShadow}
          opacity="0.45"
        />
        <circle cx="50" cy="42" r="0.6" fill="#FFE0C4" opacity="0.55" />

        {/* Cheek hint — softer than before so it doesn't read childlike */}
        <circle cx="39" cy="44" r="3.5" fill="url(#quinn-cheek)" />
        <circle cx="61" cy="44" r="3.5" fill="url(#quinn-cheek)" />
        {/* Cheekbone highlight — tiny touch of warm light catching */}
        <ellipse cx="40" cy="40" rx="2" ry="0.8" fill="#FFD9AE" opacity="0.35" />
        <ellipse cx="60" cy="40" rx="2" ry="0.8" fill="#FFD9AE" opacity="0.35" />

        {/* Eyes */}
        {renderEyes(pose, palette)}

        {/* Mouth */}
        {renderMouth(pose)}

        {/* Stubble — five-o'clock shadow hugging the jawline. NOT a
            block of beard; this is a soft, low-opacity wash that
            defines the jaw shape rather than overlaying it with a
            cartoon shape. */}
        {palette.facialHair && (
          <g opacity="0.55">
            {/* Mustache — a thin shadow under the nose, no thick line */}
            <path
              d="M 44 44 Q 47 45.5 50 45 Q 53 45.5 56 44"
              stroke={palette.facialHair}
              strokeWidth="0.9"
              strokeOpacity="0.7"
              fill="none"
              strokeLinecap="round"
            />
            {/* Jawline stubble — follows the jaw curve as a soft band */}
            <path
              d="M 38 46 Q 41 51 50 52.5 Q 59 51 62 46
                 Q 60 50 56 51 Q 50 52 44 51 Q 40 50 38 46 Z"
              fill={palette.facialHair}
              opacity="0.55"
            />
            {/* Soul-patch hint — tiny shadow under lower lip */}
            <ellipse cx="50" cy="48" rx="1.5" ry="0.6" fill={palette.facialHair} opacity="0.5" />
            {/* Sideburns — short, fading down the side of the face */}
            <path
              d="M 35.5 35 Q 35 41 37 45"
              stroke={palette.facialHair}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              opacity="0.65"
            />
            <path
              d="M 64.5 35 Q 65 41 63 45"
              stroke={palette.facialHair}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
              opacity="0.65"
            />
          </g>
        )}
      </g>
    </>
  );
}

function renderEyebrows(pose: BodhiPose): ReactNode {
  // Thinner, shaped brows with a gentle arch at the outer end. The
  // raise on celebrate/wave/idle gives the playful Gosling lift —
  // "Yeah, I see you" energy.
  const liftY = pose === 'celebrate' || pose === 'wave' || pose === 'idle' ? -0.6 : 0;
  return (
    <>
      {/* Left brow — slight outer arch */}
      <path
        d={`M 39 ${29 + liftY} Q 43 ${27.4 + liftY} 47.5 ${28.4 + liftY}
            Q 43.5 ${28.6 + liftY} 39 ${29.4 + liftY} Z`}
        fill={BROW}
      />
      {/* Right brow — slightly higher arch (asymmetric, magnetic) */}
      <path
        d={`M 52.5 ${28.3 + liftY} Q 57 ${27.2 + liftY} 61 ${29 + liftY}
            Q 57 ${28.5 + liftY} 52.5 ${29.3 + liftY} Z`}
        fill={BROW}
      />
    </>
  );
}

function renderEyes(pose: BodhiPose, palette: MascotPalette): ReactNode {
  if (pose === 'meditate') {
    // Soft closed lids with a hint of upper lash
    return (
      <>
        <path d="M 41 33 Q 44 35 47 33" stroke={EYE_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M 53 33 Q 56 35 59 33" stroke={EYE_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    // Crinkled-from-laughing eyes — happy squint with crow's feet
    return (
      <>
        <path d="M 40 34 Q 44 30.5 48 34" stroke={EYE_DARK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 52 34 Q 56 30.5 60 34" stroke={EYE_DARK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* Crow's feet — the Gosling tell */}
        <g stroke={palette.skinShadow} strokeOpacity="0.5" strokeWidth="0.45" fill="none" strokeLinecap="round">
          <path d="M 38 33 L 36.5 32" />
          <path d="M 38 35 L 36.5 35" />
          <path d="M 62 33 L 63.5 32" />
          <path d="M 62 35 L 63.5 35" />
        </g>
      </>
    );
  }
  // Default — warm engaged eyes with a slightly hooded upper lid for
  // the "magnetic gaze" feel. Smaller-than-before whites + a more
  // visible upper-lid line read older / more grounded than the prior
  // wide-open boyish stare.
  return (
    <>
      {/* Whites */}
      <ellipse cx="44" cy="33.2" rx="2.6" ry="1.85" fill="#FBFAF4" />
      <ellipse cx="56" cy="33.2" rx="2.6" ry="1.85" fill="#FBFAF4" />
      {/* Iris */}
      <circle cx="44" cy="33.3" r="1.55" fill={EYE_IRIS} />
      <circle cx="56" cy="33.3" r="1.55" fill={EYE_IRIS} />
      {/* Pupil */}
      <circle cx="44" cy="33.3" r="0.85" fill={EYE_DARK} />
      <circle cx="56" cy="33.3" r="0.85" fill={EYE_DARK} />
      {/* Highlight catch — top-right for the "warm light" feel */}
      <circle cx="44.5" cy="32.5" r="0.5" fill="white" />
      <circle cx="56.5" cy="32.5" r="0.5" fill="white" />
      {/* Hooded upper lid — subtle line that gives a slightly
          heavy-lidded charm */}
      <path
        d="M 41.4 31.7 Q 44 30.9 46.6 31.7"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.55"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 53.4 31.7 Q 56 30.9 58.6 31.7"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.55"
        fill="none"
        strokeLinecap="round"
      />
      {/* Lower lid hint */}
      <path
        d="M 42 34.7 Q 44 35.2 46 34.7"
        stroke={palette.skinShadow}
        strokeOpacity="0.45"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 54 34.7 Q 56 35.2 58 34.7"
        stroke={palette.skinShadow}
        strokeOpacity="0.45"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function renderMouth(pose: BodhiPose): ReactNode {
  // The new SIGNATURE: an asymmetric closed-lip smirk. Right corner
  // (viewer's right) lifts slightly higher than the left for that
  // "Gosling half-grin" charm. Replaces the prior open-toothy-grin
  // which felt childlike. Big-toothed celebrate is preserved for the
  // genuine-laugh moment.
  if (pose === 'meditate') {
    return (
      <path
        d="M 45 45 Q 50 47 55 45"
        stroke={MOUTH}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (pose === 'celebrate') {
    // Genuine laugh — open smile with subtle teeth glimpse
    return (
      <g>
        <path
          d="M 41 44 Q 50 51 59 44 Q 57 47 50 47.5 Q 43 47 41 44 Z"
          fill={MOUTH}
        />
        <rect x="44" y="44.4" width="12" height="2" fill={TEETH} opacity="0.95" />
        <path
          d="M 41 44 Q 50 43 59 44"
          stroke={LIP_TINT}
          strokeWidth="0.5"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    );
  }
  // Default — closed-lip asymmetric smirk. Subtle but present.
  return (
    <g>
      {/* Lip line — gentle curve up from left to right corner */}
      <path
        d="M 43.5 46 Q 50 47.4 57 45.6"
        stroke={MOUTH}
        strokeWidth="1.05"
        fill="none"
        strokeLinecap="round"
      />
      {/* Right corner lift — the asymmetric lift that makes the smirk
          read as charming instead of neutral */}
      <path
        d="M 56.4 45.7 Q 57.6 45.1 58 45.4"
        stroke={MOUTH}
        strokeWidth="0.85"
        fill="none"
        strokeLinecap="round"
      />
      {/* Lip-tint shadow under lower lip — adds dimension */}
      <path
        d="M 46 47.5 Q 50 48.4 54 47.4"
        stroke={LIP_TINT}
        strokeOpacity="0.6"
        strokeWidth="0.55"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderArms(pose: BodhiPose, palette: MascotPalette): ReactNode {
  const sleeve = 'url(#quinn-shirt)';
  const skin = palette.skin;
  const wristbandColor = '#5C3D24';
  const wristbandAccent = palette.topAccent;

  // Leather-wrap wristband — chunkier, more masculine than the prior
  // braided friendship-bracelet. A single tiny teal bead keeps the
  // signature accent without going clinical.
  const Wristband = ({ cx, cy }: { cx: number; cy: number }) => (
    <g>
      <ellipse cx={cx} cy={cy} rx="3.6" ry="1.6" fill={wristbandColor} />
      {/* Wrap lines around the band */}
      <path
        d={`M ${cx - 3} ${cy - 0.4} Q ${cx} ${cy + 0.5} ${cx + 3} ${cy - 0.4}`}
        stroke="#3E2A18"
        strokeWidth="0.4"
        fill="none"
      />
      <path
        d={`M ${cx - 3} ${cy + 0.6} Q ${cx} ${cy - 0.3} ${cx + 3} ${cy + 0.6}`}
        stroke="#3E2A18"
        strokeWidth="0.4"
        fill="none"
      />
      {/* Single teal bead */}
      <circle cx={cx + 2.4} cy={cy - 0.3} r="0.65" fill={wristbandAccent} />
      <circle cx={cx + 2.6} cy={cy - 0.45} r="0.2" fill="#FFFFFF" opacity="0.55" />
    </g>
  );

  switch (pose) {
    case 'meditate':
      return (
        <g>
          <path d="M 28 58 Q 34 72 42 80 L 58 80 Q 66 72 72 58" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="42" cy="80" rx="5.5" ry="3.8" fill={skin} />
          <ellipse cx="58" cy="80" rx="5.5" ry="3.8" fill={skin} />
          <Wristband cx={37} cy={77.5} />
          <Wristband cx={63} cy={77.5} />
        </g>
      );
    case 'celebrate':
      return (
        <g>
          <path d="M 28 58 Q 18 36 22 14" stroke={sleeve} strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M 72 58 Q 82 36 78 14" stroke={sleeve} strokeWidth="8" fill="none" strokeLinecap="round" />
          <circle cx="22" cy="13" r="5" fill={skin} />
          <circle cx="78" cy="13" r="5" fill={skin} />
          <Wristband cx={23} cy={18} />
          <Wristband cx={77} cy={18} />
          <g stroke={palette.topAccent} strokeWidth="1.5" strokeLinecap="round" opacity="0.9">
            <path d="M 16 7 L 14 5" />
            <path d="M 22 4 L 22 1" />
            <path d="M 28 7 L 30 5" />
            <path d="M 84 7 L 86 5" />
            <path d="M 78 4 L 78 1" />
            <path d="M 72 7 L 70 5" />
          </g>
        </g>
      );
    case 'wave':
      return (
        <g>
          <path d="M 70 56 Q 82 38 80 18" stroke={sleeve} strokeWidth="8" fill="none" strokeLinecap="round" />
          <circle cx="80" cy="17" r="5" fill={skin} />
          <Wristband cx={79} cy={23} />
          <path d="M 30 58 Q 16 66 18 82" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="18" cy="82" r="4.5" fill={skin} />
          <Wristband cx={18} cy={77} />
        </g>
      );
    case 'think':
      return (
        <g>
          <path d="M 68 58 Q 64 54 58 48" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="57" cy="46" r="3.8" fill={skin} />
          <path d="M 32 58 Q 18 66 20 84" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="20" cy="84" r="4.2" fill={skin} />
          <Wristband cx={20} cy={79} />
        </g>
      );
    case 'listen':
      return (
        <g>
          <path d="M 32 58 Q 34 74 38 84" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <path d="M 68 58 Q 66 74 62 84" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="38" cy="84" r="4.2" fill={skin} />
          <circle cx="62" cy="84" r="4.2" fill={skin} />
          <Wristband cx={38} cy={79} />
          <Wristband cx={62} cy={79} />
        </g>
      );
    case 'write':
      return (
        <g>
          <path d="M 68 60 Q 68 68 62 72" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="62" cy="72" r="3.8" fill={skin} />
          <path d="M 60 72 L 74 56" stroke="#8B7355" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 74 56 Q 78 48 82 50 Q 80 54 76 58 Z" fill="#C4A675" stroke="#8B7355" strokeWidth="0.6" />
          <path d="M 30 58 Q 16 68 20 84" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="20" cy="84" r="4.2" fill={skin} />
          <Wristband cx={20} cy={79} />
        </g>
      );
    case 'peek':
      return null;
    case 'idle':
    default:
      // Welcoming open-arm pose, but more relaxed than the prior
      // version. Elbows bend outward less aggressively, palms cup
      // slightly — "hey, you're good here" not "tah-dah!".
      return (
        <g>
          <path
            d="M 28 58 Q 17 63 16 75"
            stroke={sleeve}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 72 58 Q 83 63 84 75"
            stroke={sleeve}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          {/* Palms — slightly cupped, fingers relaxed */}
          <g>
            <path
              d="M 11 73 Q 16 71 20 75 Q 18 79 13 79 Q 10 77 11 73 Z"
              fill={skin}
            />
            <g stroke={palette.skinShadow} strokeOpacity="0.32" strokeWidth="0.5" strokeLinecap="round">
              <line x1="13" y1="73" x2="13" y2="76" />
              <line x1="15" y1="72" x2="15" y2="76" />
              <line x1="17" y1="72.5" x2="17" y2="76" />
            </g>
          </g>
          <g>
            <path
              d="M 89 73 Q 84 71 80 75 Q 82 79 87 79 Q 90 77 89 73 Z"
              fill={skin}
            />
            <g stroke={palette.skinShadow} strokeOpacity="0.32" strokeWidth="0.5" strokeLinecap="round">
              <line x1="87" y1="73" x2="87" y2="76" />
              <line x1="85" y1="72" x2="85" y2="76" />
              <line x1="83" y1="72.5" x2="83" y2="76" />
            </g>
          </g>
          <Wristband cx={19} cy={74} />
          <Wristband cx={81} cy={74} />
        </g>
      );
  }
}
