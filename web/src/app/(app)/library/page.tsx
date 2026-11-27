'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Modal, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { ShareToLibrary } from '@/components/ShareToLibrary';
import type { LearnOverview, Material, Quiz } from '@/lib/types';

type Kind = 'deck' | 'quiz' | 'material';
interface Item {
  id: string;
  title: string;
  description: string;
  authorName: string;
  copies: number;
  itemCount: number;
  color?: string;
  materialType?: string;
  category?: string;
  sizeBytes?: number;
  mine: boolean;
}
interface Detail extends Item {
  kind: Kind;
  preview: { front: string; back: string }[];
  excerpt?: string;
  originalName?: string;
}
const TYPE_LABEL: Record<string, string> = { pdf: 'PDF', image: 'Ảnh', text: 'Văn bản', link: 'Link', document: 'Word/Excel' };
const kb = (n?: number) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const countLabel = (k: Kind, i: { itemCount: number; materialType?: string; sizeBytes?: number; category?: string }) =>
  k === 'deck' ? tr('{0} thẻ', i.itemCount) : k === 'quiz' ? tr('{0} câu', i.itemCount) : [tr(TYPE_LABEL[i.materialType ?? ''] ?? 'Tài liệu'), i.category ? tr(i.category) : '', kb(i.sizeBytes)].filter(Boolean).join(' · ');

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
      router.push(r.kind === 'deck' ? `/learn/decks/${r.id}` : r.kind === 'quiz' ? `/learn/quiz/${r.id}` : `/materials/${r.id}`);
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
            <button className={`tab ${kind === 'material' ? 'active' : ''}`} onClick={() => setKind('material')}>
              📄 {tr('Tài liệu')}
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
          <Empty>{query ? tr('Không tìm thấy bộ nào phù hợp.') : tr('Chưa có gì được chia sẻ ở mục này. Hãy là người đầu tiên: bấm “Chia sẻ bộ của tôi”.')}</Empty>
        ) : (
          <div className="lib-grid">
            {list.data.items.map((i) => (
              <button key={i.id} className="lib-card" onClick={() => preview(i.id)} style={{ borderTopColor: i.color }}>
                <b className="lib-title">{i.title}</b>
                {i.description && <span className="small muted lib-desc">{i.description}</span>}
                <span className="small muted">
                  {countLabel(kind, i)} · {tr('{0} lượt sao chép', i.copies)}
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
              <span>{m.kind === 'deck' ? '🃏' : m.kind === 'quiz' ? '📝' : '📄'}</span>
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
              {countLabel(open.kind, open)} · {tr('bởi {0}', open.authorName || '—')} · {tr('{0} lượt sao chép', open.copies)}
            </p>
            {open.kind === 'material' ? (
              open.excerpt ? (
                <div className="lib-preview" style={{ padding: 12, whiteSpace: 'pre-wrap', fontSize: 14 }}>
                  {open.excerpt}
                  {open.excerpt.length >= 900 ? '…' : ''}
                </div>
              ) : (
                <p className="small muted">{tr('Tài liệu này chưa có phần chữ để xem trước. Sao chép về để mở bản gốc.')}</p>
              )
            ) : (
            <div className="lib-preview">
              {open.preview.map((p, i) => (
                <div key={i} className="lib-preview-row">
                  <span>{p.front}</span>
                  {open.kind === 'deck' && <span className="muted">{p.back}</span>}
                </div>
              ))}
            </div>
            )}
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
  const materials = useResource<{ items: Material[] }>(open ? '/materials?limit=200' : null).data?.items ?? [];
  const [tab, setTab] = useState<Kind>('deck');
  const items: { id: string; title: string; note: string }[] =
    tab === 'deck'
      ? decks.map((d) => ({ id: d.id, title: d.title, note: tr('{0} thẻ', d.total) }))
      : tab === 'quiz'
        ? quizzes.map((q) => ({ id: q.id, title: q.title, note: tr('{0} câu', q.questions?.length ?? 0) }))
        : materials.filter((m) => !(m as unknown as { sourceRef?: string }).sourceRef?.startsWith('lib:')).map((m) => ({ id: m.id, title: m.title, note: tr(TYPE_LABEL[m.type] ?? 'Tài liệu') }));
  return (
    <Modal open={open} onClose={onClose} title={tr('Chia sẻ bộ của tôi')} width={600}>
      <div className="col" style={{ gap: 12 }}>
        <p className="small muted">{tr('Bật công tắc để đưa lên Thư viện cộng đồng (bộ thẻ/câu hỏi cần ít nhất 3 thẻ/câu). Người khác chỉ sao chép được, không sửa được bản của bạn. Tắt lúc nào cũng được.')}</p>
        <div className="chips">
          <button className={`chip ${tab === 'deck' ? 'active' : ''}`} onClick={() => setTab('deck')}>
            🃏 {tr('Bộ flashcard')}
          </button>
          <button className={`chip ${tab === 'quiz' ? 'active' : ''}`} onClick={() => setTab('quiz')}>
            📝 {tr('Bộ câu hỏi')}
          </button>
          <button className={`chip ${tab === 'material' ? 'active' : ''}`} onClick={() => setTab('material')}>
            📄 {tr('Tài liệu')}
          </button>
        </div>
        {tab === 'material' && <p className="small" style={{ margin: 0 }}>⚠️ {tr('Chỉ chia sẻ tài liệu do bạn tự soạn (ghi chú, đề cương, bài tóm tắt…) hoặc được tác giả cho phép. Không đăng sách, đề thi hay tài liệu có bản quyền của người khác.')}</p>}
        {items.length === 0 ? (
          <p className="muted">{tab === 'deck' ? tr('Bạn chưa có bộ flashcard nào. Tạo ở mục Ôn tập & quiz trước nhé.') : tab === 'quiz' ? tr('Bạn chưa có bộ câu hỏi nào. Tạo ở mục Ôn tập & quiz trước nhé.') : tr('Bạn chưa có tài liệu nào. Thêm ở mục Tài liệu trước nhé.')}</p>
        ) : (
          <div className="list" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.map((i) => (
              <div key={i.id} className="list-item">
                <span className="grow col" style={{ gap: 0 }}>
                  <b className="truncate">{i.title}</b>
                  <span className="small muted">{i.note}</span>
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
