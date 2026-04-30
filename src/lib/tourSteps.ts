// Onboarding tour — step definitions, bucket-aware.
//
// Goal: cover the must-know path for a brand-new user without
// overloading them. The full Both-bucket tour is 6 steps:
//
//   1. Pulse welcome (where they land)
//   2. Free-write button (the pencil center pill on the journal wall)
//   3. Wall switcher (the JOURNAL/TASKS edge tab — tap or Next flips)
//   4. Capture mic (the mic center pill on the tasks wall)
//   5. Wall switcher back
//   6. Outro
//
// Tasks-only and Journal-only buckets see filtered subsets — the
// `buckets` field on each step decides who gets it. The orchestrator
// (GuideTour) picks the right slice at `start()` time using
// `profile.primary_use`.
//
// Each step has an optional `route` — when set, the orchestrator
// navigates there before showing the step. That's how Next on step 3
// flips the wall (router.push('/today')) and lands you on step 4.

import type { BodhiPose } from '@/components/mascot/poses';
import type { PrimaryUse } from '@/stores/authStore';

export type TourStepId =
  | 'journalWelcome'
  | 'freeWriteButton'
  | 'wallSwitchToTasks'
  | 'tasksWelcome'
  | 'captureMic'
  | 'wallSwitchToJournal'
  | 'outro';

export type AutoAdvance = 'wall-changed';

export interface TourStep {
  id: TourStepId;
  /** Route this step lives on. Orchestrator router.pushes here on
   *  step enter if the user isn't already there. Omit to "stay put"
   *  (e.g. the outro). */
  route?: string;
  /** CSS selector for the highlighted anchor. null = centered card,
   *  no spotlight. */
  anchorSelector: string | null;
  pose: BodhiPose;
  /** Translation key for the body copy (1–2 sentences). */
  copyKey: string;
  /** When set, the step auto-advances on this ambient event in
   *  addition to the Next button. `wall-changed` fires when the user
   *  taps the highlighted wall edge tab themselves — no need to wait
   *  for them to find the Next button. */
  autoAdvance?: AutoAdvance;
  showNextButton: boolean;
  nextLabelKey: 'tour.next' | 'tour.done';
  wiggleAnchor?: boolean;
  /** Which buckets see this step. */
  buckets: Array<PrimaryUse>;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'journalWelcome',
    // /home is where the user actually lands after onboarding (journal
    // wall's home page) — NOT /pulse. The original onboarding flow
    // sends destination = '/home' for journal/both buckets, so the
    // tour should fire from there too. /pulse is a separate (orphan)
    // analysis page, not the journal landing.
    route: '/home',
    anchorSelector: null,
    pose: 'wave',
    copyKey: 'tour.journalWelcome',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    buckets: ['journal', 'both'],
  },
  {
    id: 'freeWriteButton',
    route: '/home',
    // The wall-nav center button. On the journal side it's the
    // pencil-on-book glyph that opens free-form writing.
    anchorSelector: '[data-tour="capture-button"]',
    pose: 'think',
    copyKey: 'tour.freeWriteButton',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    buckets: ['journal', 'both'],
  },
  {
    id: 'wallSwitchToTasks',
    route: '/home',
    anchorSelector: '[data-tour="wall-edge-tab"]',
    pose: 'peek',
    copyKey: 'tour.wallSwitchToTasks',
    autoAdvance: 'wall-changed',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    wiggleAnchor: true,
    buckets: ['both'],
  },
  {
    id: 'tasksWelcome',
    route: '/today',
    anchorSelector: null,
    pose: 'wave',
    copyKey: 'tour.tasksWelcome',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    // Both-bucket users skip this — they got the welcome via the
    // wall-switch step itself; tasks-only users land cold so they
    // need an explicit welcome to /today.
    buckets: ['tasks'],
  },
  {
    id: 'captureMic',
    route: '/today',
    // Same selector as the journal-side center button — the wall
    // determines which glyph appears, but the DOM anchor is shared.
    anchorSelector: '[data-tour="capture-button"]',
    pose: 'think',
    copyKey: 'tour.captureMic',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    buckets: ['tasks', 'both'],
  },
  {
    id: 'wallSwitchToJournal',
    route: '/today',
    anchorSelector: '[data-tour="wall-edge-tab"]',
    pose: 'peek',
    copyKey: 'tour.wallSwitchToJournal',
    showNextButton: true,
    nextLabelKey: 'tour.next',
    // Mirror the wallSwitchToTasks step — the bouncing wiggle drew
    // the user's eye to the wall-edge tab on that step, and they
    // missed it on the way back. Adding it here gives the same
    // visual cue both directions.
    wiggleAnchor: true,
    buckets: ['both'],
  },
  {
    id: 'outro',
    // No route — outro fires wherever the user is when they arrive
    // here, so the close-out doesn't yank them around.
    anchorSelector: null,
    pose: 'celebrate',
    copyKey: 'tour.outro',
    showNextButton: true,
    nextLabelKey: 'tour.done',
    buckets: ['tasks', 'journal', 'both'],
  },
];

/** Filter the master step list down to what the given bucket sees.
 *  Returns a fresh array so callers can mutate freely. */
export function getStepsForBucket(bucket: PrimaryUse | null | undefined): TourStep[] {
  const target = bucket ?? 'both';
  return TOUR_STEPS.filter((step) => step.buckets.includes(target));
}
