'use client';

import { motion } from 'framer-motion';
import { ALL_GUIDES, getGuideArchetype, type GuideId } from '@/lib/guideConfigs';
import { getLocale } from '@/lib/language';
import Mascot from '@/components/mascot/Mascot';
import { prefersReducedMotion } from '@/lib/motionVariants';

interface GuideSelectorProps {
  value: string;
  onChange: (guideId: string) => void;
}

export function GuideSelector({ value, onChange }: GuideSelectorProps) {
  const locale = getLocale();
  return (
    <div className="grid grid-cols-2 gap-3">
      {ALL_GUIDES.map((guide) => {
        const isSelected = value === guide.id;
        return (
          <motion.button
            key={guide.id}
            onClick={() => onChange(guide.id)}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            className={`relative flex items-center gap-3 p-3 rounded-2xl border transition-all overflow-hidden ${
              isSelected
                ? 'border-primary bg-surface-elevated shadow-warm-md'
                : 'border-border bg-surface hover:border-text-tertiary'
            }`}
          >
            <div className="relative shrink-0">
              <Mascot
                guide={guide.id as GuideId}
                pose={isSelected ? 'wave' : 'idle'}
                size="sm"
                animate
              />
            </div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary truncate">{guide.name}</p>
              <p className="text-xs text-text-secondary leading-tight break-words">{getGuideArchetype(guide, locale)}</p>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
