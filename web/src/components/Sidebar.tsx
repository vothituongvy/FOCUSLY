'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';
import { Avatar } from './ui';
import { Icon, type IconName } from './Icon';
import { NotificationBell } from './NotificationBell';

const GROUPS: { label: string | null; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'Hôm nay', icon: 'home' },
      { href: '/focus', label: 'Tập trung', icon: 'focus' },
      { href: '/plan', label: 'Kế hoạch', icon: 'plan' },
    ],
  },
  {
    label: 'Học',
    items: [
      { href: '/learn', label: 'Ôn tập & quiz', icon: 'cards' },
      { href: '/materials', label: 'Tài liệu', icon: 'materials' },
      { href: '/ai', label: 'Trợ lý AI', icon: 'ai' },
    ],
  },
  {
    label: 'Nhìn lại',
    items: [
      { href: '/analytics', label: 'Phân tích', icon: 'analytics' },
      { href: '/history', label: 'Lịch sử phiên', icon: 'history' },
      { href: '/journal', label: 'Nhật ký phân tâm', icon: 'journal' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const link = (href: string, label: string, icon: IconName) => (
    <Link key={href} href={href} className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`} aria-current={pathname.startsWith(href) ? 'page' : undefined}>
      <Icon name={icon} />
      <span className="nav-label">{label}</span>
    </Link>
  );

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-logo" aria-hidden /> focusly
      </Link>
      {GROUPS.map((g) => (
        <div key={g.label ?? 'main'} style={{ display: 'contents' }}>
          {g.label && <div className="nav-group">{g.label}</div>}
          {g.items.map((n) => link(n.href, n.label, n.icon))}
        </div>
      ))}
      <div className="sidebar-footer">
        <NotificationBell />
        {link('/settings', 'Cài đặt', 'settings')}
        {user && (
          <div className="me">
            <Avatar name={user.name} url={user.avatarUrl} />
            <div className="grow">
              <div className="truncate" style={{ fontWeight: 700, fontSize: 14 }}>
                {user.name}
              </div>
              <div className="truncate small muted">{user.email}</div>
            </div>
            <button
              className="icon-btn"
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={async () => {
                disconnectSocket();
                await logout();
                router.replace('/login');
              }}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
