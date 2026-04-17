import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(145deg, #1A1D20 0%, #141517 50%, #0F1012 100%)',
          borderRadius: 40,
        }}
      >
        {/* Book */}
        <svg
          width="110"
          height="110"
          viewBox="0 0 110 110"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Book spine shadow */}
          <path
            d="M55 18 L55 92"
            stroke="#2F3136"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Left page */}
          <path
            d="M20 24 C20 20, 24 18, 30 18 L52 18 L52 88 L30 88 C24 88, 20 86, 20 82 Z"
            fill="#F5F2EE"
            opacity="0.92"
          />

          {/* Right page */}
          <path
            d="M58 18 L80 18 C86 18, 90 20, 90 24 L90 82 C90 86, 86 88, 80 88 L58 88 Z"
            fill="#FAF8F5"
            opacity="0.95"
          />

          {/* Left page lines */}
          <line x1="28" y1="32" x2="46" y2="32" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="28" y1="40" x2="44" y2="40" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="28" y1="48" x2="48" y2="48" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="28" y1="56" x2="42" y2="56" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="28" y1="64" x2="46" y2="64" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="28" y1="72" x2="40" y2="72" stroke="#D4D1CC" strokeWidth="1.5" strokeLinecap="round" />

          {/* Right page lines */}
          <line x1="64" y1="32" x2="82" y2="32" stroke="#E8E5E0" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="64" y1="40" x2="80" y2="40" stroke="#E8E5E0" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="64" y1="48" x2="84" y2="48" stroke="#E8E5E0" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="64" y1="56" x2="78" y2="56" stroke="#E8E5E0" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="64" y1="64" x2="82" y2="64" stroke="#E8E5E0" strokeWidth="1.5" strokeLinecap="round" />

          {/* Book spine center fold effect */}
          <path
            d="M52 18 Q55 22, 58 18"
            fill="none"
            stroke="#C4C1BC"
            strokeWidth="1"
          />
          <path
            d="M52 88 Q55 84, 58 88"
            fill="none"
            stroke="#C4C1BC"
            strokeWidth="1"
          />

          {/* Pencil — angled across the book */}
          <g transform="rotate(-35, 78, 28)">
            {/* Pencil body */}
            <rect x="72" y="16" width="8" height="52" rx="1.5" fill="#F5A623" />
            {/* Pencil band */}
            <rect x="72" y="58" width="8" height="5" rx="0.5" fill="#D4891A" />
            {/* Pencil tip */}
            <path d="M72 63 L76 74 L80 63 Z" fill="#E8C468" />
            {/* Pencil point */}
            <path d="M74.5 70 L76 74 L77.5 70 Z" fill="#3D3D3D" />
            {/* Pencil eraser */}
            <rect x="72" y="14" width="8" height="5" rx="1.5" fill="#E88D67" />
            {/* Pencil eraser band */}
            <rect x="72" y="18" width="8" height="2" rx="0.5" fill="#B8B5B0" />
          </g>
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
