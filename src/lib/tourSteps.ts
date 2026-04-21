// Guided tour — step definitions. Each step advances via either:
//   (a) user tapping Show me / Next / Thanks on the tour card
//       (when showNextButton === true), or
//   (b) an ambient event watched by <GuideTour/>:
//         'wall-changed' → useWallState().activeWall switches
//
// Tour narrative (per user direction):
//   1. Welcome modal (brief)
//   2. Guided chat — journal-wall center pill (→ /guided)
//   3. Pulse tab — "three questions a day" framing
//   4. Wall switch — user taps the edge tab to flip to tasks
//   5. Capture mic — tasks-wall center pill (→ /voice)
//   6. Outro modal (brief)

import type { BodhiPose } from '@/components/mascot/poses';
import type { TourLineKey } from '@/lib/guideConfigs';

export type TourStepId = 'welcome' | 'guidedChat' | 'pulseTab' | 'wallSwitch' | 'captureMic' | 'outro';

export type AutoAdvance = 'wall-changed' | 'pathname-voice' | 'preview-closed';

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
    id: 'guidedChat',
    anchorSelector: '[data-tour="capture-button"]',
    pose: 'think',
    copyKey: 'guidedChat',
    showNextButton: true,
    nextLabelKey: 'tour.next',
  },
  {
    id: 'pulseTab',
    anchorSelector: '[data-tour="tab-pulse"]',
    pose: 'listen',
    copyKey: 'pulseTab',
    showNextButton: true,
    nextLabelKey: 'tour.next',
  },
  {
    id: 'wallSwitch',
    anchorSelector: '[data-tour="wall-edge-tab"]',
    pose: 'peek',
    copyKey: 'wallSwitch',
    autoAdvance: 'wall-changed',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    wiggleAnchor: true,
  },
  {
    id: 'captureMic',
    anchorSelector: '[data-tour="capture-button"]',
    pose: 'think',
    copyKey: 'captureMic',
    showNextButton: true,
    nextLabelKey: 'tour.next',
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
