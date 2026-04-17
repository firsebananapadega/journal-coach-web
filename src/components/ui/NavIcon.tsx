import type { ReactNode } from 'react';

interface NavIconProps {
  name: 'home' | 'target' | 'calendar' | 'book' | 'gear';
  active: boolean;
  size?: number;
}

export default function NavIcon({ name, active, size = 24 }: NavIconProps) {
  const stroke = 'currentColor';
  const sw = 1.5;
  const fill = active ? 'currentColor' : 'none';

  const icons: Record<string, ReactNode> = {
    home: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z" fill={fill} />
        <path d="M9 21V14h6v7" stroke={active ? 'var(--theme-bg)' : stroke} />
      </svg>
    ),
    target: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" fill={fill} />
        <circle cx="12" cy="12" r="6" stroke={active ? 'var(--theme-bg)' : stroke} />
        <circle cx="12" cy="12" r="2" fill={active ? 'var(--theme-bg)' : stroke} />
      </svg>
    ),
    calendar: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="17" rx="2" fill={fill} />
        <path d="M16 2v4M8 2v4M3 10h18" stroke={active ? 'var(--theme-bg)' : stroke} />
      </svg>
    ),
    book: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" fill={fill} />
        {active && <path d="M8 7h8M8 11h5" stroke="var(--theme-bg)" strokeWidth={1.5} />}
      </svg>
    ),
    gear: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" fill={fill} />
        <circle cx="12" cy="12" r="3" stroke={active ? 'var(--theme-bg)' : stroke} fill={active ? 'var(--theme-bg)' : 'none'} />
      </svg>
    ),
  };

  return icons[name] || null;
}
