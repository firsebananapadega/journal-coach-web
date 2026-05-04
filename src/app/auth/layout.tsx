'use client';

// Auth-route layout. Exists for ONE reason: mount UIOverlayRoot so
// every /auth/* page (sign-in, sign-up, onboarding, password reset)
// gets the global toast + celebration overlays.
//
// Without this, `useUiStore.showToast(...)` calls from auth screens
// (e.g. the mic-error toast in OnboardingCaptureStep, or sign-in
// errors) push state into the store but render nowhere — the toast
// portal lives in (app)/layout.tsx and the auth tree never sees it.
//
// Children render first; overlay portal renders after so toasts
// stack on top of any auth content.

import UIOverlayRoot from '@/components/ui/UIOverlayRoot';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <UIOverlayRoot />
    </>
  );
}
