'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { get } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import type { FocusSession } from '@/lib/types';
import { FocusSetup } from '@/components/focus/FocusSetup';
import { FocusRunning } from '@/components/focus/FocusRunning';
import { SessionSummary } from '@/components/focus/SessionSummary';
import { Spinner } from '@/components/ui';

const OPEN = ['active', 'paused', 'on_break'];

function FocusInner() {
  const taskId = useSearchParams().get('task');
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<FocusSession | null>(null);
  const [ended, setEnded] = useState<FocusSession | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);

  const apply = useCallback((s: FocusSession | null) => {
    if (s?.serverTime) setOffsetMs(new Date(s.serverTime).getTime() - Date.now());
    if (s && !OPEN.includes(s.status)) {
      setSession(null);
      setEnded(s);
    } else setSession(s);
  }, []);

  // Khôi phục phiên đang mở (sau khi đóng tab, mất mạng hoặc bắt đầu trên thiết bị khác)
  const load = useCallback(async () => {
    try {
      const r = await get<{ session: FocusSession | null; serverTime: string }>('/sessions/active');
      setOffsetMs(new Date(r.serverTime).getTime() - Date.now());
      if (r.session) apply(r.session);
      else setSession((cur) => (cur ? null : cur));
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void load();
    const onReconnect = () => void load();
    window.addEventListener('focusly:reconnected', onReconnect);
    window.addEventListener('online', onReconnect);
    return () => {
      window.removeEventListener('focusly:reconnected', onReconnect);
      window.removeEventListener('online', onReconnect);
    };
  }, [load]);

  // Realtime: thao tác từ Mobile (tạm dừng, kết thúc...) cập nhật ngay trên Web
  useSocketEvent<FocusSession>('session:updated', (s) => {
    if (session && s.id === session.id) apply(s);
    else if (!session && OPEN.includes(s.status)) apply(s);
  });

  if (loading) return <Spinner />;

  return (
    <div className="col" style={{ gap: 18 }}>
      {!session && !ended && (
        <div className="page-header">
          <div>
            <h1>Phiên học tập trung</h1>
            <p className="muted">Đặt mục tiêu rõ ràng, bật Focus Shield và bắt đầu.</p>
          </div>
        </div>
      )}
      {session ? (
        <FocusRunning session={session} offsetMs={offsetMs} onChange={apply} onEnded={apply} />
      ) : ended ? (
        <SessionSummary session={ended} onNew={() => setEnded(null)} />
      ) : (
        <FocusSetup initialTaskId={taskId} onStarted={apply} />
      )}
    </div>
  );
}

export default function FocusPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FocusInner />
    </Suspense>
  );
}
