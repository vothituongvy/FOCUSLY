'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  const { status, init } = useAuth();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  return (
    <div className="center-page">
      <div className="spinner" />
    </div>
  );
}
