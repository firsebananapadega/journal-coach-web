// Tiny global store for the push-permission sheet's open state.
// Hoisted out of any specific page so the sheet survives navigation
// mid-capture — /voice routes to /today as soon as it finishes
// saving, which used to unmount the sheet before it could render.

import { create } from 'zustand';

interface PushPromptState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const usePushPromptStore = create<PushPromptState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
