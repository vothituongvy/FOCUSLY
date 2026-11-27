'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { del, errorMessage, get, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import type { Material, MaterialNote } from '@/lib/types';
import { Markdown } from '@/components/Markdown';
import { Empty, Modal, Progress, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

type Tab = 'notes' | 'ai';

export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const subjects = useLearning((s) => s.subjects);
  const m = useResource<{ item: Material }>(`/materials/${id}`, ['materials']);
  const notes = useResource<{ items: MaterialNote[] }>(`/material-notes?material=${id}`, ['materialNotes']);
  const [text, setText] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('notes');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState('');
  const [editing, setEditing] = useState(false);
  const material = m.data?.item;
  // Word / Excel / PowerPoint: xem "Bản gốc" (giữ hình ảnh, bảng, định dạng) hoặc "Chế độ đọc" (chữ thuần, highlight được)
  const office = Boolean(material && isOfficeFile(material.mimeType, material.originalName) && /^https:\/\//.test(material.url));
  const [view, setView] = useState<'original' | 'reader'>('original');

  useEffect(() => {
    void post(`/materials/${id}/open`).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!material) return;
    setPage(Math.max(1, material.progress.page || 1));
    if (material.hasText && (material.type === 'text' || material.type === 'document')) {
      void get<{ text: string }>(`/materials/${id}/text?limit=100000`).then((r) => setText(r.text));
    }
  }, [material?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (m.loading && !material) return <Spinner />;
  if (!material) return <p className="error-text">{m.error ?? tr('Không tìm thấy tài liệu')}</p>;

  const saveProgress = async (p: number, total = material.progress.totalPages) => {
    const percent = total > 0 ? Math.min(100, Math.round((p / total) * 100)) : material.progress.percent;
    await patch(`/materials/${id}`, { progress: { page: p, totalPages: total, percent } });
    void m.reload();
  };

  const addHighlight = async (quote: string, content = '') => {
    await post('/material-notes', { material: id, kind: 'highlight', quote, content, page: material.type === 'pdf' ? page : null });
    setSelection('');
    void notes.reload();
  };

  const subject = subjects.find((s) => s.id === material.subject);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="page-header">
        <div>
          <Link href="/materials" className="small">
            {tr('‹ Tài liệu')}
          </Link>
          <h1 style={{ marginTop: 4 }}>
            {material.title}{' '}
            <button
              className="icon-btn"
              style={{ color: material.bookmarked ? '#f59e0b' : undefined, fontSize: 20 }}
              onClick={async () => {
                await patch(`/materials/${id}`, { bookmarked: !material.bookmarked });
                void m.reload();
              }}
            >
              {material.bookmarked ? '★' : '☆'}
            </button>
          </h1>
          <p className="muted small">
            {material.category}
            {subject ? ` · ${subject.icon} ${subject.name}` : ''}{' '}{tr('· thêm {0}', fmtDate(material.createdAt))}
          </p>
        </div>
        <div className="row">
          <button className="btn secondary sm" onClick={() => setEditing(true)}>
            {tr('Sửa')}
          </button>
          {material.url && (
            <a className="btn secondary sm" href={material.url} target="_blank" rel="noreferrer">
              {tr('Mở tab mới')} 
            </a>
          )}
          <button
            className="btn ghost sm"
            style={{ color: 'var(--danger)' }}
            onClick={async () => {
              if (!confirm(tr('Xoá tài liệu này cùng ghi chú?'))) return;
              await del(`/materials/${id}`);
              router.push('/materials');
            }}
          >
            {tr('Xoá')}
          </button>
        </div>
      </div>

      <div className="grid split-aside">
        {/* ---------- Viewer ---------- */}
        <div className="col">
          {material.type === 'pdf' && (
            <>
              <iframe key={page} className="viewer" src={`${material.url}#page=${page}&toolbar=1`} title={material.title} />
              <div className="row wrap card" style={{ padding: 10 }}>
                <span className="small">Trang</span>
                <button className="btn secondary sm" onClick={() => setPage(Math.max(1, page - 1))}>
                  ‹
                </button>
                <input type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} style={{ width: 80 }} />
                <button className="btn secondary sm" onClick={() => setPage(page + 1)}>
                  ›
                </button>
                <span className="small muted">/ {material.progress.totalPages || '?'}</span>
                <button className="btn sm" onClick={() => saveProgress(page)}>
                  {tr('Lưu tiến độ đọc')}
                </button>
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    await post('/material-notes', { material: id, kind: 'bookmark', page, content: `Trang ${page}` });
                    void notes.reload();
                  }}
                >
                  <Icon name="bookmark" size={16} />{' '}{tr('Đánh dấu trang')}
                </button>
                <div className="grow" style={{ minWidth: 120 }}>
                  <Progress value={material.progress.percent / 100} />
                </div>
                <span className="small">{material.progress.percent}%</span>
              </div>
            </>
          )}
          {material.type === 'image' && <img src={material.url} alt={material.title} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--border)' }} />}
          {office && (
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button className={`tab ${view === 'original' ? 'active' : ''}`} onClick={() => setView('original')}>
                {tr('Bản gốc')}
              </button>
              <button className={`tab ${view === 'reader' ? 'active' : ''}`} onClick={() => setView('reader')}>
                {tr('Chế độ đọc & ghi chú')}
              </button>
            </div>
          )}
          {office && view === 'original' && (
            <>
              <iframe className="viewer" src={officeViewerUrl(material.url)} title={material.title} />
              <p className="small muted">
                {tr('Hiển thị bằng trình xem Microsoft Office. Muốn highlight hoặc ghi chú, chuyển sang “Chế độ đọc & ghi chú”.')}{' '}
                <a href={material.url}>{tr('Tải file gốc')}</a>
              </p>
            </>
          )}
          {(material.type === 'text' || material.type === 'document') && !(office && view === 'original') && (
            <>
              {text === null ? (
                material.hasText ? <Spinner /> : <Empty>{tr('Không đọc được nội dung văn bản.')}{' '}<a href={material.url}>{tr('Tải file')}</a></Empty>
              ) : (
                <TextReader
                  text={text}
                  highlights={(notes.data?.items ?? []).filter((n) => n.kind === 'highlight').map((n) => n.quote)}
                  initialPercent={material.progress.percent}
                  onSelect={setSelection}
                  onProgress={(percent) => patch(`/materials/${id}`, { progress: { percent } }).catch(() => undefined)}
                />
              )}
              {selection && (
                <div className="banner info">
                  “{selection.slice(0, 80)}
                  {selection.length > 80 ? '…' : ''}”
                  <button className="btn sm" onClick={() => addHighlight(selection)}>
                    <Icon name="edit" size={16} /> Highlight
                  </button>
                  <button
                    className="btn sm secondary"
                    onClick={() => {
                      setTab('ai');
                      window.dispatchEvent(new CustomEvent('focusly:explain', { detail: selection }));
                    }}
                  >
                    <Icon name="ai" size={16} />{' '}{tr('Giải thích')}
                  </button>
                </div>
              )}
            </>
          )}
          {material.type === 'link' && (
            <div className="card col">
              <p>{tr('Tài liệu là một liên kết ngoài:')}</p>
              <a href={material.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>
                {material.url}
              </a>
              <label className="field">
                {tr('Tiến độ (%)')}
                <input type="range" min={0} max={100} defaultValue={material.progress.percent} onMouseUp={(e) => patch(`/materials/${id}`, { progress: { percent: Number((e.target as HTMLInputElement).value) } }).then(() => m.reload())} />
              </label>
            </div>
          )}
          {material.description && <p className="muted">{material.description}</p>}
        </div>

        {/* ---------- Side panel ---------- */}
        <div className="card" style={{ position: 'sticky', top: 16, maxHeight: '88vh', overflow: 'auto' }}>
          <div className="tabs">
            <button className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>
              {tr('Ghi chú ({0})', notes.data?.items.length ?? 0)}
            </button>
            <button className={`tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
              <Icon name="ai" size={16} /> AI
            </button>
          </div>
          {tab === 'notes' ? (
            <NotesPanel materialId={id} page={material.type === 'pdf' ? page : null} notes={notes.data?.items ?? []} reload={notes.reload} onJump={(p) => setPage(p)} />
          ) : (
            <AIPanel material={material} reload={m.reload} />
          )}
        </div>
      </div>

      {editing && <EditMaterial material={material} onClose={() => setEditing(false)} onSaved={m.reload} />}
    </div>
  );
}

/* ---------- Trình đọc văn bản: highlight + lưu tiến độ theo vị trí cuộn ---------- */
function TextReader({
  text,
  highlights,
  initialPercent,
  onSelect,
  onProgress,
}: {
  text: string;
  highlights: string[];
  initialPercent: number;
  onSelect: (s: string) => void;
  onProgress: (percent: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || restored.current) return;
    restored.current = true;
    el.scrollTop = ((el.scrollHeight - el.clientHeight) * initialPercent) / 100;
  }, [initialPercent]);

  const parts = useMemo(() => {
    const list = highlights.filter((h) => h && h.length >= 3);
    if (!list.length) return [text];
    const escaped = list.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'g');
    return text.split(re).map((p, i) => (list.includes(p) ? <mark key={i}>{p}</mark> : p)) as ReactNode[];
  }, [text, highlights]);

  return (
    <div
      ref={ref}
      className="text-reader"
      onMouseUp={() => onSelect(window.getSelection()?.toString().trim() ?? '')}
      onScroll={(e) => {
        const el = e.currentTarget;
        const percent = Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onProgress(percent), 1200);
      }}
    >
      {parts}
    </div>
  );
}

function NotesPanel({
  materialId,
  page,
  notes,
  reload,
  onJump,
}: {
  materialId: string;
  page: number | null;
  notes: MaterialNote[];
  reload: () => void;
  onJump: (p: number) => void;
}) {
  const [content, setContent] = useState('');
  const [quote, setQuote] = useState('');
  const add = async () => {
    if (!content.trim() && !quote.trim()) return;
    await post('/material-notes', { material: materialId, kind: quote ? 'highlight' : 'note', content, quote, page });
    setContent('');
    setQuote('');
    reload();
  };
  const icon = { note: '', highlight: '', bookmark: '' };
  return (
    <div className="col">
      <textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder={tr('Đoạn trích quan trọng (tuỳ chọn)')} style={{ minHeight: 50 }} />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={page ? tr('Ghi chú cho trang {0}...', page) : tr('Ghi chú cá nhân...')} />
      <button className="btn sm" onClick={add}>
        {tr('+ Thêm ghi chú')}
      </button>
      <div className="list">
        {notes.length === 0 && <Empty>{tr('Chưa có ghi chú.')}</Empty>}
        {notes.map((n) => (
          <div key={n.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <span>{icon[n.kind]}</span>
            <div className="grow">
              {n.page != null && (
                <button className="badge" style={{ border: 'none', cursor: 'pointer' }} onClick={() => onJump(n.page!)}>
                  Trang {n.page}
                </button>
              )}
              {n.quote && <div style={{ background: '#fef9c3', padding: '2px 6px', borderRadius: 4, marginTop: 4 }}>“{n.quote}”</div>}
              {n.content && <div className="small">{n.content}</div>}
            </div>
            <button
              className="icon-btn"
              onClick={async () => {
                await del(`/material-notes/${n.id}`);
                reload();
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIPanel({ material, reload }: { material: Material; reload: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');

  useEffect(() => {
    const fn = (e: Event) => {
      const c = (e as CustomEvent<string>).detail;
      setConcept(c);
      void explain(c);
    };
    window.addEventListener('focusly:explain', fn);
    return () => window.removeEventListener('focusly:explain', fn);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async <T,>(key: string, fn: () => Promise<T>) => {
    setBusy(key);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const explain = (c = concept) =>
    run('explain', async () => {
      const r = await post<{ explanation: string }>('/ai/explain', { concept: c, materialId: material.id });
      setExplanation(r.explanation);
    });

  if (!material.hasText) {
    return <p className="small muted">{tr('AI cần nội dung văn bản. Tài liệu ảnh/link/PDF dạng scan chưa trích được chữ – bạn có thể thêm “Ghi chú văn bản” rồi dùng AI.')}</p>;
  }

  return (
    <div className="col">
      <div className="row wrap">
        <button className="btn sm" disabled={!!busy} onClick={() => run('sum', () => post('/ai/summarize', { materialId: material.id }).then(reload))}>
          {busy === 'sum' ? tr('Đang tóm tắt...') : tr('Tóm tắt')}
        </button>
        <button
          className="btn sm secondary"
          disabled={!!busy}
          onClick={() =>
            run('quiz', async () => {
              const r = await post<{ draft: object }>('/ai/generate/quiz', { materialId: material.id, count: 10 });
              sessionStorage.setItem('focusly.quizDraft', JSON.stringify(r.draft));
              router.push('/learn/quiz/new?draft=1');
            })
          }
        >
          {busy === 'quiz' ? tr('Đang tạo...') : tr('Tạo 10 câu hỏi')}
        </button>
        <button
          className="btn sm secondary"
          disabled={!!busy}
          onClick={() =>
            run('cards', async () => {
              const r = await post<{ draft: object }>('/ai/generate/flashcards', { materialId: material.id, count: 15 });
              sessionStorage.setItem('focusly.cardsDraft', JSON.stringify(r.draft));
              router.push('/learn/decks/new?draft=1');
            })
          }
        >
          {busy === 'cards' ? tr('Đang tạo...') : tr('🃏 Tạo flashcard')}
        </button>
        <Link className="btn sm secondary" href={`/ai?material=${material.id}`}>
          <Icon name="ai" size={16} />{' '}{tr('Hỏi đáp')}
        </Link>
      </div>
      {error && <p className="error-text">{error}</p>}
      {material.aiSummary && (
        <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
          <b className="small">{tr('Tóm tắt AI')}</b>
          <Markdown text={material.aiSummary} />
        </div>
      )}
      <div className="field">
        {tr('Giải thích khái niệm khó')}
        <div className="row">
          <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="VD: Cleanup function" />
          <button className="btn sm" disabled={!concept || !!busy} onClick={() => explain()}>
            {busy === 'explain' ? '...' : tr('Giải thích')}
          </button>
        </div>
      </div>
      {explanation && (
        <div className="card" style={{ boxShadow: 'none' }}>
          <Markdown text={explanation} />
        </div>
      )}
      <p className="small muted">{tr('AI chỉ đưa gợi ý – bạn có thể sửa hoặc bỏ qua nội dung được tạo.')}</p>
    </div>
  );
}

function EditMaterial({ material, onClose, onSaved }: { material: Material; onClose: () => void; onSaved: () => void }) {
  const subjects = useLearning((s) => s.subjects);
  const [form, setForm] = useState({
    title: material.title,
    description: material.description,
    category: material.category,
    subject: material.subject ?? '',
    tags: material.tags.join(', '),
    totalPages: material.progress.totalPages,
  });
  return (
    <Modal open onClose={onClose} title={tr('Sửa tài liệu')}>
      <div className="form">
        <label className="field">
          {tr('Tiêu đề')}
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label className="field">
          {tr('Mô tả')}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="grid grid-2">
          <label className="field">
            {tr('Phân loại')}
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label className="field">
            {tr('Môn học')}
            <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">{tr('— Không —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Thẻ (phân tách dấu phẩy)')}
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </label>
          {material.type === 'pdf' && (
            <label className="field">
              {tr('Tổng số trang')}
              <input type="number" min={0} value={form.totalPages} onChange={(e) => setForm({ ...form, totalPages: Number(e.target.value) })} />
            </label>
          )}
        </div>
        <button
          className="btn"
          onClick={async () => {
            await patch(`/materials/${material.id}`, {
              title: form.title,
              description: form.description,
              category: form.category,
              subject: form.subject || null,
              tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
              ...(material.type === 'pdf' ? { progress: { totalPages: form.totalPages } } : {}),
            });
            onSaved();
            onClose();
          }}
        >
          {tr('Lưu')}
        </button>
      </div>
    </Modal>
  );
}

/** File Office (Word, Excel, PowerPoint) – xem được bản gốc qua trình xem Office Online */
function isOfficeFile(mime: string, name: string) {
  return /officedocument|msword|ms-excel|ms-powerpoint/.test(mime || '') || /\.(docx?|xlsx?|pptx?)$/i.test(name || '');
}
const officeViewerUrl = (url: string) => `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
