'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { t } from '@/lib/translations';

export default function RootPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      router.replace('/auth/welcome');
    } else if (profile && !profile.onboarding_completed) {
      router.replace('/auth/onboarding');
    } else if (profile) {
      router.replace('/home');
    }
  }, [session, profile, initialized, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="animate-pulse text-primary text-lg">{t('common.loading')}</div>
    </div>
  );
}
