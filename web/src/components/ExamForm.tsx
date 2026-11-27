'use client';

import { useEffect, useState } from 'react';
import { errorMessage, post, put } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import type { LearnOverview, Material } from '@/lib/types';
import { Icon } from '@/components/Icon';

export interface ExamTopic {
  _id?: string;
  id?: string;
  title: string;
  minutes: number;
  done: boolean;
}
export interface ExamBase {
  id: string;
  title: string;
  subject: string | null;
  deck: string | null;
  date: string;
  dailyCapMinutes: number;
  topics: ExamTopic[];
}

/** Tạo / sửa kỳ thi: ngày thi, môn, bộ thẻ liên quan, danh sách chủ đề (gợi ý bằng AI) */
export function ExamForm({ exam, onSaved, onCancel }: { exam?: ExamBase; onSaved: (id: string) => void; onCancel: () => void }) {
  const { subjects, loaded, load } = useLearning();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const decks = useResource<LearnOverview>('/learn/overview').data?.decks ?? [];
  const materials = (useResource<{ items: Material[] }>('/materials?limit=200').data?.items ?? []).filter((m) => m.hasText);
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? inTwoWeeks);
  const [subject, setSubject] = useState(exam?.subject ?? '');
  const [deck, setDeck] = useState(exam?.deck ?? '');
  const [cap, setCap] = useState(exam?.dailyCapMinutes ?? 90);
  const [topics, setTopics] = useState<ExamTopic[]>(exam?.topics ?? []);
  const [materialId, setMaterialId] = useState('');
  const [busy, setBusy] = useState<'' | 'ai' | 'save'>('');
  const [error, setError] = useState('');
  const [newTopic, setNewTopic] = useState('');

  const suggest = async () => {
    if (!title.trim()) return setError(tr('Nhập tên kỳ thi trước để AI gợi ý chủ đề.'));
    setBusy('ai');
    setError('');
    try {
      const r = await post<{ topics: { title: string; minutes: number }[] }>('/exams/suggest-topics', { title, subject: subject || undefined, materialId: materialId || undefined });
      setTopics((cur) => [...cur, ...r.topics.filter((t) => !cur.some((c) => c.title === t.title)).map((t) => ({ ...t, done: false }))]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!title.trim()) return setError(tr('Nhập tên kỳ thi'));
    setBusy('save');
    setError('');
    const body = { title: title.trim(), date, subject: subject || null, deck: deck || null, dailyCapMinutes: cap, topics };
    try {
      const r = exam ? await put<{ item: { id: string } }>(`/exams/${exam.id}`, body) : await post<{ item: { id: string } }>('/exams', body);
      onSaved(r.item.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy('');
    }
  };

  const total = topics.reduce((a, t) => a + t.minutes, 0);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <label className="field">
          {tr('Tên kỳ thi')}
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('VD: Thi giữa kỳ Vật lý')} autoFocus />
        </label>
        <label className="field">
          {tr('Ngày thi')}
          <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          {tr('Môn học (để tính phút đã học)')}
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">{tr('— Không chọn —')}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {tr('Bộ flashcard liên quan')}
          <select value={deck} onChange={(e) => setDeck(e.target.value)}>
            <option value="">{tr('— Không chọn —')}</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {tr('Tối đa mỗi ngày (phút)')}
          <input type="number" min={15} max={600} step={5} value={cap} onChange={(e) => setCap(Number(e.target.value))} />
        </label>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="row between wrap">
          <b>
            {tr('Chủ đề cần ôn')} <span className="muted small">({tr('{0} chủ đề · {1} phút', topics.length, total)})</span>
          </b>
          <div className="row wrap">
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="filter" title={tr('Gợi ý từ nội dung tài liệu')}>
              <option value="">{tr('Gợi ý theo tên kỳ thi')}</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {tr('Từ: {0}', m.title)}
                </option>
              ))}
            </select>
            <button className="btn secondary sm" onClick={suggest} disabled={busy !== ''}>
              <Icon name="ai" size={14} /> {busy === 'ai' ? tr('Đang gợi ý…') : tr('AI gợi ý chủ đề')}
            </button>
          </div>
        </div>
        {topics.map((t, i) => (
          <div key={t._id ?? t.id ?? i} className="row">
            <input value={t.title} onChange={(e) => setTopics((cur) => cur.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
            <input type="number" min={10} max={600} step={5} value={t.minutes} onChange={(e) => setTopics((cur) => cur.map((x, k) => (k === i ? { ...x, minutes: Number(e.target.value) } : x)))} style={{ width: 90 }} aria-label={tr('Số phút')} />
            <span className="small muted">{tr('phút')}</span>
            <button className="icon-btn" onClick={() => setTopics((cur) => cur.filter((_, k) => k !== i))} aria-label={tr('Xoá')}>
              ✕
            </button>
          </div>
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const lines = newTopic.split('\n').map((s) => s.trim()).filter(Boolean);
            if (lines.length) setTopics((cur) => [...cur, ...lines.map((l) => ({ title: l, minutes: 45, done: false }))]);
            setNewTopic('');
          }}
        >
          <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder={tr('Thêm chủ đề (VD: Chương 3 – Dao động điều hoà)')} />
          <button className="btn secondary" disabled={!newTopic.trim()}>
            {tr('Thêm')}
          </button>
        </form>
      </div>

      {error && <p className="error-text">{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>
          {tr('Huỷ')}
        </button>
        <button className="btn" onClick={save} disabled={busy !== ''}>
          {exam ? tr('Lưu thay đổi') : tr('Lập kế hoạch')}
        </button>
      </div>
    </div>
  );
}
