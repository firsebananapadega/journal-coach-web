// Zustand store for the in-app guided tour.
//
// The store is deliberately thin — it knows the current step index
// and the measured rect of the current anchor. The <GuideTour/>
// component drives step advancement by watching external events
// (pathname, wall state, preview sheet mount) and calling advance().

import { create } from 'zustand';
import { TOUR_STEPS, type TourStep } from './tourSteps';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourState {
  active: boolean;
  stepIdx: number;
  anchorRect: Rect | null;
  nudge: boolean;
  finished: boolean;

  start: () => void;
  advance: () => void;
  skip: () => void;
  setAnchorRect: (r: Rect | null) => void;
  setNudge: (n: boolean) => void;
  currentStep: () => TourStep | null;
}

export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  stepIdx: 0,
  anchorRect: null,
  nudge: false,
  finished: false,

  start: () => set({ active: true, stepIdx: 0, anchorRect: null, nudge: false, finished: false }),

  advance: () => {
    const { stepIdx } = get();
    const next = stepIdx + 1;
    if (next >= TOUR_STEPS.length) {
      set({ active: false, finished: true, anchorRect: null, nudge: false });
    } else {
      set({ stepIdx: next, anchorRect: null, nudge: false });
    }
  },

  skip: () => set({ active: false, finished: true, anchorRect: null, nudge: false }),

  setAnchorRect: (r) => set({ anchorRect: r }),
  setNudge: (n) => set({ nudge: n }),
  currentStep: () => TOUR_STEPS[get().stepIdx] ?? null,
}));
