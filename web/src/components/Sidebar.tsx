'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { Icon } from './Icon';
import { NAV_GROUPS } from '@/lib/nav';
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


  return (
    <>
      {open && <div className="drawer-backdrop" onClick={onClose} aria-hidden />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label={tr('Điều hướng chính')}>
        <Link href="/dashboard" className="brand">
          <img src="/icons/logo-mark.png" alt="" className="brand-mark" width={30} height={30} /> <span className="brand-word">FOCUSLY</span>
        </Link>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((g) => (
            <div key={g.key} className="nav-section">
              {g.label && <div className="nav-group">{g.label}</div>}
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} className={`nav-link ${active(n.href) ? 'active' : ''}`} aria-current={active(n.href) ? 'page' : undefined}>
                  <Icon name={n.icon} />
                  {n.href === '/messages' && unread > 0 && <span className="nav-badge" aria-label={tr('{0} tin chưa đọc', unread)}>{unread > 99 ? '99+' : unread}</span>}
                  <span className="nav-label">{n.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {/* Chân thanh bên: 1 hàng biểu tượng gọn (di chuột để xem tên) */}
        <div className="sidebar-footer sidebar-tools">
          {admin && (
            <Link href="/admin" className={`tool-link ${active('/admin') ? 'active' : ''}`} title={tr('Số liệu sử dụng')} aria-label={tr('Số liệu sử dụng')}>
              <Icon name="analytics" />
            </Link>
          )}
          <Link href="/guide" className={`tool-link ${active('/guide') ? 'active' : ''}`} title={tr('Hướng dẫn sử dụng')} aria-label={tr('Hướng dẫn sử dụng')}>
            <Icon name="help" />
            <span>{tr('Hướng dẫn')}</span>
          </Link>
          <Link href="/settings" className={`tool-link ${active('/settings') ? 'active' : ''}`} title={tr('Cài đặt')} aria-label={tr('Cài đặt')}>
            <Icon name="settings" />
            <span>{tr('Cài đặt')}</span>
          </Link>
        </div>
      </aside>
    </>
  );
}
