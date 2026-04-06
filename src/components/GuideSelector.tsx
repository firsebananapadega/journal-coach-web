'use client';

import Image from 'next/image';
import { ALL_GUIDES, getGuideArchetype, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';
import { getLocale } from '@/lib/language';

interface GuideSelectorProps {
  value: string;
  onChange: (guideId: string) => void;
}

export function GuideSelector({ value, onChange }: GuideSelectorProps) {
  const locale = getLocale();
  return (
    <div className="grid grid-cols-2 gap-3">
      {ALL_GUIDES.map((guide) => (
        <button
          key={guide.id}
          onClick={() => onChange(guide.id)}
          className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
            value === guide.id
              ? 'border-primary bg-surface-elevated'
              : 'border-border bg-surface hover:border-text-tertiary'
          }`}
        >
          <Image
            src={getGuideAvatar(guide.id as GuideId)}
            alt={guide.name}
            width={40}
            height={40}
            className="rounded-full object-cover"
          />
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">{guide.name}</p>
            <p className="text-xs text-text-secondary">{getGuideArchetype(guide, locale)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
