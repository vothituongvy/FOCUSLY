'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { Icon } from './Icon';
import { NAV_DEFAULT_COLLAPSED, NAV_GROUPS } from '@/lib/nav';
import { tr } from '@/lib/i18n';

/** Thanh điều hướng bên trái. Trên màn hình nhỏ là ngăn kéo mở từ nút menu ở thanh trên. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  // số tin nhắn chưa đọc (cập nhật tức thì qua socket)
  const unreadRes = useResource<{ count: number }>('/chats/unread');
  const unread = unreadRes.data?.count ?? 0;
  useSocketEvent('chat:message', () => void unreadRes.reload());
  useSocketEvent('chat:read', () => void unreadRes.reload());
  // mục "Số liệu sử dụng" chỉ hiện với quản trị viên (ADMIN_EMAILS)
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    get<{ admin: boolean }>('/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);

  // đóng ngăn kéo khi chuyển trang
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // nhóm menu gập/mở – nhớ trên máy này
  const [collapsed, setCollapsed] = useState<string[]>(NAV_DEFAULT_COLLAPSED);
  useEffect(() => {
    try {
      const v = localStorage.getItem('focusly.navCollapsed');
      if (v) setCollapsed(JSON.parse(v) as string[]);
    } catch {
      /* trình duyệt chặn lưu trữ */
    }
  }, []);
  const toggleGroup = (key: string) =>
    setCollapsed((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      try {
        localStorage.setItem('focusly.navCollapsed', JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
      return next;
    });

  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label={tr('Điều hướng chính')}>
        <Link href="/dashboard" className="brand">
          <img src="/icons/logo-mark.png" alt="" className="brand-mark" width={30} height={30} /> <span className="brand-word">FOCUSLY</span>
        </Link>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((g) => {
            const hasActive = g.items.some((n) => active(n.href));
            const isOpen = !g.label || hasActive || !collapsed.includes(g.key);
            const groupUnread = g.items.some((n) => n.href === '/messages') ? unread : 0;
            return (
            <div key={g.key} className="nav-section">
              {g.label && (
                <button
                  type="button"
                  className={`nav-group nav-group-btn ${isOpen ? 'open' : ''}`}
                  aria-expanded={isOpen}
                  onClick={() => !hasActive && toggleGroup(g.key)}
                  title={hasActive ? undefined : isOpen ? tr('Thu gọn') : tr('Mở rộng')}
                >
                  <span>{g.label}</span>
                  {!isOpen && groupUnread > 0 && <span className="nav-dot" aria-hidden />}
                  {!hasActive && <Icon name="chevronRight" size={14} className="nav-chevron" />}
                </button>
              )}
              {isOpen && g.items.map((n) => (
                <Link key={n.href} href={n.href} className={`nav-link ${active(n.href) ? 'active' : ''}`} aria-current={active(n.href) ? 'page' : undefined}>
                  <Icon name={n.icon} />
                  {n.href === '/messages' && unread > 0 && <span className="nav-badge" aria-label={tr('{0} tin chưa đọc', unread)}>{unread > 99 ? '99+' : unread}</span>}
                  <span className="nav-label">{n.label}</span>
                </Link>
              ))}
            </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {admin && (
            <Link href="/admin" className={`nav-link ${active('/admin') ? 'active' : ''}`}>
              <Icon name="analytics" />
              <span className="nav-label">{tr('Số liệu sử dụng')}</span>
            </Link>
          )}
          <Link href="/guide" className={`nav-link ${active('/guide') ? 'active' : ''}`}>
            <Icon name="help" />
            <span className="nav-label">{tr('Hướng dẫn sử dụng')}</span>
          </Link>
          <Link href="/settings" className={`nav-link ${active('/settings') ? 'active' : ''}`}>
            <Icon name="settings" />
            <span className="nav-label">{tr('Cài đặt')}</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
