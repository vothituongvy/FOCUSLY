'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { del, errorMessage, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import type { Card, Deck } from '@/lib/types';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface DraftCard {
  front: string;
  back: string;
  hint?: string;
  keep: boolean;
}

function DeckInner() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const fromDraft = useSearchParams().get('draft') === '1';
  const subjects = useLearning((s) => s.subjects);
  const deck = useResource<{ item: Deck }>(isNew ? null : `/decks/${id}`, ['decks']);
  const cards = useResource<{ items: Card[] }>(isNew ? null : `/cards?deck=${id}&limit=1000`, ['cards']);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [material, setMaterial] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftCard[]>([]);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!fromDraft) return;
    const raw = sessionStorage.getItem('focusly.cardsDraft');
    if (!raw) return;
    sessionStorage.removeItem('focusly.cardsDraft');
    const d = JSON.parse(raw) as { title: string; subject?: string | null; material?: string | null; cards: Omit<DraftCard, 'keep'>[] };
    setTitle(d.title);
    setSubject(d.subject ?? '');
    setMaterial(d.material ?? null);
    setDrafts(d.cards.map((c) => ({ ...c, keep: true })));
  }, [fromDraft]);

  const generate = async () => {
    setBusy('ai');
    setError('');
    try {
      const r = await post<{ draft: { title: string; cards: Omit<DraftCard, 'keep'>[] } }>('/ai/generate/flashcards', { topic, count: 15 });
      if (isNew && !title) setTitle(r.draft.title);
      setDrafts((cur) => [...cur, ...r.draft.cards.map((c) => ({ ...c, keep: true }))]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const saveDrafts = async (deckId: string) => {
    for (const c of drafts.filter((d) => d.keep && d.front.trim() && d.back.trim())) {
      await post('/cards', { deck: deckId, front: c.front, back: c.back, hint: c.hint ?? '', source: 'ai' });
    }
    setDrafts([]);
  };

  const createDeck = async () => {
    setBusy('save');
    setError('');
    try {
      const r = await post<{ item: Deck }>('/decks', { title: title || 'Bộ thẻ mới', subject: subject || null, material });
      await saveDrafts(r.item.id);
      router.replace(`/learn/decks/${r.item.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy('');
    }
  };

  const draftEditor = drafts.length > 0 && (
    <div className="card col">
      <div className="row between">
        <h3>Bản nháp từ AI ({drafts.filter((d) => d.keep).length}/{drafts.length} được chọn)</h3>
        <span className="small muted">Sửa, bỏ chọn thẻ chưa phù hợp rồi lưu</span>
      </div>
      {drafts.map((d, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-start', opacity: d.keep ? 1 : 0.45 }}>
          <input type="checkbox" checked={d.keep} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
          <textarea value={d.front} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} style={{ minHeight: 60 }} />
          <textarea value={d.back} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} style={{ minHeight: 60 }} />
        </div>
      ))}
      {!isNew && (
        <button className="btn" onClick={() => saveDrafts(id).then(cards.reload)}>
          Lưu các thẻ đã chọn
        </button>
      )}
    </div>
  );

  const aiBox = (
    <div className="row">
      <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Chủ đề để AI tạo thẻ, vd: React Hooks cơ bản" />
      <button className="btn secondary" disabled={!topic || busy === 'ai'} onClick={generate}>
        {busy === 'ai' ? 'Đang tạo...' : 'Tạo bằng AI'}
      </button>
    </div>
  );

  if (isNew) {
    return (
      <div className="col" style={{ gap: 16, maxWidth: 900 }}>
        <Link href="/learn" className="small">
          ‹ Ôn tập
        </Link>
        <h1>Tạo bộ flashcard</h1>
        <div className="card form">
          <div className="grid grid-2">
            <label className="field">
              Tên bộ thẻ
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: React Hooks" />
            </label>
            <label className="field">
              Môn học
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">— Không —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {aiBox}
        </div>
        {draftEditor}
        {error && <p className="error-text">{error}</p>}
        <button className="btn lg" disabled={busy === 'save'} onClick={createDeck}>
          Tạo bộ thẻ{drafts.filter((d) => d.keep).length ? ` với ${drafts.filter((d) => d.keep).length} thẻ` : ''}
        </button>
      </div>
    );
  }

  const d = deck.data?.item;
  if (!d) return <Spinner />;
  const list = cards.data?.items ?? [];

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <Link href="/learn" className="small">
            ‹ Ôn tập
          </Link>
          <h1>{d.title}</h1>
          <p className="muted small">{list.length} thẻ</p>
        </div>
        <div className="row">
          <Link href={`/learn/review?deck=${id}`} className="btn">
            <Icon name="cards" size={16} /> Ôn bộ này
          </Link>
          <button
            className="btn ghost"
            style={{ color: 'var(--danger)' }}
            onClick={async () => {
              if (!confirm('Xoá bộ thẻ và toàn bộ thẻ bên trong?')) return;
              await del(`/decks/${id}`);
              router.push('/learn');
            }}
          >
            Xoá bộ
          </button>
        </div>
      </div>

      <div className="card col">
        <h3>Thêm thẻ</h3>
        <div className="grid grid-2">
          <textarea value={front} onChange={(e) => setFront(e.target.value)} placeholder="Mặt trước – câu hỏi / khái niệm" />
          <textarea value={back} onChange={(e) => setBack(e.target.value)} placeholder="Mặt sau – câu trả lời" />
        </div>
        <div className="row between">
          {aiBox}
          <button
            className="btn"
            disabled={!front.trim() || !back.trim()}
            onClick={async () => {
              await post('/cards', { deck: id, front, back });
              setFront('');
              setBack('');
              void cards.reload();
            }}
          >
            + Thêm thẻ
          </button>
        </div>
      </div>
      {draftEditor}
      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {list.length === 0 ? (
          <Empty>Bộ thẻ còn trống.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Mặt trước</th>
                <th>Mặt sau</th>
                <th>Ôn lần tới</th>
                <th>Khoảng cách</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) =>
                editing === c.id ? (
                  <EditRow key={c.id} card={c} onDone={() => { setEditing(null); void cards.reload(); }} />
                ) : (
                  <tr key={c.id} style={{ opacity: c.suspended ? 0.5 : 1 }}>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{c.front}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }} className="small">{c.back}</td>
                    <td className="small">{c.srs.lastReviewedAt ? fmtDate(c.srs.due) : <span className="badge">Mới</span>}</td>
                    <td className="small">{c.srs.interval ? `${c.srs.interval} ngày` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" title="Sửa" onClick={() => setEditing(c.id)}>✎</button>
                      <button
                        className="icon-btn"
                        title={c.suspended ? 'Bật lại' : 'Tạm ẩn'}
                        onClick={async () => {
                          await patch(`/cards/${c.id}`, { suspended: !c.suspended });
                          void cards.reload();
                        }}
                      >
                        <Icon name={c.suspended ? 'play' : 'pause'} size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Xoá"
                        onClick={async () => {
                          await del(`/cards/${c.id}`);
                          void cards.reload();
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EditRow({ card, onDone }: { card: Card; onDone: () => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  return (
    <tr>
      <td>
        <textarea value={front} onChange={(e) => setFront(e.target.value)} />
      </td>
      <td>
        <textarea value={back} onChange={(e) => setBack(e.target.value)} />
      </td>
      <td colSpan={3}>
        <button
          className="btn sm"
          onClick={async () => {
            await patch(`/cards/${card.id}`, { front, back });
            onDone();
          }}
        >
          Lưu
        </button>{' '}
        <button className="btn sm ghost" onClick={onDone}>
          Huỷ
        </button>
      </td>
    </tr>
  );
}

export default function DeckPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <DeckInner />
    </Suspense>
  );
}
