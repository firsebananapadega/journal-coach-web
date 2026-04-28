import type { ReactNode } from 'react';
import type { BodhiPose } from '../poses';
import { headTransform } from '../poses';
import type { MascotPalette } from '../palettes';

// Sage — The Therapeutic Presence. Warm feminine guide with long
// auburn wavy hair, sage-green cardigan over cream top. Modeled on the
// 3D reference at /public/avatars/Sage.png. Rendered at Bodhi/Quinn
// level of detail: gradients, layered eyes (whites + iris + pupil +
// highlight + lower lid), cheek blush, subtle cardigan folds, hair
// flowing past shoulders, a small signature pendant at the neckline.

const EYE_DARK = '#2A1B12';
const EYE_IRIS = '#7A5A3E';
const MOUTH = '#6B3E2A';
const LIP_TINT = '#A8584A';

export interface BodyProps {
  pose: BodhiPose;
  palette: MascotPalette;
}

export default function SageBody({ pose, palette }: BodyProps) {
  const showBody = pose !== 'peek';

  return (
    <>
      <defs>
        <linearGradient id="sage-cardigan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.top} />
          <stop offset="1" stopColor={palette.topDark} />
        </linearGradient>
        <linearGradient id="sage-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBF6EA" />
          <stop offset="1" stopColor={palette.inner ?? '#E8DFC9'} />
        </linearGradient>
        <linearGradient id="sage-hair-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.hairLight} />
          <stop offset="1" stopColor={palette.hair} />
        </linearGradient>
        <radialGradient id="sage-skin" cx="40%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFE0B8" />
          <stop offset="0.6" stopColor={palette.skin} />
          <stop offset="1" stopColor={palette.skinShadow} />
        </radialGradient>
        <radialGradient id="sage-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#E88A8F" stopOpacity="0.55" />
          <stop offset="1" stopColor="#E88A8F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showBody && (
        <g id="sage-body">
          {/* Long hair falling over shoulders — drawn BEHIND the body so
              the cardigan overlaps the front locks. */}
          <path
            d="M 24 50 Q 20 68 22 90 L 30 92 Q 28 70 32 52 Z"
            fill="url(#sage-hair-grad)"
            opacity="0.95"
          />
          <path
            d="M 76 50 Q 80 68 78 90 L 70 92 Q 72 70 68 52 Z"
            fill="url(#sage-hair-grad)"
            opacity="0.95"
          />
          {/* Hair strand highlights — soft S-curves down each side */}
          <path
            d="M 26 55 Q 24 70 26 88"
            stroke={palette.hairLight}
            strokeOpacity="0.55"
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 74 55 Q 76 70 74 88"
            stroke={palette.hairLight}
            strokeOpacity="0.55"
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
          />

          {/* Shoulder shadow hint */}
          <ellipse cx="50" cy="55" rx="27" ry="3.5" fill={palette.topDark} opacity="0.25" />
          {/* Cardigan bell shape */}
          <path
            d="M 24 56 C 24 64, 22 75, 17 95 L 83 95 C 78 75, 76 64, 76 56 C 72 53, 64 51, 50 51 C 36 51, 28 53, 24 56 Z"
            fill="url(#sage-cardigan)"
          />
          {/* Cream top visible in the V — soft drape reaching mid-torso */}
          <path d="M 40 52 L 50 82 L 60 52 Z" fill="url(#sage-top)" />
          {/* Cardigan front edges — two soft diagonal stitch lines */}
          <path
            d="M 40 52 L 50 82"
            stroke={palette.topDark}
            strokeOpacity="0.55"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M 60 52 L 50 82"
            stroke={palette.topDark}
            strokeOpacity="0.55"
            strokeWidth="1"
            strokeLinecap="round"
          />
          {/* Subtle cardigan fold lines */}
          <g stroke={palette.topDark} strokeOpacity="0.22" strokeWidth="0.7" fill="none" strokeLinecap="round">
            <path d="M 30 62 Q 32 78 28 92" />
            <path d="M 70 62 Q 68 78 72 92" />
            <path d="M 36 60 Q 37 76 34 90" />
            <path d="M 64 60 Q 63 76 66 90" />
          </g>
          {/* Pendant — small teardrop charm at the neckline, Sage's
              quiet signature. A muted brass tone against the cream top. */}
          <g>
            <path
              d="M 50 54 Q 50 54.2 50 54.4"
              stroke="#9C7A4E"
              strokeWidth="0.4"
              fill="none"
            />
            <path
              d="M 50 56 L 50 60 L 49 61 L 51 61 Z"
              fill="#B4905E"
              stroke="#7A5E3C"
              strokeWidth="0.3"
            />
            <circle cx="50" cy="55" r="0.9" fill="#D4B078" stroke="#7A5E3C" strokeWidth="0.25" />
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

      {/* Arms by pose — drawn AFTER body so hair behind them */}
      {renderArms(pose, palette)}

      {/* Head */}
      <g
        id="sage-head"
        style={{ transformOrigin: '50px 34px' }}
        transform={headTransform(pose)}
      >
        {/* Hair volume behind the head — the upper mane */}
        <path
          d="M 30 26 Q 28 14 38 12 Q 44 8 50 10 Q 56 8 62 12 Q 72 14 70 26 Q 70 38 68 46 Q 64 38 62 30 Q 50 27 38 30 Q 36 38 32 46 Q 30 38 30 26 Z"
          fill="url(#sage-hair-grad)"
        />
        {/* Hair highlight — soft curve along the crown */}
        <path
          d="M 36 16 Q 44 12 52 14"
          stroke={palette.hairLight}
          strokeWidth="1"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        {/* Soft side-sweeping bangs across the forehead */}
        <path
          d="M 34 22 Q 40 18 50 20 Q 58 19 62 23 Q 56 22 48 23 Q 40 23 34 22 Z"
          fill={palette.hair}
          opacity="0.95"
        />

        {/* Ears — small, partly covered by hair */}
        <ellipse cx="32" cy="37" rx="2.6" ry="4.5" fill={palette.skinShadow} />
        <ellipse cx="68" cy="37" rx="2.6" ry="4.5" fill={palette.skinShadow} />
        {/* Small ear stud — tiny pearl detail on right ear */}
        <circle cx="68.5" cy="39.5" r="0.6" fill="#F5ECD8" stroke="#B89E6E" strokeWidth="0.2" />
        <circle cx="31.5" cy="39.5" r="0.6" fill="#F5ECD8" stroke="#B89E6E" strokeWidth="0.2" />

        {/* Head — rounded oval, slightly softer/rounder than Bodhi's */}
        <path
          d="M 34 30 C 34 19, 42 14, 50 14 C 58 14, 66 19, 66 30 C 66 41, 63 49, 59 52 C 54 55, 46 55, 41 52 C 37 49, 34 41, 34 30 Z"
          fill="url(#sage-skin)"
        />
        {/* Forehead highlight */}
        <ellipse cx="48" cy="22" rx="7" ry="2.5" fill="#FFEAD0" opacity="0.45" />

        {/* Hair front — fringe pieces falling at the sides of the face,
            framing the cheeks. Two short curved locks. */}
        <path
          d="M 34 28 Q 32 36 35 44 Q 37 38 37 32 Q 35 28 34 28 Z"
          fill={palette.hair}
        />
        <path
          d="M 66 28 Q 68 36 65 44 Q 63 38 63 32 Q 65 28 66 28 Z"
          fill={palette.hair}
        />

        {/* Eyebrows */}
        {renderEyebrows(pose, palette)}

        {/* Eyes */}
        {renderEyes(pose, palette)}

        {/* Nose — small refined form */}
        <path
          d="M 49 36 Q 50 39 50 40.5 Q 50 41.8 50.8 41.8 Q 49 42.4 48.5 41.5 Q 48 39.5 49 36 Z"
          fill={palette.skinShadow}
          opacity="0.42"
        />
        <circle cx="50" cy="41" r="0.6" fill="#FFE0C4" opacity="0.55" />

        {/* Cheek blush — a touch rosier than Bodhi's amber to feel softer */}
        <circle cx="39" cy="43" r="3.6" fill="url(#sage-cheek)" />
        <circle cx="61" cy="43" r="3.6" fill="url(#sage-cheek)" />

        {/* Mouth */}
        {renderMouth(pose)}
      </g>
    </>
  );
}

