'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Modal, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ShareToLibrary } from '@/components/ShareToLibrary';
import type { LearnOverview, Quiz } from '@/lib/types';

type Kind = 'deck' | 'quiz';
interface Item {
  id: string;
  title: string;
  description: string;
  authorName: string;
  copies: number;
  itemCount: number;
  color?: string;
  mine: boolean;
}
interface Detail extends Item {
  kind: Kind;
  preview: { front: string; back: string }[];
}

export default function LibraryPage() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('deck');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const list = useResource<{ items: Item[] }>(`/library?kind=${kind}&sort=${sort}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const mine = useResource<{ items: { kind: Kind; id: string; title: string; copies: number; itemCount: number }[] }>('/library/mine');
  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const preview = async (id: string) => {
    setError('');
    try {
      setOpen((await get<{ item: Detail }>(`/library/${kind}/${id}`)).item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const copy = async (d: Detail) => {
    setBusy(true);
    try {
      const r = await post<{ id: string; kind: Kind }>(`/library/${d.kind}/${d.id}/copy`);
      router.push(r.kind === 'deck' ? `/learn/decks/${r.id}` : `/learn/quiz/${r.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Thư viện cộng đồng')}</h1>
          <p className="muted">{tr('Bộ flashcard và bộ câu hỏi do người học khác chia sẻ. Sao chép về để học – bản của bạn là bản riêng, sửa thoải mái.')}</p>
        </div>
        <button className="btn marker" onClick={() => setShareOpen(true)}>
          <Icon name="upload" size={16} /> {tr('Chia sẻ bộ của tôi')}
        </button>
      </div>

      <div className="card col">
        <div className="row wrap">
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none' }}>
            <button className={`tab ${kind === 'deck' ? 'active' : ''}`} onClick={() => setKind('deck')}>
              🃏 {tr('Flashcard')}
            </button>
            <button className={`tab ${kind === 'quiz' ? 'active' : ''}`} onClick={() => setKind('quiz')}>
              📝 {tr('Bộ câu hỏi')}
            </button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Tìm theo tên, mô tả, tác giả…')} style={{ flex: '1 1 220px' }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as 'popular' | 'new')} className="filter">
            <option value="popular">{tr('Phổ biến nhất')}</option>
            <option value="new">{tr('Mới nhất')}</option>
          </select>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!list.data ? (
          <Spinner />
        ) : list.data.items.length === 0 ? (
          <Empty>{query ? tr('Không tìm thấy bộ nào phù hợp.') : tr('Chưa có bộ nào được chia sẻ. Hãy là người đầu tiên: mở một bộ của bạn và bật “Chia sẻ lên Thư viện cộng đồng”.')}</Empty>
        ) : (
          <div className="lib-grid">
            {list.data.items.map((i) => (
              <button key={i.id} className="lib-card" onClick={() => preview(i.id)} style={{ borderTopColor: i.color }}>
                <b className="lib-title">{i.title}</b>
                {i.description && <span className="small muted lib-desc">{i.description}</span>}
                <span className="small muted">
                  {kind === 'deck' ? tr('{0} thẻ', i.itemCount) : tr('{0} câu', i.itemCount)} · {tr('{0} lượt sao chép', i.copies)}
                </span>
                <span className="small">{i.mine ? tr('Của bạn') : tr('bởi {0}', i.authorName || '—')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!!mine.data?.items.length && (
        <section className="card col">
          <h3>{tr('Bạn đang chia sẻ')}</h3>
          {mine.data.items.map((m) => (
            <div key={m.kind + m.id} className="list-item">
              <span>{m.kind === 'deck' ? '🃏' : '📝'}</span>
              <span className="grow">{m.title}</span>
              <span className="small muted">{tr('{0} lượt sao chép', m.copies)}</span>
            </div>
          ))}
        </section>
      )}

      <ShareMine
        open={shareOpen}
        onClose={() => {
          setShareOpen(false);
          void mine.reload();
          void list.reload();
        }}
      />

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title} width={640}>
        {open && (
          <div className="col" style={{ gap: 12 }}>
            {open.description && <p className="muted">{open.description}</p>}
            <p className="small muted">
              {open.kind === 'deck' ? tr('{0} thẻ', open.itemCount) : tr('{0} câu', open.itemCount)} · {tr('bởi {0}', open.authorName || '—')} · {tr('{0} lượt sao chép', open.copies)}
            </p>
            <div className="lib-preview">
              {open.preview.map((p, i) => (
                <div key={i} className="lib-preview-row">
                  <span>{p.front}</span>
                  {open.kind === 'deck' && <span className="muted">{p.back}</span>}
                </div>
              ))}
            </div>
            <button className="btn marker" disabled={busy} onClick={() => copy(open)}>
              <Icon name="download" size={16} /> {tr('Sao chép về tài khoản của tôi')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Chọn bộ flashcard / bộ câu hỏi của mình để bật – tắt chia sẻ lên Thư viện */
function ShareMine({ open, onClose }: { open: boolean; onClose: () => void }) {
  const decks = useResource<LearnOverview>(open ? '/learn/overview' : null).data?.decks ?? [];
  const quizzes = useResource<{ items: Quiz[] }>(open ? '/quizzes?limit=200' : null).data?.items ?? [];
  const [tab, setTab] = useState<Kind>('deck');
  const items = tab === 'deck' ? decks.map((d) => ({ id: d.id, title: d.title, count: (d as unknown as { total?: number }).total })) : quizzes.map((q) => ({ id: q.id, title: q.title, count: q.questions?.length }));
  return (
    <Modal open={open} onClose={onClose} title={tr('Chia sẻ bộ của tôi')} width={600}>
      <div className="col" style={{ gap: 12 }}>
        <p className="small muted">{tr('Bật công tắc để đưa bộ lên Thư viện cộng đồng (cần ít nhất 3 thẻ/câu). Người khác chỉ sao chép được, không sửa được bản của bạn. Tắt lúc nào cũng được.')}</p>
        <div className="chips">
          <button className={`chip ${tab === 'deck' ? 'active' : ''}`} onClick={() => setTab('deck')}>
            🃏 {tr('Bộ flashcard')}
          </button>
          <button className={`chip ${tab === 'quiz' ? 'active' : ''}`} onClick={() => setTab('quiz')}>
            📝 {tr('Bộ câu hỏi')}
          </button>
        </div>
        {items.length === 0 ? (
          <p className="muted">{tab === 'deck' ? tr('Bạn chưa có bộ flashcard nào. Tạo ở mục Ôn tập & quiz trước nhé.') : tr('Bạn chưa có bộ câu hỏi nào. Tạo ở mục Ôn tập & quiz trước nhé.')}</p>
        ) : (
          <div className="list" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.map((i) => (
              <div key={i.id} className="list-item">
                <span className="grow col" style={{ gap: 0 }}>
                  <b className="truncate">{i.title}</b>
                  {i.count !== undefined && <span className="small muted">{tab === 'deck' ? tr('{0} thẻ', i.count) : tr('{0} câu', i.count)}</span>}
                </span>
                <ShareToLibrary kind={tab} id={i.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
