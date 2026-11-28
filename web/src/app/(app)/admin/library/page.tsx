'use client';

import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Spinner } from '@/components/ui';
import { uiPrompt } from '@/lib/dialog';

type Kind = 'deck' | 'quiz' | 'material';
interface Item {
  id: string;
  title: string;
  description: string;
  authorName: string;
  copies: number;
  itemCount: number;
  publishedAt: string | null;
}

/** Kiểm duyệt Thư viện cộng đồng: gỡ nội dung không phù hợp (báo cho người chia sẻ) */
export default function AdminLibraryPage() {
  const [kind, setKind] = useState<Kind>('deck');
  const res = useResource<{ items: Item[] }>(`/admin/library?kind=${kind}`);
  const [error, setError] = useState('');
  const unpublish = async (i: Item) => {
    const reason = await uiPrompt(tr('Lý do gỡ “{0}” (gửi cho người chia sẻ):', i.title), tr('Nội dung không phù hợp với quy định chia sẻ.'));
    if (reason === null) return;
    setError('');
    try {
      await post(`/admin/library/${kind}/${i.id}/unpublish`, { reason });
      void res.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Kiểm duyệt Thư viện')}</h1>
          <p className="muted">{tr('Các mục đang chia sẻ công khai. Gỡ khỏi thư viện thì bản của người chia sẻ vẫn còn, chỉ không công khai nữa.')}</p>
        </div>
      </div>
      <div className="chips">
        {(
          [
            ['deck', '🃏 Flashcard'],
            ['quiz', '📝 Bộ câu hỏi'],
            ['material', '📄 Tài liệu'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
            {tr(l)}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <section className="card">
        {!res.data ? (
          <Spinner />
        ) : res.data.items.length === 0 ? (
          <Empty>{tr('Chưa có mục nào được chia sẻ.')}</Empty>
        ) : (
          <div className="list">
            {res.data.items.map((i) => (
              <div key={i.id} className="list-item wrap">
                <span className="grow col" style={{ gap: 2, minWidth: 200 }}>
                  <b>{i.title}</b>
                  {i.description && <span className="small muted truncate">{i.description}</span>}
                  <span className="small muted">
                    {tr('bởi {0}', i.authorName || '—')} · {tr('{0} lượt sao chép', i.copies)}
                    {i.publishedAt ? ` · ${new Date(i.publishedAt).toLocaleDateString()}` : ''}
                  </span>
                </span>
                <button className="btn danger sm" onClick={() => unpublish(i)}>
                  {tr('Gỡ khỏi thư viện')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
