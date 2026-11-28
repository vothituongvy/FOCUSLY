'use client';

import { useEffect, useState } from 'react';
import { errorMessage, get, patch } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Avatar, Empty, Modal, Spinner } from '@/components/ui';

interface U {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  lastActive: string | null;
  disabled: boolean;
  disabledReason: string;
  google: boolean;
  admin: boolean;
}
interface Detail {
  item: U;
  stats: { sessions: number; focusMinutes: number; decks: number; quizzes: number; materials: number; feedback: number; activeDays: number };
}

/** Quản lý người dùng: tìm kiếm, xem hoạt động, khoá / mở khoá tài khoản */
export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'disabled'>('all');
  const [page, setPage] = useState(1);
  const res = useResource<{ items: U[]; total: number }>(`/admin/users?status=${status}&page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const [open, setOpen] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => (setQuery(q.trim()), setPage(1)), 350);
    return () => clearTimeout(t);
  }, [q]);
  const show = async (id: string) => {
    setError('');
    try {
      setOpen(await get<Detail>(`/admin/users/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const total = res.data?.total ?? 0;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Người dùng')}</h1>
          <p className="muted">{tr('{0} tài khoản', total)}</p>
        </div>
      </div>
      <div className="row wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Tìm theo tên hoặc email…')} style={{ flex: '1 1 260px' }} />
        <button className={`chip ${status === 'all' ? 'active' : ''}`} onClick={() => (setStatus('all'), setPage(1))}>
          {tr('Tất cả')}
        </button>
        <button className={`chip ${status === 'disabled' ? 'active' : ''}`} onClick={() => (setStatus('disabled'), setPage(1))}>
          {tr('Đang bị khoá')}
        </button>
      </div>
      {(error || res.error) && <p className="error-text">{error || res.error}</p>}
      <section className="card">
        {!res.data ? (
          <Spinner />
        ) : res.data.items.length === 0 ? (
          <Empty>{tr('Không tìm thấy người dùng.')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('Người dùng')}</th>
                  <th>{tr('Đăng ký')}</th>
                  <th>{tr('Hoạt động gần nhất')}</th>
                  <th>{tr('Trạng thái')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {res.data.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <Avatar name={u.name} url={u.avatarUrl} />
                        <span className="col" style={{ gap: 0, minWidth: 0 }}>
                          <b className="truncate">
                            {u.name} {u.admin && <span className="badge">admin</span>}
                          </b>
                          <span className="small muted truncate">
                            {u.email}
                            {u.google ? ' · Google' : ''}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="small">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="small">{u.lastActive ?? '—'}</td>
                    <td>{u.disabled ? <span className="badge urgent" title={u.disabledReason}>{tr('Đã khoá')}</span> : <span className="badge done">{tr('Hoạt động')}</span>}</td>
                    <td>
                      <button className="btn secondary sm" onClick={() => show(u.id)}>
                        {tr('Chi tiết')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 30 && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ‹ {tr('Trước')}
            </button>
            <span className="small muted">
              {page}/{Math.ceil(total / 30)}
            </span>
            <button className="btn ghost sm" disabled={page * 30 >= total} onClick={() => setPage(page + 1)}>
              {tr('Sau')} ›
            </button>
          </div>
        )}
      </section>
      {open && <UserDetail d={open} onClose={() => setOpen(null)} onChanged={() => (setOpen(null), void res.reload())} />}
    </div>
  );
}

function UserDetail({ d, onClose, onChanged }: { d: Detail; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const u = d.item;
  const toggle = async () => {
    if (!u.disabled && !confirm(tr('Khoá tài khoản {0}? Người này sẽ bị đăng xuất khỏi mọi thiết bị.', u.name))) return;
    setError('');
    try {
      await patch(`/admin/users/${u.id}`, { disabled: !u.disabled, reason });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const st = d.stats;
  return (
    <Modal open onClose={onClose} title={u.name} width={560}>
      <div className="col" style={{ gap: 12 }}>
        <p className="muted small">
          {u.email} · {tr('đăng ký {0}', new Date(u.createdAt).toLocaleDateString())}
        </p>
        <div className="admin-content" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {(
            [
              [st.activeDays, 'Ngày hoạt động'],
              [st.sessions, 'Phiên học'],
              [st.focusMinutes, 'Phút tập trung'],
              [st.decks, 'Bộ flashcard'],
              [st.quizzes, 'Bộ câu hỏi'],
              [st.materials, 'Tài liệu'],
              [st.feedback, 'Góp ý đã gửi'],
            ] as const
          ).map(([v, l]) => (
            <div key={l}>
              <b className="tabular">{v.toLocaleString()}</b>
              <span className="small muted">{tr(l)}</span>
            </div>
          ))}
        </div>
        {u.disabled ? (
          <p className="small">
            {tr('Đang bị khoá')}
            {u.disabledReason ? `: ${u.disabledReason}` : ''}
          </p>
        ) : (
          <label className="field">
            {tr('Lý do khoá (người dùng sẽ thấy khi đăng nhập)')}
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={tr('VD: Đăng nội dung vi phạm bản quyền')} />
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>
            {tr('Đóng')}
          </button>
          <button className={`btn ${u.disabled ? '' : 'danger'}`} onClick={toggle}>
            {u.disabled ? tr('Mở khoá tài khoản') : tr('Khoá tài khoản')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
