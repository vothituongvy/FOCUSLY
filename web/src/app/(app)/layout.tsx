'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLearning } from '@/lib/learning';
import { ChangeEvent, getSocket, useSocketEvent } from '@/lib/socket';
import type { User } from '@/lib/types';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { UpdateBanner } from '@/components/UpdateBanner';
import { ShieldBridge } from '@/components/ShieldBridge';
import { Spinner } from '@/components/ui';
import { tr } from '@/lib/i18n';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, init, setUser } = useAuth();
  const router = useRouter();
  const loadLearning = useLearning((s) => s.load);
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  useEffect(() => {
    if (status === 'loading') void init();
    if (status === 'guest') router.replace('/login');
  }, [status, init, router]);

  useEffect(() => {
    if (status !== 'authed') return;
    getSocket();
    void loadLearning();
  }, [status, loadLearning]);

  useSocketEvent<ChangeEvent>('sync:changed', (e) => {
    if (['subjects', 'courses', 'goals'].includes(e.entity)) void loadLearning();
    if (e.entity === 'user' && e.doc) setUser(e.doc as User);
  });

  if (status !== 'authed') return <Spinner />;

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {tr('Bỏ qua tới nội dung')}
      </a>
      <Sidebar open={drawer} onClose={closeDrawer} />
      <div className="app-col">
        <Topbar onMenu={() => setDrawer(true)} />
        <UpdateBanner />
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <ShieldBridge />
    </div>
  );
}
