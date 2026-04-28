'use client';

// Tracks the iOS visual viewport so callers can anchor floating UI
// (bottom sheets, input docks) to whatever's actually visible — even
// while the soft keyboard is up and iOS has panned the document to
// bring a focused field into view.
//
// Why not CSS dvh: on iOS Safari, `dvh` does shrink with the keyboard
// in some versions, but the layout viewport ALSO shrinks (so
// `bottom: Xdvh` ends up positioning the sheet far above the keyboard
// instead of just above it). And on focus, iOS sometimes pans the
// document — fixed-position elements ride along with that pan, so the
// sheet drifts partially behind the keyboard. Reading `visualViewport`
// directly avoids both quirks.
//
// Same pattern as the inline tracking in src/app/(app)/guided/page.tsx,
// just lifted into a hook so AddTaskSheet, AddGrocerySheet, and any
// future sheet share one implementation.

import { useEffect, useRef, useState } from 'react';

export interface VisualViewportState {
  /** Current visible height in CSS pixels. Shrinks when the keyboard
   *  rises. */
  height: number;
  /** How far iOS has panned the document to bring a focused input into
   *  view. 0 most of the time. */
  offsetTop: number;
  /** Max-observed height — approximates the no-keyboard layout
   *  viewport. Use this as the reference for keyboard detection and
   *  for computing pixel offsets relative to the layout (so callers
   *  don't have to read window.innerHeight, which is inconsistent
   *  across iOS Safari versions when the keyboard is up). */
  layoutHeight: number;
  /** True when the soft keyboard is up. Heuristic: the visible height
   *  has shrunk by more than 100px from the max observed. */
  keyboardOpen: boolean;
}

/**
 * Returns the current visual viewport state, or `null` until first
 * client-side measurement (so SSR and the very first paint are safe).
 */
export function useVisualViewport(): VisualViewportState | null {
  const [vv, setVv] = useState<VisualViewportState | null>(null);
  // The max we've ever seen vv.height be — that's the no-keyboard
  // baseline. Stored in a ref so we don't trigger a re-render every
  // time we update it.
  const maxHeightRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => {
      const vvport = window.visualViewport;
      const height = vvport ? vvport.height : window.innerHeight;
      const offsetTop = vvport ? vvport.offsetTop : 0;
      if (height > maxHeightRef.current) maxHeightRef.current = height;
      const layoutHeight = maxHeightRef.current;
      // 100px threshold matches the heuristic in /guided. iOS keyboards
      // are >250px tall; URL-bar collapse only shrinks ~50-80px.
      const keyboardOpen = layoutHeight - height > 100;
      setVv({ height, offsetTop, layoutHeight, keyboardOpen });
    };

    update();
    const vvport = window.visualViewport;
    if (vvport) {
      vvport.addEventListener('resize', update);
      vvport.addEventListener('scroll', update);
      return () => {
        vvport.removeEventListener('resize', update);
        vvport.removeEventListener('scroll', update);
      };
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return vv;
}
