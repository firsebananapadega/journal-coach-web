// Guided tour — step definitions. Each step advances via either:
//   (a) the user tapping "Next"/"Show me"/"Thanks" on the tour card
//       (when showNextButton === true), or
//   (b) an ambient event watched by <GuideTour/>:
//         'pathname-voice'   → pathname becomes /voice (user tapped capture)
//         'preview-closed'   → CapturePreviewSheet unmounts (save or discard)
//         'wall-changed'     → useWallState().activeWall switches
//
// idleNudgeMs: after this many ms without the expected event/tap,
// the mascot line swaps to a softer "no rush" variant.

import type { BodhiPose } from '@/components/mascot/poses';
import type { TourLineKey } from '@/lib/guideConfigs';

export type TourStepId = 'welcome' | 'capture' | 'preview' | 'wallFlip' | 'outro';

export type AutoAdvance = 'pathname-voice' | 'preview-closed' | 'wall-changed';

export interface TourStep {
  id: TourStepId;
  anchorSelector: string | null;
  pose: BodhiPose;
  copyKey: TourLineKey;
  nudgeKey?: TourLineKey;
  idleNudgeMs?: number;
  autoAdvance?: AutoAdvance;
  showNextButton: boolean;
  nextLabelKey: 'tour.showMe' | 'tour.next' | 'tour.done';
  wiggleAnchor?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    anchorSelector: null,
    pose: 'wave',
    copyKey: 'welcome',
    nudgeKey: 'welcomeNudge',
    showNextButton: true,
    nextLabelKey: 'tour.showMe',
  },
  {
    id: 'capture',
    anchorSelector: '[data-tour="capture-button"]',
    pose: 'think',
    copyKey: 'capture',
    nudgeKey: 'captureNudge',
    idleNudgeMs: 8000,
    autoAdvance: 'pathname-voice',
    showNextButton: false,
    nextLabelKey: 'tour.next',
  },
  {
    id: 'preview',
    anchorSelector: '[data-tour="capture-preview"]',
    pose: 'listen',
    copyKey: 'preview',
    autoAdvance: 'preview-closed',
    showNextButton: false,
    nextLabelKey: 'tour.next',
  },
  {
    id: 'wallFlip',
    anchorSelector: '[data-tour="wall-edge-tab"]',
    pose: 'peek',
    copyKey: 'wallFlip',
    autoAdvance: 'wall-changed',
    showNextButton: false,
    nextLabelKey: 'tour.next',
    wiggleAnchor: true,
  },
  {
    id: 'outro',
    anchorSelector: null,
    pose: 'celebrate',
    copyKey: 'outro',
    showNextButton: true,
    nextLabelKey: 'tour.done',
  },
];
