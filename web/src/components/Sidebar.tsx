'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
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
        </nav>
      </aside>
    </>
  );
}
