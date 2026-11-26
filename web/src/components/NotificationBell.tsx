'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { get, post } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { fmtRelative } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { Icon, type IconName } from './Icon';
import { tr } from '@/lib/i18n';

const ICON: Record<string, IconName> = {
  study_reminder: 'calendar',
  task_reminder: 'plan',
  break_reminder: 'coffee',
  daily_summary: 'analytics',
  review_due: 'cards',
  system: 'bell',
};

/** PHASE 2 – chuông thông báo realtime + thông báo trình duyệt */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = () =>
    get<{ items: AppNotification[]; unread: number }>('/notifications?limit=15')
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => undefined);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useSocketEvent<AppNotification>('notification:new', (n) => {
    setItems((cur) => [n, ...cur].slice(0, 15));
    setUnread((u) => u + 1);
    if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
      const browserN = new Notification(n.title, { body: n.body, tag: n.id });
      browserN.onclick = () => {
        window.focus();
        if (n.data?.link) router.push(n.data.link);
      };
    }
  });
  useSocketEvent('notification:read', () => void load());

  const openItem = async (n: AppNotification) => {
    if (!n.readAt) {
      await post(`/notifications/${n.id}/read`).catch(() => undefined);
      setUnread((u) => Math.max(0, u - 1));
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    }
    setOpen(false);
    if (n.data?.link) router.push(n.data.link);
  };

  return (
    <div ref={ref} className="menu-wrap">
      <button
        className="icon-btn topbar-icon"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? tr('Thông báo ({0} chưa đọc)', unread) : tr('Thông báo')}
        title={tr('Thông báo')}
      >
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="row between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <b>{tr('Thông báo')}</b>
            <button
              className="btn ghost sm"
              onClick={async () => {
                await post('/notifications/read-all');
                setUnread(0);
                setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
              }}
            >
              {tr('Đánh dấu đã đọc')}
            </button>
          </div>
          {items.length === 0 && <div className="empty">{tr('Chưa có thông báo.')}</div>}
          {items.map((n) => (
            <button key={n.id} className={`notif-item ${n.readAt ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <span style={{ color: 'var(--muted)', paddingTop: 2 }}>
                <Icon name={ICON[n.type] ?? 'bell'} />
              </span>
              <span className="grow" style={{ textAlign: 'left' }}>
                <b className="small">{n.title}</b>
                <div className="small muted">{n.body}</div>
                <div className="small muted">{fmtRelative(n.createdAt)}</div>
              </span>
            </button>
          ))}
          <Link href="/notifications" className="small" style={{ display: 'block', textAlign: 'center', padding: 10 }} onClick={() => setOpen(false)}>
            {tr('Xem tất cả thông báo')}
          </Link>
        </div>
      )}
    </div>
  );
}
