'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';

export default function SignInPage() {
  const router = useRouter();
  const { signIn, signInWithGoogle, loading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    } else {
      router.replace('/home');
    }
  };

  const handleGoogle = async () => {
    const result = await signInWithGoogle();
    if (result.error) setError(result.error);
  };

  return (
    <div className="min-h-dvh overflow-y-auto px-6 pt-16 pb-8 bg-bg">
      <div className="max-w-sm w-full mx-auto space-y-6">
        <div>
          <button onClick={() => router.back()} className="text-text-secondary hover:text-text-primary text-sm mb-4">
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
          <p className="text-text-secondary text-sm mt-1">Sign in to continue journaling.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary focus:border-primary outline-none"
              required
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-white font-semibold rounded-2xl hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-tertiary">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-3 px-6 bg-surface border border-border text-text-primary font-medium rounded-2xl hover:bg-surface-elevated transition-colors"
        >
          Continue with Google
        </button>

        <p className="text-sm text-text-secondary text-center">
          Don&apos;t have an account?{' '}
          <Link href="/auth/sign-up" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
