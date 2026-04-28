'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import Mascot from './Mascot';
import type { BodhiPose, BodhiSize } from './poses';

const VALID_GUIDES: GuideId[] = ['ben', 'quinn', 'sage', 'bodhi'];
const LOCAL_KEY = 'preferred_guide';

function readFromLocal(): GuideId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(LOCAL_KEY);
    if (v && (VALID_GUIDES as string[]).includes(v)) {
      return v as GuideId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

interface GuideMascotProps {
  pose?: BodhiPose;
  size?: BodhiSize;
  animate?: boolean;
  glow?: boolean;
  className?: string;
  // Override the auto-selected guide. Useful for tests / previews.
  guide?: GuideId;
}

export default function GuideMascot({ guide, ...rest }: GuideMascotProps) {
  const profile = useAuthStore((s) => s.profile);

  // Synchronous localStorage read on mount so we NEVER flash a
  // default guide (e.g. Ben) during the brief window before profile
  // loads. When profile resolves, we switch to profile.preferred_guide
  // (which setPreferredGuide already wrote to localStorage too).
  const [localGuide, setLocalGuide] = useState<GuideId | null>(() => readFromLocal());

  // Keep local cache in sync with profile changes (e.g. guide switched
  // in another tab).
  useEffect(() => {
    if (profile?.preferred_guide && (VALID_GUIDES as string[]).includes(profile.preferred_guide)) {
      const pg = profile.preferred_guide as GuideId;
      setLocalGuide(pg);
      try {
        window.localStorage.setItem(LOCAL_KEY, pg);
      } catch {
        /* ignore */
      }
    }
  }, [profile?.preferred_guide]);

  // Resolution order:
  // 1. Explicit `guide` prop (tests / previews)
  // 2. profile.preferred_guide (authoritative when loaded)
  // 3. localStorage cache (prevents Ben-flash during profile load)
  // 4. 'bodhi' as brand fallback (never Ben — that's arbitrary)
  const resolved: GuideId =
    guide ??
    (profile?.preferred_guide && (VALID_GUIDES as string[]).includes(profile.preferred_guide)
      ? (profile.preferred_guide as GuideId)
      : localGuide ?? (getGuideOrDefault(undefined).id === 'ben' ? 'bodhi' : (getGuideOrDefault(undefined).id as GuideId)));

  return <Mascot guide={resolved} {...rest} />;
}
