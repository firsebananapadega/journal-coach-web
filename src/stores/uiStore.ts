import { create } from 'zustand';

export type ToastVariant = 'success' | 'info' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  // Optional inline action (e.g. "Undo" after a swipe delete). When
  // present, the toast renders it as a tappable chip and dismisses
  // itself after the action fires.
  action?: ToastAction;
  // Custom auto-dismiss time in ms. Falls back to 2200ms when unset.
  // Undo toasts want ~5000ms so the user actually has time to read +
  // react before the delete commits.
  durationMs?: number;
}

interface UIState {
  celebrationKey: number;
  toasts: Toast[];
  celebrate: () => void;
  showToast: (
    message: string,
    variant?: ToastVariant,
    options?: { action?: ToastAction; durationMs?: number },
  ) => number;
  dismissToast: (id: number) => void;
}

let idCounter = 0;

export const useUiStore = create<UIState>((set) => ({
  celebrationKey: 0,
  toasts: [],

  celebrate: () =>
    set((s) => ({ celebrationKey: s.celebrationKey + 1 })),

  showToast: (message, variant = 'success', options) => {
    const id = ++idCounter;
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id, message, variant, action: options?.action, durationMs: options?.durationMs },
      ],
    }));
    return id;
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
