'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/lib/theme';
import { GuideSelector } from '@/components/GuideSelector';
import { getGuideOrDefault, type GuideId } from '@/lib/guideConfigs';
import { getGuideAvatar } from '@/lib/guideAvatars';

export default function SettingsPage() {
  const router = useRouter();
  const { profile, signOut, setPreferredGuide } = useAuthStore();
  const { mode, setMode } = useTheme();
  const guide = getGuideOrDefault(profile?.preferred_guide);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth/welcome');
  };

  return (
    <div className="max-w-lg mx-auto px-5 pt-16 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

      {/* Profile */}
      <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Profile</h2>
        <div className="flex items-center gap-3">
          <Image
            src={getGuideAvatar(guide.id as GuideId)}
            alt={guide.name}
            width={40}
            height={40}
            className="rounded-full"
          />
          <div>
            <p className="font-semibold text-text-primary">{profile?.display_name || 'User'}</p>
            <p className="text-xs text-text-secondary">Guide: {guide.name} ({guide.archetype})</p>
          </div>
        </div>

        {/* Intentions */}
        {profile?.intentions && profile.intentions.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-text-tertiary">Intentions</p>
            <div className="flex flex-wrap gap-2">
              {profile.intentions.map((intention, i) => (
                <span key={i} className="px-2 py-1 bg-surface-elevated rounded-lg text-xs text-text-secondary">
                  {intention}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Guide Selection */}
      <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Guide</h2>
        <GuideSelector
          value={profile?.preferred_guide || 'ben'}
          onChange={setPreferredGuide}
        />
      </div>

      {/* Theme */}
      <div className="bg-surface rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Appearance</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('dark')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              mode === 'dark' ? 'bg-primary text-white' : 'bg-surface-elevated text-text-secondary'
            }`}
          >
            Dark
          </button>
          <button
            onClick={() => setMode('light')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              mode === 'light' ? 'bg-primary text-white' : 'bg-surface-elevated text-text-secondary'
            }`}
          >
            Light
          </button>
        </div>
      </div>

      {/* Sign Out */}
      <button
        onClick={handleSignOut}
        className="w-full py-3 bg-surface border border-border text-error font-medium rounded-2xl hover:bg-surface-elevated transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
