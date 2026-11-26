'use client';

import { useState } from 'react';
import { useResource } from '@/lib/hooks';
import { fmtDate, fmtDuration } from '@/lib/format';
import type { FocusSession } from '@/lib/types';
import { Empty, Modal, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LOCALE, tr } from '@/lib/i18n';

const STATUS: Record<string, string> = {
  active: tr('Đang chạy'),
  paused: tr('Tạm dừng'),
  on_break: tr('Đang nghỉ'),
  completed: tr('Hoàn thành'),
  abandoned: tr('Đã huỷ'),
};
const DEVICE: Record<string, string> = { web: 'Web', android: 'Android', ios: 'iOS', unknown: '—' };
const PAGE = 20;

export default function HistoryPage() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<FocusSession | null>(null);
  const { data, loading } = useResource<{ items: FocusSession[]; total: number }>(
    `/sessions?limit=${PAGE}&skip=${page * PAGE}${status ? `&status=${status}` : ''}`,
    ['sessions'],
  );

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Lịch sử phiên học')}</h1>
          <p className="muted">{tr('Mọi phiên học trên Web và Mobile.')}</p>
        </div>
        <div className="chips">
          {[
            ['', tr('Tất cả')],
            ['completed', tr('Hoàn thành')],
            ['abandoned', tr('Đã huỷ')],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`chip ${status === v ? 'active' : ''}`}
              onClick={() => {
                setStatus(v);
                setPage(0);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        {loading && !data ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty>{tr('Chưa có phiên học nào.')}</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 12.5 }}>
                  {[tr('Thời gian'), tr('Môn / Nhiệm vụ'), tr('Mục tiêu'), tr('Tập trung'), tr('Dự kiến'), tr('Phân tâm'), tr('Thiết bị'), tr('Trạng thái')].map((h) => (
                    <th key={h} style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const subj = typeof s.subject === 'object' ? s.subject : null;
                  const task = typeof s.task === 'object' ? s.task : null;
                  return (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(s)}>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{fmtDate(s.startedAt, true)}</td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>
                        {subj ? `${subj.icon} ${subj.name}` : '—'}
                        {task && <div className="small muted">{task.title}</div>}
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)', maxWidth: 240 }} className="truncate">
                        {s.goal}
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>
                        <b>{fmtDuration(s.actualFocusSeconds)}</b>
                      </td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>{s.plannedMinutes ? `${s.plannedMinutes}p` : '—'}</td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>{s.distractionCount}</td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>{DEVICE[s.device]}</td>
                      <td style={{ padding: '10px 6px', borderBottom: '1px solid var(--border)' }}>
                        <span className={`badge ${s.status === 'completed' ? 'done' : ''}`}>{STATUS[s.status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="row between mt-16">
          <span className="small muted">{tr('Tổng {0} phiên', data?.total ?? 0)}</span>
          <div className="row">
            <button className="btn sm secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {tr('‹ Trước')}
            </button>
            <span className="small">
              {page + 1}/{totalPages}
            </span>
            <button className="btn sm secondary" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
              Sau ›
            </button>
          </div>
        </div>
      </div>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={tr('Chi tiết phiên học')}>
          <div className="col">
            <p>{detail.goal}</p>
            <p className="small muted">
              {fmtDate(detail.startedAt, true)} {detail.endedAt ? fmtDate(detail.endedAt, true) : tr('đang mở')}
            </p>
            <div className="list">
              {detail.segments.map((seg, i) => {
                const end = seg.endedAt ? new Date(seg.endedAt) : new Date();
                const secs = (end.getTime() - new Date(seg.startedAt).getTime()) / 1000;
                return (
                  <div className="list-item" key={i}>
                    <span className="muted"><Icon name={seg.type === 'focus' ? 'focus' : 'coffee'} size={15} /></span>
                    <span className="grow small">
                      {new Date(seg.startedAt).toLocaleTimeString(LOCALE)} – {seg.endedAt ? end.toLocaleTimeString(LOCALE) : '…'}
                      {seg.endReason === 'auto_pause' && <span className="badge high" style={{ marginLeft: 6 }}>{tr('tự tạm dừng')}</span>}
                    </span>
                    <b className="small">{fmtDuration(secs)}</b>
                  </div>
                );
              })}
            </div>
            {detail.summary?.note && <p>{detail.summary.note}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
