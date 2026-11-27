'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { api, errorMessage, get, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import type { Material } from '@/lib/types';
import { Empty, Modal, Progress, Spinner } from '@/components/ui';
import { Icon, type IconName } from '@/components/Icon';
import { tr } from '@/lib/i18n';

const TYPE_ICON: Record<string, IconName> = { pdf: 'materials', image: 'materials', text: 'journal', link: 'link', document: 'materials' };
const TYPE_LABEL: Record<string, string> = { pdf: 'PDF', image: tr('Ảnh'), text: tr('Văn bản'), link: 'Link', document: tr('Tài liệu') };
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 0 ? `${Math.ceil(b / 1024)} KB` : '');

export default function MaterialsPage() {
  const subjects = useLearning((s) => s.subjects);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [bookmarked, setBookmarked] = useState(false);
  const [search, setSearch] = useState('');
  const [deep, setDeep] = useState<Material[] | null>(null);
  const [modal, setModal] = useState<'upload' | 'link' | 'text' | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: '200' });
    if (subject) p.set('subject', subject);
    if (category) p.set('category', category);
    if (type) p.set('type', type);
    if (bookmarked) p.set('bookmarked', 'true');
    if (search) p.set('search', search);
    return p.toString();
  }, [subject, category, type, bookmarked, search]);
  const list = useResource<{ items: Material[] }>(`/materials?${query}`, ['materials']);
  const recent = useResource<{ items: Material[] }>('/materials?sort=recent&limit=6', ['materials']);
  const cats = useResource<{ items: string[] }>('/materials/categories', ['materials']);

  const deepSearch = async () => {
    if (!search.trim()) return setDeep(null);
    const r = await get<{ items: Material[] }>(`/materials/search?q=${encodeURIComponent(search)}`);
    setDeep(r.items);
  };

  const items = deep ?? list.data?.items ?? [];

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Tài liệu học tập')}</h1>
          <p className="muted">{tr('Lưu trữ, đọc, ghi chú, đánh dấu và theo dõi tiến độ đọc.')}</p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setModal('link')}>
            + Link
          </button>
          <button className="btn secondary" onClick={() => setModal('text')}>
            {tr('+ Ghi chú văn bản')}
          </button>
          <button className="btn" onClick={() => setModal('upload')}>
            <Icon name="upload" size={16} />{' '}{tr('Tải tài liệu')}
          </button>
        </div>
      </div>

      {recent.data && recent.data.items.some((m) => m.lastOpenedAt) && (
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>{tr('Xem gần đây')}</h3>
          <div className="row wrap">
            {recent.data.items
              .filter((m) => m.lastOpenedAt)
              .map((m) => (
                <Link key={m.id} href={`/materials/${m.id}`} className="chip" style={{ textDecoration: 'none', color: 'inherit' }}>
                  {m.title} {m.progress.percent > 0 && <span className="muted">({m.progress.percent}%)</span>}
                </Link>
              ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <input
            placeholder={tr('Tìm theo tên, mô tả, thẻ...')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDeep(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && void deepSearch()}
            style={{ maxWidth: 280 }}
          />
          <button className="btn secondary sm" onClick={deepSearch} title={tr('Tìm cả trong nội dung PDF/văn bản')}>
            <Icon name="search" size={16} />{' '}{tr('Tìm trong nội dung')}
          </button>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} className="filter">
            <option value="">{tr('Mọi môn học')}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="filter">
            <option value="">{tr('Mọi phân loại')}</option>
            {cats.data?.items.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="filter">
            <option value="">{tr('Mọi định dạng')}</option>
            <option value="pdf">PDF</option>
            <option value="image">{tr('Hình ảnh')}</option>
            <option value="text">{tr('Văn bản')}</option>
            <option value="link">Link</option>
          </select>
          <button className={`chip ${bookmarked ? 'active' : ''}`} onClick={() => setBookmarked(!bookmarked)}>
            {tr('★ Đã đánh dấu')}
          </button>
        </div>

        {list.loading && !list.data ? (
          <Spinner />
        ) : items.length === 0 ? (
          <Empty>{tr('Chưa có tài liệu. Tải PDF, ảnh hoặc thêm link để bắt đầu.')}</Empty>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
            {items.map((m) => {
              const subj = subjects.find((s) => s.id === m.subject);
              return (
                <div key={m.id} className="card col" style={{ gap: 6, boxShadow: 'none' }}>
                  <div className="row between">
                    <span className="badge"><Icon name={TYPE_ICON[m.type]} size={13} /> {TYPE_LABEL[m.type]}</span>
                    <button
                      className="icon-btn"
                      title={tr('Đánh dấu')}
                      style={{ color: m.bookmarked ? '#f59e0b' : undefined }}
                      onClick={async () => {
                        await patch(`/materials/${m.id}`, { bookmarked: !m.bookmarked });
                        void list.reload();
                      }}
                    >
                      {m.bookmarked ? '★' : '☆'}
                    </button>
                  </div>
                  <Link href={`/materials/${m.id}`} style={{ fontWeight: 600, color: 'var(--text)' }} className="truncate">
                    {m.title}
                  </Link>
                  <div className="small muted">
                    {m.category}
                    {subj ? ` · ${subj.icon} ${subj.name}` : ''}
                    {m.sizeBytes ? ` · ${fmtSize(m.sizeBytes)}` : ''}
                  </div>
                  {m.snippet && <div className="small muted" style={{ fontStyle: 'italic' }}>{m.snippet}</div>}
                  {m.progress.totalPages > 0 || m.progress.percent > 0 ? (
                    <>
                      <Progress value={m.progress.percent / 100} />
                      <span className="small muted">
                        {tr('Đã đọc {0}%', m.progress.percent)}{m.progress.totalPages ? ` · trang ${m.progress.page}/${m.progress.totalPages}` : ''}
                      </span>
                    </>
                  ) : null}
                  <div className="row small muted">
                    {m.hasText && <span className="badge">{tr('AI đọc được')}</span>}
                    {m.lastOpenedAt && <span>{tr('Mở {0}', fmtRelative(m.lastOpenedAt))}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && <AddMaterialModal kind={modal} onClose={() => setModal(null)} onDone={() => void list.reload()} />}
    </div>
  );
}

function AddMaterialModal({ kind, onClose, onDone }: { kind: 'upload' | 'link' | 'text'; onClose: () => void; onDone: () => void }) {
  const subjects = useLearning((s) => s.subjects);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (kind === 'upload') {
        if (!file) throw new Error(tr('Chọn file'));
        const fd = new FormData();
        fd.append('file', file);
        if (title) fd.append('title', title);
        if (subject) fd.append('subject', subject);
        if (category) fd.append('category', category);
        await api('/materials/upload', { method: 'POST', body: fd });
      } else {
        await post('/materials', {
          title,
          subject: subject || null,
          category: category || undefined,
          type: kind === 'link' ? 'link' : 'text',
          ...(kind === 'link' ? { url } : { textContent: text }),
        });
      }
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={kind === 'upload' ? tr('Tải tài liệu lên') : kind === 'link' ? tr('Thêm link tài liệu') : tr('Thêm ghi chú văn bản')}>
      <form className="form" onSubmit={submit}>
        {kind === 'upload' && (
          <div
            className="card"
            style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', boxShadow: 'none' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) setFile(f);
            }}
          >
            {file ? (
              <b>
                {file.name} · {fmtSize(file.size)}
              </b>
            ) : (
              <span className="muted">{tr('Kéo thả hoặc bấm để chọn PDF, ảnh, TXT/MD (≤ 20MB)')}</span>
            )}
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
          </div>
        )}
        <label className="field">
          {tr('Tiêu đề')}{' '}{kind === 'upload' && <span className="muted small">{tr('(mặc định theo tên file)')}</span>}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required={kind !== 'upload'} />
        </label>
        {kind === 'link' && (
          <label className="field">
            URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tr('https://vi.wikipedia.org/wiki/Quang_hợp')} required />
          </label>
        )}
        {kind === 'text' && (
          <label className="field">
            {tr('Nội dung')}
            <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 180 }} required />
          </label>
        )}
        <div className="grid grid-2">
          <label className="field">
            {tr('Môn học')}
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">{tr('— Không —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Phân loại')}
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={tr('Giáo trình, Bài giảng, Đề thi...')} />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" disabled={busy}>
          {busy ? tr('Đang xử lý...') : tr('Lưu tài liệu')}
        </button>
      </form>
    </Modal>
  );
}
