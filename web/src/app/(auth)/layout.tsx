'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, init } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') void init();
  }, [status, init]);

  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
  }, [status, router]);

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand">
          <span className="brand-logo" aria-hidden /> focusly
        </div>
        <p className="muted small" style={{ textAlign: 'center', marginBottom: 20 }}>
          Learn with focus. Grow with consistency.
        </p>
        {children}
      </div>
    </div>
  );
}
