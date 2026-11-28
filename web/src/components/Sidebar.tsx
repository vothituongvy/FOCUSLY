'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';
import { Icon } from './Icon';
import { NAV_GROUPS } from '@/lib/nav';
import { tr } from '@/lib/i18n';

/** Thanh điều hướng bên trái. Trên màn hình nhỏ là ngăn kéo mở từ nút menu ở thanh trên. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

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

  // mục Thống kê hệ thống chỉ hiện với tài khoản quản trị (ADMIN_EMAILS)
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    get<{ admin: boolean }>('/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);

  // số góp ý mới chưa xem (hiện cạnh mục Góp ý & báo lỗi)
  const [newFb, setNewFb] = useState(0);
  useEffect(() => {
    if (!admin) return;
    get<{ newFeedback: number }>('/admin/summary')
      .then((r) => setNewFb(r.newFeedback))
      .catch(() => undefined);
  }, [admin, pathname]);

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
                  <span className="nav-label">{n.label}</span>
                </Link>
              ))}
            </div>
          ))}
          {admin && (
            <div className="nav-section">
              <div className="nav-group">{tr('Quản trị')}</div>
              {(
                [
                  ['/admin', 'analytics', 'Thống kê hệ thống'],
                  ['/admin/feedback', 'chat', 'Góp ý & báo lỗi'],
                  ['/admin/users', 'users', 'Người dùng'],
                  ['/admin/library', 'library', 'Kiểm duyệt Thư viện'],
                  ['/admin/broadcast', 'bell', 'Gửi thông báo'],
                ] as const
              ).map(([href, icon, label]) => (
                <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`} aria-current={pathname === href ? 'page' : undefined}>
                  <Icon name={icon} />
                  <span className="nav-label">{tr(label)}</span>
                  {href === '/admin/feedback' && newFb > 0 && <span className="nav-badge">{newFb > 99 ? '99+' : newFb}</span>}
                </Link>
              ))}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
