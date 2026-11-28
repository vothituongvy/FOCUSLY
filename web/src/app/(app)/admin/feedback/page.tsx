'use client';

import { useState } from 'react';
import { errorMessage, patch } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Modal, Spinner } from '@/components/ui';
import { AdminTabs } from '@/components/AdminTabs';
import { FB_STATUS, FB_TYPE, type FbStatus, type FbType } from '@/lib/feedback';

interface Fb {
  id: string;
  type: FbType;
  message: string;
  page: string;
  platform: string;
  appVersion: string;
  device: string;
  status: FbStatus;
  reply: string;
  adminNote: string;
  createdAt: string;
  notifiedAt: string | null;
  user: { id: string; name: string; email: string } | null;
}

/** Bảng tổng hợp góp ý & báo lỗi: đánh dấu đã sửa, trả lời và báo cho người gửi */
export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<'open' | FbStatus | 'all'>('open');
  const [type, setType] = useState<FbType | 'all'>('all');
  const res = useResource<{ items: Fb[]; counts: Record<string, number> }>(`/admin/feedback?status=${status}&type=${type}`);
  const [open, setOpen] = useState<Fb | null>(null);
  const [error, setError] = useState('');
  const c = res.data?.counts ?? {};

  const quick = async (f: Fb, next: FbStatus) => {
    setError('');
    try {
      await patch(`/admin/feedback/${f.id}`, { status: next });
      void res.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Góp ý & báo lỗi')}</h1>
          <p className="muted">{tr('Phản hồi người dùng gửi từ web và app. Đánh dấu đã sửa, trả lời và báo cho người gửi nếu muốn.')}</p>
        </div>
      </div>
      <AdminTabs />
      {res.error && <p className="error-text">{res.error}</p>}
      <div className="row wrap">
        {(
          [
            ['open', `Chưa xong (${(c.new ?? 0) + (c.in_progress ?? 0)})`],
            ['new', `Mới (${c.new ?? 0})`],
            ['in_progress', `Đang xử lý (${c.in_progress ?? 0})`],
            ['fixed', `Đã sửa (${c.fixed ?? 0})`],
            ['wontfix', `Đã phản hồi (${c.wontfix ?? 0})`],
            ['all', 'Tất cả'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip ${status === k ? 'active' : ''}`} onClick={() => setStatus(k)}>
            {tr(l.replace(/\s\(\d+\)$/, ''))}
            {/\(\d+\)$/.test(l) ? ` ${l.match(/\(\d+\)$/)![0]}` : ''}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value as FbType | 'all')} className="filter">
          <option value="all">{tr('Mọi loại')}</option>
          <option value="bug">{tr(FB_TYPE.bug)}</option>
          <option value="idea">{tr(FB_TYPE.idea)}</option>
          <option value="other">{tr(FB_TYPE.other)}</option>
        </select>
      </div>
      {error && <p className="error-text">{error}</p>}
      <section className="card">
        {!res.data ? (
          <Spinner />
        ) : res.data.items.length === 0 ? (
          <Empty>{tr('Không có phản hồi nào ở mục này.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>{tr('Xong')}</th>
                  <th>{tr('Nội dung')}</th>
                  <th>{tr('Người gửi')}</th>
                  <th>{tr('Nền tảng')}</th>
                  <th>{tr('Ngày')}</th>
                  <th>{tr('Trạng thái')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 18, height: 18 }}
                        checked={f.status === 'fixed'}
                        onChange={(e) => quick(f, e.target.checked ? 'fixed' : 'in_progress')}
                        aria-label={tr('Đánh dấu đã sửa')}
                        title={tr('Đánh dấu đã sửa')}
                      />
                    </td>
                    <td style={{ maxWidth: 420 }}>
                      <span className="small muted">{tr(FB_TYPE[f.type])}</span>
                      <div className="fb-msg">{f.message}</div>
                      {f.reply && <div className="small muted">↳ {f.reply}</div>}
                    </td>
                    <td className="small">
                      {f.user?.name ?? '—'}
                      <div className="muted">{f.user?.email}</div>
                    </td>
                    <td className="small">
                      {f.platform}
                      {f.appVersion ? ` ${f.appVersion}` : ''}
                      {f.page && <div className="muted truncate" style={{ maxWidth: 140 }}>{f.page}</div>}
                    </td>
                    <td className="small">{new Date(f.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${FB_STATUS[f.status].cls}`}>{tr(FB_STATUS[f.status].label)}</span>
                      {f.notifiedAt && <div className="small muted">🔔 {tr('đã báo')}</div>}
                    </td>
                    <td>
                      <button className="btn secondary sm" onClick={() => setOpen(f)}>
                        {tr('Xử lý')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <FeedbackDetail f={open} onClose={() => setOpen(null)} onSaved={() => (setOpen(null), void res.reload())} />}
    </div>
  );
}

function FeedbackDetail({ f, onClose, onSaved }: { f: Fb; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<FbStatus>(f.status === 'new' ? 'in_progress' : f.status);
  const [reply, setReply] = useState(f.reply);
  const [note, setNote] = useState(f.adminNote);
  const [notifyUser, setNotifyUser] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await patch(`/admin/feedback/${f.id}`, { status, reply, adminNote: note, notifyUser });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={tr(FB_TYPE[f.type])} width={620}>
      <div className="col" style={{ gap: 12 }}>
        <div className="fb-quote">{f.message}</div>
        <p className="small muted">
          {f.user?.name} ({f.user?.email}) · {f.platform} {f.appVersion} · {f.page || '—'} · {new Date(f.createdAt).toLocaleString()}
          {f.device && <span style={{ display: 'block' }}>{f.device}</span>}
        </p>
        <div className="chips">
          {(['new', 'in_progress', 'fixed', 'wontfix'] as FbStatus[]).map((s) => (
            <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
              {tr(FB_STATUS[s].label)}
            </button>
          ))}
        </div>
        <label className="field">
          {tr('Trả lời người dùng (họ xem được)')}
          <textarea rows={3} value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} placeholder={tr('VD: Cảm ơn bạn! Lỗi đã được sửa ở bản 1.0.20.')} />
        </label>
        <label className="field">
          {tr('Ghi chú nội bộ (chỉ admin thấy)')}
          <textarea rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={notifyUser} onChange={(e) => setNotifyUser(e.target.checked)} />
          {tr('Gửi thông báo cho người gửi (trong app + điện thoại)')}
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button className="btn" disabled={busy} onClick={save}>
            {tr('Lưu')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
