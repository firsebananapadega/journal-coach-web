import type { ReactNode } from 'react';
import type { BodhiPose } from '../poses';
import { headTransform } from '../poses';
import type { MascotPalette } from '../palettes';

// Humanized Bodhi body — modeled on the 3D reference avatar
// (public/avatars/Bodhi.jpg). Still SVG / cartoon-simple but with
// enough facial structure (eye whites, iris, pupil, eyebrows, nose,
// distinct mustache, layered beard) to read as a person rather than
// a geometric icon. All 8 poses supported.

const EYE_DARK = '#2A1B12';
const EYE_IRIS = '#6B4A2E';
const MOUTH = '#5A3D2A';
const LIP_TINT = '#8B4E35';
const BEARD_DARK = '#9B9893';
const BEARD_LIGHT = '#CFCCC6';

export interface BodyProps {
  pose: BodhiPose;
  palette: MascotPalette;
}

export default function BodhiBody({ pose, palette }: BodyProps) {
  const showBody = pose !== 'peek';

  return (
    <>
      <defs>
        <linearGradient id="bodhi-robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.top} />
          <stop offset="1" stopColor={palette.topDark} />
        </linearGradient>
        <linearGradient id="bodhi-tunic" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F5E8D0" />
          <stop offset="1" stopColor="#E0D0AE" />
        </linearGradient>
        <linearGradient id="bodhi-beard-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BEARD_LIGHT} />
          <stop offset="1" stopColor={BEARD_DARK} />
        </linearGradient>
        <radialGradient id="bodhi-skin" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFDEB8" />
          <stop offset="0.6" stopColor={palette.skin} />
          <stop offset="1" stopColor={palette.skinShadow} />
        </radialGradient>
        <radialGradient id="bodhi-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F09E6B" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F09E6B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showBody && (
        <g id="bodhi-body">
          {/* Shoulder shadow hint */}
          <ellipse cx="50" cy="55" rx="28" ry="4" fill={palette.topDark} opacity="0.25" />
          {/* Robe bell with subtle curve at shoulders */}
          <path
            d="M 22 56 C 22 64, 20 74, 16 95 L 84 95 C 80 74, 78 64, 78 56 C 74 52, 64 50, 50 50 C 36 50, 26 52, 22 56 Z"
            fill="url(#bodhi-robe)"
          />
          {/* Inner tunic — cream V peeking through robe collar */}
          <path d="M 42 52 L 50 65 L 58 52 Z" fill="url(#bodhi-tunic)" />
          <path
            d="M 42 52 L 50 65"
            stroke={palette.topDark}
            strokeOpacity="0.4"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            d="M 58 52 L 50 65"
            stroke={palette.topDark}
            strokeOpacity="0.4"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          {/* Kasāya diagonal drape — from left shoulder across chest,
              breaks up the monolithic block of saffron and signals
              traditional monastic wrapping, not a prison jumpsuit. */}
          <path
            d="M 24 55 Q 40 60 62 65 L 78 66 L 78 72 Q 56 70 30 66 Q 24 64 24 55 Z"
            fill={palette.topDark}
            opacity="0.45"
          />
          <path
            d="M 24 55 Q 40 60 62 65"
            stroke={palette.topAccent}
            strokeOpacity="0.7"
            strokeWidth="0.9"
            fill="none"
            strokeLinecap="round"
          />
          {/* Mala / prayer beads at the neck — small brown beads in a
              semicircle that reads as spiritual jewelry. */}
          <g fill="#6B4E2E">
            <circle cx="41" cy="51" r="0.9" />
            <circle cx="44" cy="52.2" r="0.9" />
            <circle cx="47" cy="52.8" r="0.9" />
            <circle cx="50" cy="53" r="1.1" />
            <circle cx="53" cy="52.8" r="0.9" />
            <circle cx="56" cy="52.2" r="0.9" />
            <circle cx="59" cy="51" r="0.9" />
          </g>
          {/* Robe drape folds — three subtle vertical curves */}
          <path
            d="M 50 66 Q 50 80 50 93"
            stroke={palette.topDark}
            strokeOpacity="0.32"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 30 62 Q 32 80 28 93"
            stroke={palette.topDark}
            strokeOpacity="0.22"
            strokeWidth="0.9"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 70 62 Q 68 80 72 93"
            stroke={palette.topDark}
            strokeOpacity="0.22"
            strokeWidth="0.9"
            fill="none"
            strokeLinecap="round"
          />
          {/* Sash */}
          <path
            d="M 25 72 Q 50 76 75 72"
            stroke={palette.topAccent}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Sash knot + hanging ties */}
          <ellipse cx="50" cy="73" rx="2.6" ry="1.8" fill={palette.topAccent} />
          <path
            d="M 48.5 74.5 Q 48 78 47 80"
            stroke={palette.topAccent}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 51.5 74.5 Q 52 78 53 80"
            stroke={palette.topAccent}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>
      )}

      {/* Neck — visible peach under the head */}
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
        id="bodhi-head"
        style={{ transformOrigin: '50px 34px' }}
        transform={headTransform(pose)}
      >
        {/* Ears with lobes */}
        <g>
          <ellipse cx="31" cy="36" rx="3" ry="5.2" fill={palette.skinShadow} />
          <path
            d="M 30.5 34 Q 29.5 36 30.5 39"
            stroke="#B88662"
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="31" cy="41" r="1.3" fill={palette.skinShadow} />

          <ellipse cx="69" cy="36" rx="3" ry="5.2" fill={palette.skinShadow} />
          <path
            d="M 69.5 34 Q 70.5 36 69.5 39"
            stroke="#B88662"
            strokeWidth="0.8"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="69" cy="41" r="1.3" fill={palette.skinShadow} />
        </g>

        {/* Head — egg shape, slightly pointed at chin */}
        <path
          d="M 34 28 C 34 18, 42 14, 50 14 C 58 14, 66 18, 66 28 C 66 40, 64 48, 60 52 C 55 55, 45 55, 40 52 C 36 48, 34 40, 34 28 Z"
          fill="url(#bodhi-skin)"
        />
        {/* Bald-crown highlight */}
        <ellipse cx="48" cy="20" rx="8" ry="3.5" fill="#FFEAD2" opacity="0.55" />
        {/* Temple shading */}
        <path
          d="M 35 30 Q 36 37 39 42"
          stroke={palette.skinShadow}
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 65 30 Q 64 37 61 42"
          stroke={palette.skinShadow}
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />

        {/* Eyebrows */}
        {renderEyebrows(pose)}

        {/* Eyes */}
        {renderEyes(pose, palette)}

        {/* Nose — rounded small triangular form */}
        <path
          d="M 49 35 Q 50 38 50 40 Q 50 41.5 51 41.5 Q 49 42 48.5 41 Q 48 39 49 35 Z"
          fill={palette.skinShadow}
          opacity="0.45"
        />
        {/* Nose tip highlight */}
        <circle cx="50" cy="41" r="0.8" fill="#FFE0C4" opacity="0.6" />

        {/* Cheek blush */}
        <circle cx="39" cy="43" r="3.5" fill="url(#bodhi-cheek)" />
        <circle cx="61" cy="43" r="3.5" fill="url(#bodhi-cheek)" />

        {/* Mustache — curved line above the mouth, distinct from beard */}
        <path
          d="M 43 44 Q 46 47 50 46 Q 54 47 57 44"
          stroke={BEARD_DARK}
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 45 45 Q 47 46.5 50 46"
          stroke={BEARD_LIGHT}
          strokeWidth="0.6"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Mouth */}
        {renderMouth(pose)}

        {/* Beard — main shape + wisp texture */}
        <path
          d="M 36 46 Q 33 53 37 58 Q 42 61 50 59 Q 58 61 63 58 Q 67 53 64 46 Q 60 52 50 52 Q 40 52 36 46 Z"
          fill="url(#bodhi-beard-grad)"
        />
        {/* Wisp lines for hair texture */}
        <g stroke={BEARD_DARK} strokeOpacity="0.65" strokeWidth="0.55" strokeLinecap="round" fill="none">
          <path d="M 39 52 Q 39 56 38 59" />
          <path d="M 43 53 Q 43 57 42 60" />
          <path d="M 47 53 Q 47 58 47 61" />
          <path d="M 50 53 Q 50 58 50 61" />
          <path d="M 53 53 Q 53 58 53 61" />
          <path d="M 57 53 Q 57 57 58 60" />
          <path d="M 61 52 Q 61 56 62 59" />
        </g>
      </g>
    </>
  );
}

