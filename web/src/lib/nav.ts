import type { IconName } from '@/components/Icon';
import { tr } from '@/lib/i18n';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** Điều hướng chính */
export const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: tr('Hôm nay'), icon: 'home' },
      { href: '/focus', label: tr('Tập trung'), icon: 'focus' },
      { href: '/plan', label: tr('Kế hoạch'), icon: 'plan' },
    ],
  },
  {
    label: tr('Học'),
    items: [
      { href: '/learn', label: tr('Ôn tập & quiz'), icon: 'cards' },
      { href: '/materials', label: tr('Tài liệu'), icon: 'materials' },
      { href: '/ai', label: tr('Trợ lý AI'), icon: 'ai' },
    ],
  },
  {
    label: tr('Nhìn lại'),
    items: [
      { href: '/analytics', label: tr('Phân tích'), icon: 'analytics' },
      { href: '/history', label: tr('Lịch sử phiên'), icon: 'history' },
      { href: '/journal', label: tr('Nhật ký phân tâm'), icon: 'journal' },
    ],
  },
];

export const EXTRA_PAGES: NavItem[] = [
  { href: '/notifications', label: tr('Thông báo'), icon: 'bell' },
  { href: '/guide', label: tr('Hướng dẫn sử dụng'), icon: 'help' },
  { href: '/settings', label: tr('Cài đặt'), icon: 'settings' },
];

