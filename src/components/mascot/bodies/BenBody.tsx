import type { ReactNode } from 'react';
import type { BodhiPose } from '../poses';
import { headTransform } from '../poses';
import type { MascotPalette } from '../palettes';

// Ben — The All-Rounder. Modeled on the 3D reference at
// /public/avatars/Ben.png. Tousled dark brown wavy hair, full kept
// brown beard, terracotta jacket over a cream henley with a three-
// button placket (Ben's quiet signature), kind hazel-brown eyes.
// Rendered at Bodhi/Quinn level of detail: gradients, layered eyes
// (whites + iris + pupil + highlight + lower lid), mustache distinct
// from beard with wisp lines, jacket lapel stitching, linen texture.

const EYE_DARK = '#2A1B12';
const EYE_IRIS = '#6B4A2E';
const MOUTH = '#4A2A18';
const LIP_TINT = '#8B4E35';

export interface BodyProps {
  pose: BodhiPose;
  palette: MascotPalette;
}

export default function BenBody({ pose, palette }: BodyProps) {
  const showBody = pose !== 'peek';
  const beardColor = palette.facialHair ?? palette.hair;

  return (
    <>
      <defs>
        <linearGradient id="ben-jacket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.top} />
          <stop offset="1" stopColor={palette.topDark} />
        </linearGradient>
        <linearGradient id="ben-henley" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF6EA" />
          <stop offset="1" stopColor={palette.inner ?? '#E8DFC9'} />
        </linearGradient>
        <linearGradient id="ben-beard-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.hairLight ?? beardColor} />
          <stop offset="1" stopColor={beardColor} />
        </linearGradient>
        <radialGradient id="ben-skin" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFDEB8" />
          <stop offset="0.6" stopColor={palette.skin} />
          <stop offset="1" stopColor={palette.skinShadow} />
        </radialGradient>
        <radialGradient id="ben-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#F09E6B" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F09E6B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showBody && (
        <g id="ben-body">
          {/* Shoulder shadow */}
          <ellipse cx="50" cy="55" rx="27" ry="3.5" fill={palette.topDark} opacity="0.25" />
          {/* Terracotta jacket bell shape */}
          <path
            d="M 24 56 C 24 64, 22 75, 17 95 L 83 95 C 78 75, 76 64, 76 56 C 72 53, 64 51, 50 51 C 36 51, 28 53, 24 56 Z"
            fill="url(#ben-jacket)"
          />
          {/* Henley — visible through open jacket, V-neck stops higher
              than Bodhi's tunic to leave room for the 3-button placket. */}
          <path d="M 41 52 L 50 84 L 59 52 Z" fill="url(#ben-henley)" />
          {/* Jacket lapels */}
          <path
            d="M 41 52 L 50 84"
            stroke={palette.topDark}
            strokeOpacity="0.55"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <path
            d="M 59 52 L 50 84"
            stroke={palette.topDark}
            strokeOpacity="0.55"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          {/* Subtle linen texture on the jacket */}
          <g stroke={palette.topDark} strokeOpacity="0.18" strokeWidth="0.5" fill="none" strokeLinecap="round">
            <path d="M 28 65 Q 30 78 27 90" />
            <path d="M 72 65 Q 70 78 73 90" />
            <path d="M 36 60 Q 37 75 35 88" />
            <path d="M 64 60 Q 63 75 65 88" />
          </g>
          {/* Signature 3-button henley placket — the detail that tells
              you it's Ben. Runs vertically down the center of the V. */}
          <g>
            {/* Placket stitching — faint vertical line */}
            <path
              d="M 50 54 L 50 72"
              stroke={palette.topDark}
              strokeOpacity="0.22"
              strokeWidth="0.4"
              fill="none"
            />
            {/* Three buttons */}
            <circle cx="50" cy="56.5" r="0.9" fill="#C2B59B" stroke="#8B7C5E" strokeWidth="0.25" />
            <circle cx="50" cy="61" r="0.9" fill="#C2B59B" stroke="#8B7C5E" strokeWidth="0.25" />
            <circle cx="50" cy="65.5" r="0.9" fill="#C2B59B" stroke="#8B7C5E" strokeWidth="0.25" />
            {/* Tiny highlight on each button */}
            <circle cx="49.7" cy="56.2" r="0.25" fill="#E4DAC3" opacity="0.7" />
            <circle cx="49.7" cy="60.7" r="0.25" fill="#E4DAC3" opacity="0.7" />
            <circle cx="49.7" cy="65.2" r="0.25" fill="#E4DAC3" opacity="0.7" />
          </g>
        </g>
      )}

      {/* Neck */}
      {showBody && (
        <path
          d="M 44 48 L 44 54 Q 50 56 56 54 L 56 48 Z"
          fill={palette.skinShadow}
          opacity="0.9"
        />
      )}

      {/* Arms */}
      {renderArms(pose, palette)}

      {/* Head */}
      <g
        id="ben-head"
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

        {/* Head — egg shape */}
        <path
          d="M 34 28 C 34 18, 42 14, 50 14 C 58 14, 66 18, 66 28 C 66 40, 64 48, 60 52 C 55 55, 45 55, 40 52 C 36 48, 34 40, 34 28 Z"
          fill="url(#ben-skin)"
        />
        {/* Forehead highlight */}
        <ellipse cx="48" cy="20" rx="7" ry="2.5" fill="#FFEAD2" opacity="0.5" />
        {/* Temple shading */}
        <path
          d="M 35 30 Q 36 37 39 42"
          stroke={palette.skinShadow}
          strokeOpacity="0.3"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 65 30 Q 64 37 61 42"
          stroke={palette.skinShadow}
          strokeOpacity="0.3"
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
        />

        {/* Tousled hair — wavy forward sweep with a messy forelock */}
        <g>
          <path
            d="M 33 26 Q 33 14 41 13 Q 46 9 51 13 Q 56 9 60 14 Q 67 14 67 26 Q 67 30 65 31 Q 63 22 56 20 Q 50 24 46 20 Q 41 24 37 20 Q 34 24 33 26 Z"
            fill={palette.hair}
          />
          {/* Forelock — tuft falling forward over forehead */}
          <path
            d="M 44 17 Q 49 13 54 17 Q 52 22 48 22 Q 45 22 44 17 Z"
            fill={palette.hairLight ?? palette.hair}
            opacity="0.85"
          />
          {/* Side volume — hair behind the ear */}
          <path
            d="M 33 28 Q 32 33 34 37"
            stroke={palette.hair}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 67 28 Q 68 33 66 37"
            stroke={palette.hair}
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Hair highlights — wavy strands catching light */}
          <path
            d="M 38 18 Q 42 16 46 18"
            stroke={palette.hairLight ?? palette.hair}
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.8"
          />
          <path
            d="M 54 18 Q 58 16 62 18"
            stroke={palette.hairLight ?? palette.hair}
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.8"
          />
        </g>

        {/* Eyebrows — thick brown, slightly expressive */}
        {renderEyebrows(pose, beardColor)}

        {/* Eyes */}
        {renderEyes(pose, palette)}

        {/* Nose */}
        <path
          d="M 49 35 Q 50 38 50 40 Q 50 41.5 51 41.5 Q 49 42 48.5 41 Q 48 39 49 35 Z"
          fill={palette.skinShadow}
          opacity="0.45"
        />
        <circle cx="50" cy="41" r="0.8" fill="#FFE0C4" opacity="0.6" />

        {/* Cheek blush */}
        <circle cx="39" cy="43" r="3.6" fill="url(#ben-cheek)" />
        <circle cx="61" cy="43" r="3.6" fill="url(#ben-cheek)" />

        {/* Mustache — distinct from beard, curves above upper lip */}
        <path
          d="M 43 44 Q 47 46.5 50 46 Q 53 46.5 57 44"
          stroke={beardColor}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M 45 45 Q 47 46 50 45.8"
          stroke={palette.hairLight ?? beardColor}
          strokeWidth="0.55"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Mouth */}
        {renderMouth(pose)}

        {/* Beard — main body + wisp texture */}
        <path
          d="M 36 45 Q 34 54 39 58 Q 45 61 50 60 Q 55 61 61 58 Q 66 54 64 45 Q 60 51 50 51 Q 40 51 36 45 Z"
          fill="url(#ben-beard-grad)"
        />
        {/* Beard wisps */}
        <g stroke={beardColor} strokeOpacity="0.55" strokeWidth="0.55" strokeLinecap="round" fill="none">
          <path d="M 39 51 Q 39 55 38 58" />
          <path d="M 43 52 Q 43 56 42 59" />
          <path d="M 47 52.5 Q 47 57 47 60" />
          <path d="M 50 53 Q 50 57.5 50 60" />
          <path d="M 53 52.5 Q 53 57 53 60" />
          <path d="M 57 52 Q 57 56 58 59" />
          <path d="M 61 51 Q 61 55 62 58" />
        </g>
        {/* Sideburns connecting beard to hair */}
        <path
          d="M 36 36 Q 35 42 37 46"
          stroke={beardColor}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 64 36 Q 65 42 63 46"
          stroke={beardColor}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>
    </>
  );
}

