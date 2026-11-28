'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';

/** Thanh chuyển giữa các trang quản trị */
export function AdminTabs() {
  const pathname = usePathname();
  const s = useResource<{ newFeedback: number }>('/admin/summary').data;
  const tabs: [string, string, number?][] = [
    ['/admin', 'Thống kê'],
    ['/admin/feedback', 'Góp ý & báo lỗi', s?.newFeedback],
    ['/admin/users', 'Người dùng'],
    ['/admin/library', 'Kiểm duyệt Thư viện'],
    ['/admin/broadcast', 'Gửi thông báo'],
  ];
  return (
    <nav className="tabs admin-tabs" aria-label={tr('Quản trị')}>
      {tabs.map(([href, label, n]) => (
        <Link key={href} href={href} className={`tab ${pathname === href ? 'active' : ''}`} aria-current={pathname === href ? 'page' : undefined}>
          {tr(label)}
          {!!n && <span className="nav-badge" style={{ order: 0, marginLeft: 6 }}>{n}</span>}
        </Link>
      ))}
    </nav>
  );
}
