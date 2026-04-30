// Zustand store for the in-app onboarding tour.
//
// The store is deliberately thin — it holds the active flag, the
// (bucket-filtered) step list, and the current step index plus
// anchor measurement state. The <GuideTour/> component drives step
// advancement by watching external events and calling advance().

import { create } from 'zustand';
import type { TourStep } from './tourSteps';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourState {
  active: boolean;
  /** Bucket-filtered step list, set at start() time. Empty when
   *  the tour isn't running. */
  steps: TourStep[];
  stepIdx: number;
  anchorRect: Rect | null;
  nudge: boolean;
  finished: boolean;

  start: (steps: TourStep[]) => void;
  advance: () => void;
  skip: () => void;
  setAnchorRect: (r: Rect | null) => void;
  setNudge: (n: boolean) => void;
  currentStep: () => TourStep | null;
}

export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  steps: [],
  stepIdx: 0,
  anchorRect: null,
  nudge: false,
  finished: false,

  start: (steps) =>
    set({
      active: steps.length > 0,
      steps,
      stepIdx: 0,
      anchorRect: null,
      nudge: false,
      finished: false,
    }),

  advance: () => {
    const { stepIdx, steps } = get();
    const next = stepIdx + 1;
    if (next >= steps.length) {
      set({ active: false, finished: true, anchorRect: null, nudge: false });
    } else {
      set({ stepIdx: next, anchorRect: null, nudge: false });
    }
  },

  skip: () => set({ active: false, finished: true, anchorRect: null, nudge: false }),

  setAnchorRect: (r) => set({ anchorRect: r }),
  setNudge: (n) => set({ nudge: n }),
  currentStep: () => {
    const { steps, stepIdx } = get();
    return steps[stepIdx] ?? null;
  },
}));
