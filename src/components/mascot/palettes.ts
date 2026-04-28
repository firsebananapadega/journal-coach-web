import type { GuideId } from '@/lib/guideConfigs';

export interface MascotPalette {
  // Skin
  skin: string;
  skinShadow: string;
  // Hair / facial hair
  hair: string;
  hairLight: string;
  facialHair?: string;
  // Top (robe / jacket / shirt / lab coat)
  top: string;
  topDark: string;
  topAccent: string;
  // Inner layer (tee under jacket, tie under coat, cream tunic under robe)
  inner?: string;
  innerAccent?: string;
  // Ambient glow behind the mascot
  glow: string;
  // Signature theme color — used by the optional "match app theme to my
  // guide" setting. This is the HSL-ish primary that would replace the
  // default warm-gold accent across the app.
  themePrimary: string;
  themePrimaryDark: string;
  themePrimaryLight: string;
  themeGlow: string;
  // Eyewear (Sage only)
  glasses?: boolean;
  // Bald (Bodhi only)
  bald?: boolean;
}

const PALETTES: Record<GuideId, MascotPalette> = {
  // Bodhi — kasāya saffron. Not bright "safety orange" (which reads as
  // prison uniform) but the spice-dyed warm-red saffron of traditional
  // Theravada monastic robes. Cream tunic + brown sash + mala beads
  // ground it in spiritual visual language.
  bodhi: {
    skin: '#F4C89B',
    skinShadow: '#E8B185',
    hair: '#C7C4BE',
    hairLight: '#A9A6A1',
    facialHair: '#C7C4BE',
    top: '#D87B3D',
    topDark: '#B5612A',
    topAccent: '#6B4E2E',
    inner: '#F2E4C9',
    glow: 'rgba(216, 123, 61, 0.20)',
    themePrimary: '#D87B3D',
    themePrimaryDark: '#B5612A',
    themePrimaryLight: '#E8A468',
    themeGlow: 'rgba(216, 123, 61, 0.18)',
    bald: true,
  },
  // Ben — warm terracotta red. "Friendly but grounded" — not bright
  // aggressive red. Keeps the everyman-friend vibe.
  ben: {
    skin: '#F4C89B',
    skinShadow: '#E8B185',
    hair: '#5C3E26',
    hairLight: '#7A5638',
    facialHair: '#5C3E26',
    top: '#C4553D',
    topDark: '#9E4236',
    topAccent: '#FFFFFF',
    inner: '#F5F2EE',
    glow: 'rgba(196, 85, 61, 0.22)',
    themePrimary: '#C4553D',
    themePrimaryDark: '#9E4236',
    themePrimaryLight: '#E07968',
    themeGlow: 'rgba(196, 85, 61, 0.18)',
  },
  // Quinn — cream coach shirt with teal signature accent (already
  // established). Theme signature is the teal.
  quinn: {
    skin: '#F0BC8E',
    skinShadow: '#DCA77B',
    hair: '#8B6F4E',
    hairLight: '#A88A6A',
    facialHair: '#7A5E3E',
    top: '#EFE7D5',
    topDark: '#C9BFA9',
    topAccent: '#2AA198',
    inner: '#FFFFFF',
    glow: 'rgba(42, 161, 152, 0.22)',
    themePrimary: '#2AA198',
    themePrimaryDark: '#1F7F78',
    themePrimaryLight: '#5BC9C0',
    themeGlow: 'rgba(42, 161, 152, 0.18)',
  },
  // Sage — healing green. Muted sage (not surgical scrub bright). The
  // tie stays deeper green rather than the prior lavender so the whole
  // costume reads cohesively.
  sage: {
    skin: '#F0C29A',
    skinShadow: '#DCA77B',
    hair: '#8B5A3C',
    hairLight: '#A87850',
    top: '#7CA585',
    topDark: '#5A8268',
    topAccent: '#3D5F4C',
    inner: '#F5F0E6',
    innerAccent: '#3D5F4C',
    glow: 'rgba(124, 165, 133, 0.25)',
    themePrimary: '#7CA585',
    themePrimaryDark: '#5A8268',
    themePrimaryLight: '#9EC4A4',
    themeGlow: 'rgba(124, 165, 133, 0.18)',
  },
};

export function getPalette(guide: GuideId): MascotPalette {
  return PALETTES[guide] ?? PALETTES.bodhi;
}
