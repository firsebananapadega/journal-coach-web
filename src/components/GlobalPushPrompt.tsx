'use client';

// Global mount-point for the push-permission sheet. Lives in
// UIOverlayRoot so it persists across navigations — /voice routes
// to /today mid-capture, which used to unmount the sheet before
// it could render.

import PushPermissionSheet from './PushPermissionSheet';
import { usePushPromptStore } from '@/stores/pushPromptStore';

export default function GlobalPushPrompt() {
  const open = usePushPromptStore((s) => s.open);
  const hide = usePushPromptStore((s) => s.hide);
  return <PushPermissionSheet open={open} onClose={() => hide()} />;
}
