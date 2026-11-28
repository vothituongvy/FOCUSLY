'use client';

import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { AdminTabs } from '@/components/AdminTabs';

/** Gửi thông báo tới mọi người dùng (trong app + điện thoại): ra mắt tính năng, bảo trì, sự kiện… */
export default function AdminBroadcastPage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<'all' | 'active30'>('all');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!confirm(tr('Gửi thông báo này tới {0}?', audience === 'all' ? tr('tất cả người dùng') : tr('người dùng hoạt động 30 ngày qua')))) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const r = await post<{ recipients: number }>('/admin/broadcast', { title: title.trim(), body: body.trim(), link: link.trim(), audience });
      setMsg(tr('Đang gửi tới {0} người dùng.', r.recipients));
      setTitle('');
      setBody('');
      setLink('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Gửi thông báo')}</h1>
          <p className="muted">{tr('Thông báo hiện trong mục Thông báo và đẩy tới điện thoại. Bản app mới được máy chủ tự báo, không cần gửi tay.')}</p>
        </div>
      </div>
      <AdminTabs />
      <section className="card col" style={{ maxWidth: 720 }}>
        <label className="field">
          {tr('Tiêu đề')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={tr('VD: Ra mắt Phòng học chung 🎉')} />
        </label>
        <label className="field">
          {tr('Nội dung')}
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder={tr('VD: Giờ bạn có thể học cùng bạn bè với một đồng hồ Pomodoro chung…')} />
        </label>
        <label className="field">
          {tr('Mở trang khi bấm (không bắt buộc)')}
          <select value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">{tr('— Không —')}</option>
            <option value="/dashboard">{tr('Hôm nay')}</option>
            <option value="/focus">{tr('Tập trung')}</option>
            <option value="/learn">{tr('Ôn tập & quiz')}</option>
            <option value="/exams">{tr('Ôn thi')}</option>
            <option value="/messages">{tr('Tin nhắn')}</option>
            <option value="/friends">{tr('Bạn bè & xếp hạng')}</option>
            <option value="/rooms">{tr('Phòng học chung')}</option>
            <option value="/library">{tr('Thư viện cộng đồng')}</option>
            <option value="/report">{tr('Báo cáo tuần')}</option>
            <option value="/feedback">{tr('Góp ý & báo lỗi')}</option>
            <option value="/update">{tr('Cập nhật app')}</option>
          </select>
        </label>
        <div className="chips">
          <button className={`chip ${audience === 'all' ? 'active' : ''}`} onClick={() => setAudience('all')}>
            {tr('Tất cả người dùng')}
          </button>
          <button className={`chip ${audience === 'active30' ? 'active' : ''}`} onClick={() => setAudience('active30')}>
            {tr('Hoạt động 30 ngày qua')}
          </button>
        </div>
        {msg && <p className="success-text">{msg}</p>}
        {error && <p className="error-text">{error}</p>}
        <button className="btn marker" disabled={busy || title.trim().length < 2} onClick={send}>
          {tr('Gửi thông báo')}
        </button>
      </section>
    </div>
  );
}