function renderEyebrows(pose: BodhiPose, brow: string): ReactNode {
  if (pose === 'think') {
    return (
      <>
        <path d="M 40 30 Q 44 29 47 31" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M 53 31 Q 56 29 60 30" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    return (
      <>
        <path d="M 40 27 Q 44 24 47 26" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M 53 26 Q 56 24 60 27" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <path d="M 40 29 Q 44 27 47 29" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M 53 29 Q 56 27 60 29" stroke={brow} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </>
  );
}

function renderEyes(pose: BodhiPose, palette: MascotPalette): ReactNode {
  if (pose === 'meditate') {
    return (
      <>
        <path d="M 41 34 Q 44 36 47 34" stroke={EYE_DARK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M 53 34 Q 56 36 59 34" stroke={EYE_DARK} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M 41 34 L 40.3 35.3" stroke={EYE_DARK} strokeWidth="0.6" strokeLinecap="round" />
        <path d="M 59 34 L 59.7 35.3" stroke={EYE_DARK} strokeWidth="0.6" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    return (
      <>
        <path d="M 40 34 Q 44 30 48 34" stroke={EYE_DARK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M 52 34 Q 56 30 60 34" stroke={EYE_DARK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>
    );
  }
  // Open kind hazel-brown eyes — whites + iris + pupil + highlight + lower lid
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
      {/* Lower lid crease */}
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
  // Warm closed-mouth smile — grounded, friendly
  return (
    <g>
      <path d="M 45 47 Q 50 49 55 47" stroke={MOUTH} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path
        d="M 46 47 Q 50 46.5 54 47"
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
  const sleeve = 'url(#ben-jacket)';
  const skin = palette.skin;
  const cuff = palette.inner ?? '#F5F0E6';
  switch (pose) {
    case 'meditate':
      return (
        <g>
          <path d="M 28 58 Q 34 72 42 80 L 58 80 Q 66 72 72 58" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="42" cy="80" rx="5.5" ry="3.8" fill={skin} />
          <ellipse cx="58" cy="80" rx="5.5" ry="3.8" fill={skin} />
          <ellipse cx="38" cy="78" rx="1.5" ry="2" fill={cuff} />
          <ellipse cx="62" cy="78" rx="1.5" ry="2" fill={cuff} />
          <path
            d="M 40 80 L 40 82 M 44 80 L 44 82 M 56 80 L 56 82 M 60 80 L 60 82"
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
          <ellipse cx="23" cy="24" rx="1.5" ry="1.8" fill={cuff} />
          <ellipse cx="77" cy="24" rx="1.5" ry="1.8" fill={cuff} />
        </g>
      );
    case 'wave':
      return (
        <g>
          <path d="M 70 56 Q 82 38 80 18" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="80" cy="17" r="5" fill={skin} />
          <ellipse cx="78" cy="24" rx="1.5" ry="1.8" fill={cuff} />
          <path
            d="M 78 13 L 78 11 M 80 12 L 80 10 M 82 13 L 82 11"
            stroke={palette.skinShadow}
            strokeOpacity="0.45"
            strokeWidth="0.55"
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
          <ellipse cx="38" cy="80" rx="1.5" ry="1.8" fill={cuff} />
          <ellipse cx="62" cy="80" rx="1.5" ry="1.8" fill={cuff} />
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
          <ellipse cx="26" cy="86" rx="1.5" ry="2" fill={cuff} />
          <ellipse cx="74" cy="86" rx="1.5" ry="2" fill={cuff} />
        </g>
      );
  }
}
