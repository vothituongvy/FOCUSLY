'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLearning } from '@/lib/learning';
import { useNow, useResource } from '@/lib/hooks';
import { ChangeEvent, getSocket, useSocketEvent } from '@/lib/socket';
import { fmtClock, liveSeconds } from '@/lib/format';
import type { FocusSession, User } from '@/lib/types';
import { Sidebar } from '@/components/Sidebar';
import { ShieldBridge } from '@/components/ShieldBridge';
import { Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

/** Thanh nhỏ báo phiên học đang chạy (kể cả bắt đầu từ Mobile) */
function ActiveSessionPill() {
  const pathname = usePathname();
  const { data, setData } = useResource<{ session: FocusSession | null }>('/sessions/active', ['sessions']);
  useSocketEvent<FocusSession>('session:updated', (s) => setData({ session: ['completed', 'abandoned'].includes(s.status) ? null : s }));
  useNow();
  const s = data?.session;
  if (!s || pathname.startsWith('/focus')) return null;
  const { focus } = liveSeconds(s);
  const label = s.status === 'active' ? 'Đang tập trung' : s.status === 'on_break' ? 'Đang nghỉ' : 'Tạm dừng';
  return (
    <Link
      href="/focus"
      className="banner info"
      style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 40, boxShadow: 'var(--shadow)', textDecoration: 'none' }}
    >
      <Icon name="focus" size={16} /> {label} · <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(focus)}</b>
      {s.device !== 'web' && <span className="badge">từ {s.device}</span>}
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, init, setUser } = useAuth();
  const router = useRouter();
  const loadLearning = useLearning((s) => s.load);

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
      <Sidebar />
      <main className="main">{children}</main>
      <ActiveSessionPill />
      <ShieldBridge />
    </div>
  );
}
