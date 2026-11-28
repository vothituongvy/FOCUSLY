'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { errorMessage, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Spinner } from '@/components/ui';
import { FB_STATUS, FB_TYPE, type FbStatus, type FbType } from '@/lib/feedback';

interface Fb {
  id: string;
  type: FbType;
  message: string;
  status: FbStatus;
  reply: string;
  createdAt: string;
  resolvedAt: string | null;
}
/** Góp ý & báo lỗi: gửi cho đội FOCUSLY và theo dõi trạng thái xử lý */
export default function FeedbackPage() {
  const mine = useResource<{ items: Fb[] }>('/feedback/mine');
  const [type, setType] = useState<FbType>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const pathname = usePathname();

  const send = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await post('/feedback', {
        type,
        message: message.trim(),
        page: document.referrer ? new URL(document.referrer).pathname : pathname,
        platform: 'web',
        appVersion: (process.env.NEXT_PUBLIC_BUILD_ID ?? '').slice(0, 7),
        device: navigator.userAgent.slice(0, 200),
      });
      setMessage('');
      setMsg(tr('Cảm ơn bạn! Đội FOCUSLY đã nhận được và sẽ báo cho bạn khi xử lý xong.'));
      void mine.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Góp ý & báo lỗi')}</h1>
          <p className="muted">{tr('Gặp lỗi hay có ý tưởng làm FOCUSLY tốt hơn? Gửi trực tiếp cho đội phát triển – bạn sẽ nhận thông báo khi được xử lý.')}</p>
        </div>
      </div>
      <div className="grid split-aside">
        <section className="card col">
          <div className="chips" role="radiogroup" aria-label={tr('Loại phản hồi')}>
            {(['bug', 'idea', 'other'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={type === t} className={`chip ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                {tr(FB_TYPE[t])}
              </button>
            ))}
          </div>
          <label className="field">
            {type === 'bug' ? tr('Lỗi xảy ra như thế nào?') : type === 'idea' ? tr('Ý tưởng của bạn') : tr('Nội dung')}
            <textarea
              rows={7}
              value={message}
              maxLength={4000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={type === 'bug' ? tr('VD: Ở trang Ôn tập, bấm “Ôn bộ này” thì trang trắng. Mình dùng Chrome trên Windows.') : tr('Viết càng cụ thể càng dễ làm nhé…')}
            />
          </label>
          <p className="small muted">{tr('FOCUSLY tự gửi kèm trang bạn đang dùng, trình duyệt và phiên bản để dễ tìm lỗi. Không gửi mật khẩu hay thông tin riêng tư.')}</p>
          {msg && <p className="success-text">{msg}</p>}
          {error && <p className="error-text">{error}</p>}
          <button className="btn" disabled={busy || message.trim().length < 5} onClick={send}>
            {tr('Gửi cho đội FOCUSLY')}
          </button>
        </section>

        <section className="card col">
          <h3>{tr('Phản hồi bạn đã gửi')}</h3>
          {!mine.data ? (
            <Spinner />
          ) : mine.data.items.length === 0 ? (
            <Empty>{tr('Bạn chưa gửi phản hồi nào.')}</Empty>
          ) : (
            <div className="list">
              {mine.data.items.map((f) => (
                <div key={f.id} className="list-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                  <div className="row between" style={{ width: '100%' }}>
                    <span className="small muted">
                      {tr(FB_TYPE[f.type])} · {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                    <span className={`badge ${FB_STATUS[f.status].cls}`}>{tr(FB_STATUS[f.status].label)}</span>
                  </div>
                  <span className="small" style={{ whiteSpace: 'pre-wrap' }}>
                    {f.message.length > 220 ? `${f.message.slice(0, 220)}…` : f.message}
                  </span>
                  {f.reply && (
                    <span className="small fb-reply">
                      <b>{tr('FOCUSLY trả lời:')}</b> {f.reply}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