function renderEyebrows(pose: BodhiPose, palette: MascotPalette): ReactNode {
  // Gentle arched brows in a warm brown that matches hair
  const brow = palette.hair;
  if (pose === 'think') {
    return (
      <>
        <path d="M 40 30 Q 44 28.5 47 30.5" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
        <path d="M 53 30.5 Q 56 28.5 60 30" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (pose === 'celebrate') {
    return (
      <>
        <path d="M 40 28 Q 44 25 47 27" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
        <path d="M 53 27 Q 56 25 60 28" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </>
    );
  }
  return (
    <>
      <path d="M 40 29 Q 44 27 47 29" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M 53 29 Q 56 27 60 29" stroke={brow} strokeWidth="1.1" fill="none" strokeLinecap="round" />
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
        <path d="M 40 34 Q 44 30 48 34" stroke={EYE_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <path d="M 52 34 Q 56 30 60 34" stroke={EYE_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </>
    );
  }
  // Warm hazel eyes — larger whites, visible iris + pupil, bright highlight
  return (
    <>
      <ellipse cx="44" cy="33.5" rx="2.5" ry="2" fill="#FBFAF4" />
      <ellipse cx="56" cy="33.5" rx="2.5" ry="2" fill="#FBFAF4" />
      <circle cx="44" cy="33.5" r="1.6" fill={EYE_IRIS} />
      <circle cx="56" cy="33.5" r="1.6" fill={EYE_IRIS} />
      <circle cx="44" cy="33.5" r="0.85" fill={EYE_DARK} />
      <circle cx="56" cy="33.5" r="0.85" fill={EYE_DARK} />
      <circle cx="44.55" cy="32.8" r="0.5" fill="white" />
      <circle cx="56.55" cy="32.8" r="0.5" fill="white" />
      {/* Lower lid crease */}
      <path
        d="M 42 35.3 Q 44 35.9 46 35.3"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 54 35.3 Q 56 35.9 58 35.3"
        stroke={palette.skinShadow}
        strokeOpacity="0.55"
        strokeWidth="0.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Subtle lashes on upper lid */}
      <path d="M 42 32 Q 44 31.3 46 32" stroke={EYE_DARK} strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.7" />
      <path d="M 54 32 Q 56 31.3 58 32" stroke={EYE_DARK} strokeWidth="0.5" fill="none" strokeLinecap="round" opacity="0.7" />
    </>
  );
}

function renderMouth(pose: BodhiPose): ReactNode {
  if (pose === 'celebrate') {
    return (
      <g>
        <path d="M 44 46 Q 50 50 56 46 Q 50 48 44 46 Z" fill={MOUTH} />
        <path d="M 44 46 Q 50 46.6 56 46" stroke={LIP_TINT} strokeWidth="0.5" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  // Soft closed-mouth smile — warm, present, steady
  return (
    <g>
      <path d="M 45 46 Q 50 48 55 46" stroke={MOUTH} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path
        d="M 46 46 Q 50 45.5 54 46"
        stroke={LIP_TINT}
        strokeWidth="0.6"
        strokeOpacity="0.7"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderArms(pose: BodhiPose, palette: MascotPalette): ReactNode {
  const sleeve = 'url(#sage-cardigan)';
  const skin = palette.skin;
  const cuff = palette.inner ?? '#F5F0E6';
  switch (pose) {
    case 'meditate':
      return (
        <g>
          <path d="M 28 58 Q 34 72 42 80 L 58 80 Q 66 72 72 58" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="42" cy="80" rx="5.5" ry="3.8" fill={skin} />
          <ellipse cx="58" cy="80" rx="5.5" ry="3.8" fill={skin} />
          {/* Cuffs — cream top peeks under sleeve */}
          <ellipse cx="38" cy="78" rx="1.5" ry="2" fill={cuff} />
          <ellipse cx="62" cy="78" rx="1.5" ry="2" fill={cuff} />
          {/* Subtle finger divisions */}
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
          <path d="M 30 58 Q 22 44 26 24" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <path d="M 70 58 Q 78 44 74 24" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="26" cy="22" r="4.2" fill={skin} />
          <circle cx="74" cy="22" r="4.2" fill={skin} />
          <ellipse cx="27" cy="28" rx="1.6" ry="1.8" fill={cuff} />
          <ellipse cx="73" cy="28" rx="1.6" ry="1.8" fill={cuff} />
        </g>
      );
    case 'wave':
      return (
        <g>
          <path d="M 70 56 Q 82 38 80 18" stroke={sleeve} strokeWidth="7.5" fill="none" strokeLinecap="round" />
          <circle cx="80" cy="17" r="5" fill={skin} />
          <ellipse cx="78" cy="24" rx="1.6" ry="2" fill={cuff} />
          {/* Finger hints */}
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
      // Sage holding a small notepad — fits the therapeutic-presence role
      return (
        <g>
          <path d="M 68 60 Q 68 68 62 72" stroke={sleeve} strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="62" cy="72" r="3.8" fill={skin} />
          {/* Notepad */}
          <rect x="55" y="64" width="14" height="17" rx="1.5" fill="#F5F0E6" stroke={palette.topDark} strokeWidth="0.7" />
          <rect x="59" y="62" width="6" height="3" rx="0.6" fill={palette.topAccent} />
          <path d="M 57 69 L 66 69 M 57 72 L 64 72 M 57 75 L 66 75" stroke={palette.topDark} strokeOpacity="0.5" strokeWidth="0.55" />
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