function renderEyebrows(pose: BodhiPose): ReactNode {
  // Meditate keeps them soft & relaxed. Think furrows slightly.
  // Celebrate raises them high.
  if (pose === 'think') {
    return (
      <>
        <path d="M 40 30 Q 44 29 47 31" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M 53 31 Q 56 29 60 30" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    return (
      <>
        <path d="M 40 28 Q 44 25 47 27" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <path d="M 53 27 Q 56 25 60 28" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <path d="M 40 29 Q 44 27 47 29" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M 53 29 Q 56 27 60 29" stroke={BEARD_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  );
}

function renderEyes(pose: BodhiPose, palette: MascotPalette): ReactNode {
  if (pose === 'meditate') {
    return (
      <>
        <path d="M 41 34 Q 44 36 47 34" stroke={EYE_DARK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M 53 34 Q 56 36 59 34" stroke={EYE_DARK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M 41 34 L 40.3 35.3" stroke={EYE_DARK} strokeWidth="0.7" strokeLinecap="round" />
        <path d="M 59 34 L 59.7 35.3" stroke={EYE_DARK} strokeWidth="0.7" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    return (
      <>
        <path d="M 40 34 Q 44 30 48 34" stroke={EYE_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M 52 34 Q 56 30 60 34" stroke={EYE_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    );
  }
  // Open eyes — whites + iris + pupil + highlight + lower eyelid hint
  return (
    <>
      <ellipse cx="44" cy="33.5" rx="2.4" ry="1.9" fill="#FBFAF4" />
      <ellipse cx="56" cy="33.5" rx="2.4" ry="1.9" fill="#FBFAF4" />
      <circle cx="44" cy="33.5" r="1.55" fill={EYE_IRIS} />
      <circle cx="56" cy="33.5" r="1.55" fill={EYE_IRIS} />
      <circle cx="44" cy="33.5" r="0.85" fill={EYE_DARK} />
      <circle cx="56" cy="33.5" r="0.85" fill={EYE_DARK} />
      <circle cx="44.55" cy="32.8" r="0.45" fill="white" />
      <circle cx="56.55" cy="32.8" r="0.45" fill="white" />
      {/* Lower eyelid crease */}
      <path
        d="M 42 35.2 Q 44 35.8 46 35.2"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 54 35.2 Q 56 35.8 58 35.2"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function renderMouth(pose: BodhiPose): ReactNode {
  if (pose === 'celebrate') {
    return (
      <g>
        <path d="M 44 47 Q 50 51 56 47 Q 50 49 44 47 Z" fill="#2A1810" />
        <path d="M 44 47 Q 50 47.8 56 47" stroke={LIP_TINT} strokeWidth="0.5" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // Gentle warm smile with subtle upper-lip hint
  return (
    <g>
      <path d="M 45 46.5 Q 50 48.5 55 46.5" stroke={MOUTH} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path
        d="M 46 46.5 Q 50 46 54 46.5"
        stroke={LIP_TINT}
        strokeWidth="0.5"
        strokeOpacity="0.65"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderArms(pose: BodhiPose, palette: MascotPalette): ReactNode {
  const sleeve = 'url(#bodhi-robe)';
  const skin = palette.skin;
  switch (pose) {
    case 'meditate':
      return (
        <g>
          {/* Sleeves */}
          <path
            d="M 22 57 Q 28 72 40 80"
            stroke={sleeve}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 78 57 Q 72 72 60 80"
            stroke={sleeve}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          {/* Cupped lotus-mudra hands */}
          <ellipse cx="50" cy="82" rx="10" ry="4.2" fill={skin} />
          <ellipse cx="50" cy="80" rx="8" ry="3" fill="#FFDDB8" opacity="0.55" />
          {/* Thumb ticks */}
          <circle cx="41" cy="80" r="1.7" fill={skin} />
          <circle cx="59" cy="80" r="1.7" fill={skin} />
          {/* Subtle finger divisions */}
          <path
            d="M 46 82 L 46 84 M 50 82 L 50 84 M 54 82 L 54 84"
            stroke={palette.skinShadow}
            strokeOpacity="0.4"
            strokeWidth="0.5"
            strokeLinecap="round"
          />
        </g>
      );
    case 'celebrate':
      return (
        <g>
          <path d="M 30 58 Q 18 40 22 20" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <path d="M 70 58 Q 82 40 78 20" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="22" cy="18" r="4.5" fill={skin} />
          <circle cx="78" cy="18" r="4.5" fill={skin} />
          <g stroke="var(--theme-primary-light)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M 16 12 L 13 10" />
            <path d="M 28 10 L 30 8" />
            <path d="M 22 8 L 22 5" />
            <path d="M 84 12 L 87 10" />
            <path d="M 72 10 L 70 8" />
            <path d="M 78 8 L 78 5" />
          </g>
        </g>
      );
    case 'wave':
      return (
        <g>
          <path d="M 70 56 Q 82 38 80 18" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="80" cy="17" r="5" fill={skin} />
          {/* Finger hints on waving hand */}
          <path
            d="M 78 13 L 78 11 M 80 12 L 80 10 M 82 13 L 82 11"
            stroke={palette.skinShadow}
            strokeOpacity="0.45"
            strokeWidth="0.6"
            strokeLinecap="round"
          />
          <path d="M 30 58 Q 26 74 30 86" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'think':
      return (
        <g>
          <path d="M 68 58 Q 64 54 58 48" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="57" cy="46" r="3.8" fill={skin} />
          <path d="M 32 58 Q 28 74 32 86" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'listen':
      return (
        <g>
          <path d="M 32 58 Q 34 74 38 84" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 68 58 Q 66 74 62 84" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="38" cy="84" r="3.8" fill={skin} />
          <circle cx="62" cy="84" r="3.8" fill={skin} />
        </g>
      );
    case 'write':
      return (
        <g>
          <path d="M 68 60 Q 68 68 62 72" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="62" cy="72" r="3.8" fill={skin} />
          <path d="M 60 72 L 74 56" stroke="#8B7355" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M 74 56 Q 78 48 82 50 Q 80 54 76 58 Z" fill="#C4A675" stroke="#8B7355" strokeWidth="0.6" />
          <path d="M 30 58 Q 26 74 30 86" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'peek':
      return null;
    case 'idle':
    default:
      return (
        <g>
          <path d="M 28 58 Q 22 74 26 88" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 72 58 Q 78 74 74 88" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}
