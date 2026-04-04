import type { GuideId } from './guideConfigs';

export const GUIDE_AVATARS: Record<GuideId, string> = {
  ben: '/avatars/Ben.jpg',
  quinn: '/avatars/Quinn.jpg',
  sage: '/avatars/Sage.jpg',
  bodhi: '/avatars/Bodhi.jpg',
};

export function getGuideAvatar(guideId: GuideId): string {
  return GUIDE_AVATARS[guideId] ?? GUIDE_AVATARS.ben;
}
