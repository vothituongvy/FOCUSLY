'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNow, useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { fmtClock, liveSeconds } from '@/lib/format';
import type { FocusSession } from '@/lib/types';
import { tr } from '@/lib/i18n';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';
import { GlobalSearch } from './GlobalSearch';

/** Phiên đang chạy (kể cả bắt đầu trên điện thoại) hoặc nút bắt đầu nhanh */
function SessionChip() {
  const pathname = usePathname();
  const { data, setData } = useResource<{ session: FocusSession | null }>('/sessions/active', ['sessions']);
  useSocketEvent<FocusSession>('session:updated', (s) => setData({ session: ['completed', 'abandoned'].includes(s.status) ? null : s }));
  useNow();
  const s = data?.session;
  if (pathname.startsWith('/focus')) return null;
  if (!s) {
    return (
      <Link href="/focus" className="btn marker sm topbar-start">
        <Icon name="play" size={14} /> <span>{tr('Bắt đầu học')}</span>
      </Link>
    );
  }
  const { focus } = liveSeconds(s);
  const label = s.status === 'active' ? tr('Đang tập trung') : s.status === 'on_break' ? tr('Đang nghỉ') : tr('Tạm dừng');
  return (
    <Link href="/focus" className={`session-chip ${s.status}`} title={s.goal}>
      <span className="session-dot" aria-hidden />
      <span className="session-label">{label}</span>
      <b>{fmtClock(focus)}</b>
      {s.device !== 'web' && <span className="session-dev">{s.device}</span>}
    </Link>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-btn topbar-menu" onClick={onMenu} aria-label={tr('Mở menu')}>
        <Icon name="menu" size={20} />
      </button>
      <Link href="/dashboard" className="brand topbar-brand">
        <img src="/icons/logo-mark.png" alt="" className="brand-mark" width={30} height={30} /> <span className="brand-word">FOCUSLY</span>
      </Link>
      <GlobalSearch />
      <div className="topbar-right">
        <SessionChip />
        <Link href="/guide" className="icon-btn topbar-icon" aria-label={tr('Hướng dẫn sử dụng')} title={tr('Hướng dẫn sử dụng')}>
          <Icon name="help" size={20} />
        </Link>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
