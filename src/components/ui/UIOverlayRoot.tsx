'use client';

import CelebrationOverlay from './CelebrationOverlay';
import ToastStack from './SuccessToast';
import GlobalPushPrompt from '@/components/GlobalPushPrompt';

export default function UIOverlayRoot() {
  return (
    <>
      <CelebrationOverlay />
      <ToastStack />
      <GlobalPushPrompt />
    </>
  );
}
