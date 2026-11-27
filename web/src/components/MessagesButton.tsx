'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { tr } from '@/lib/i18n';
import { Icon } from './Icon';

/** Nút Tin nhắn trên thanh trên – kèm số tin chưa đọc, cập nhật tức thì */
export function MessagesButton() {
  const pathname = usePathname();
  const res = useResource<{ count: number }>('/chats/unread');
  useSocketEvent('chat:message', () => void res.reload());
  useSocketEvent('chat:read', () => void res.reload());
  const n = res.data?.count ?? 0;
  const label = n ? tr('Tin nhắn ({0} chưa đọc)', n) : tr('Tin nhắn');
  return (
    <Link href="/messages" className={`icon-btn topbar-icon ${pathname.startsWith('/messages') ? 'is-active' : ''}`} aria-label={label} title={label}>
      <Icon name="chat" size={20} />
      {n > 0 && <span className="dot-badge">{n > 99 ? '99+' : n}</span>}
    </Link>
  );
}
