'use client';

import Link from 'next/link';
import { useState } from 'react';
import { del, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { fmtDate } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

const LABEL: Record<string, string> = {
  study_reminder: tr('Nhắc lịch học'),
  task_reminder: tr('Nhiệm vụ'),
  break_reminder: tr('Nghỉ giải lao'),
  daily_summary: tr('Tổng kết ngày'),
  review_due: tr('Ôn tập'),
  system: tr('Hệ thống'),
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, reload } = useResource<{ items: AppNotification[]; unread: number }>(`/notifications?limit=200${unreadOnly ? '&unread=true' : ''}`);
  useSocketEvent('notification:new', () => void reload());

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Thông báo')}</h1>
          <p className="muted">
            {tr('{0} chưa đọc ·', data?.unread ?? 0)}{' '}<Link href="/settings?tab=notifications">{tr('Cài đặt thông báo')}</Link>
          </p>
        </div>
        <div className="row">
          <button className={`chip ${unreadOnly ? 'active' : ''}`} onClick={() => setUnreadOnly(!unreadOnly)}>
            {tr('Chỉ chưa đọc')}
          </button>
          <button
            className="btn secondary sm"
            onClick={async () => {
              await post('/notifications/read-all');
              void reload();
            }}
          >
            {tr('Đánh dấu tất cả đã đọc')}
          </button>
        </div>
      </div>
      <div className="card">
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <Empty>{tr('Không có thông báo.')}</Empty>
        ) : (
          <div className="list">
            {data.items.map((n) => (
              <div key={n.id} className="list-item" style={{ background: n.readAt ? undefined : 'var(--primary-50)', borderRadius: 8, padding: '10px 8px' }}>
                <div className="grow">
                  <div className="small muted">
                    {LABEL[n.type]} · {fmtDate(n.createdAt, true)}
                  </div>
                  <b>{n.title}</b>
                  <div className="small">{n.body}</div>
                </div>
                {n.data?.link && (
                  <Link href={n.data.link} className="btn sm secondary" onClick={() => !n.readAt && post(`/notifications/${n.id}/read`)}>
                    {tr('Mở')}
                  </Link>
                )}
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    await post(`/notifications/${n.id}/${n.readAt ? 'unread' : 'read'}`);
                    void reload();
                  }}
                >
                  {n.readAt ? tr('Chưa đọc') : tr('Đã đọc')}
                </button>
                <button
                  className="icon-btn"
                  onClick={async () => {
                    await del(`/notifications/${n.id}`);
                    void reload();
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
