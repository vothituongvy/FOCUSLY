'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { del, errorMessage, post, put } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Modal, Progress, Spinner } from '@/components/ui';
import { ExamForm, type ExamBase } from '@/components/ExamForm';
import { Icon } from '@/components/Icon';

interface PlanDay {
  date: string;
  minutes: number;
  items: { kind: 'topic' | 'review' | 'cards' | 'mock'; title: string; minutes: number; topicId?: string }[];
}
interface Exam extends ExamBase {
  subjectName: string | null;
  plan: {
    daysLeft: number;
    days: PlanDay[];
    perDay: number;
    overloaded: boolean;
    progress: number;
    leftMinutes: number;
    today: string;
    studiedMinutes: number;
    todayMinutes: number;
    todayLeft: number;
    forgettingCards: number;
  };
}

const KIND_ICON = { topic: '📘', review: '🔁', cards: '🃏', mock: '📝' } as const;

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const res = useResource<{ item: Exam }>(`/exams/${id}`, ['sessions', 'cards']);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const e = res.data?.item;
  if (!e) return res.error ? <p className="error-text">{res.error}</p> : <Spinner />;
  const p = e.plan;

  const toggleTopic = async (tid: string, done: boolean) => {
    const topics = e.topics.map((t) => ((t._id ?? t.id) === tid ? { ...t, done } : t));
    res.setData({ item: { ...e, topics } });
    await put(`/exams/${id}`, { topics });
    void res.reload();
  };
  const schedule = async () => {
    setError('');
    setMsg('');
    try {
      const r = await post<{ created: number; days: number }>(`/exams/${id}/schedule`);
      setMsg(tr('Đã đưa {0} ngày ôn vào Kế hoạch (có nhắc giờ). Chạy lại sẽ cập nhật, không tạo trùng.', r.days));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <Link href="/exams" className="small">
            ← {tr('Ôn thi')}
          </Link>
          <h1>{e.title}</h1>
          <p className="muted">
            {tr('Thi ngày {0}', new Date(`${e.date}T12:00:00`).toLocaleDateString())}
            {e.subjectName && ` · ${e.subjectName}`}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn marker" onClick={schedule} disabled={p.daysLeft < 0}>
            <Icon name="calendar" size={16} /> {tr('Đưa 7 ngày tới vào lịch')}
          </button>
          <button className="btn secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={16} /> {tr('Sửa')}
          </button>
          <button className="btn ghost" onClick={() => confirm(tr('Xoá kỳ thi này?')) && del(`/exams/${id}`).then(() => router.push('/exams'))}>
            {tr('Xoá')}
          </button>
        </div>
      </div>
      {msg && <p className="success-text">{msg}</p>}
      {error && <p className="error-text">{error}</p>}

      <section className="metrics">
        <div>
          <div className="stat-label">{tr('Còn lại')}</div>
          <div className="stat-value">{p.daysLeft < 0 ? '—' : tr('{0} ngày', p.daysLeft)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Tiến độ chủ đề')}</div>
          <div className="stat-value">{Math.round(p.progress * 100)}%</div>
          <Progress value={p.progress} />
        </div>
        <div>
          <div className="stat-label">{tr('Đã học môn này')}</div>
          <div className="stat-value">{tr('{0} phút', p.studiedMinutes)}</div>
          <div className="small muted">{e.subject ? tr('tính từ lúc lập kế hoạch') : tr('chọn môn học để tự tính')}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Hôm nay')}</div>
          <div className="stat-value">{p.todayLeft > 0 ? tr('còn {0} phút', p.todayLeft) : tr('đủ rồi ✓')}</div>
          <div className="small muted">{tr('đã học {0} phút', p.todayMinutes)}</div>
        </div>
      </section>
      {p.overloaded && (
        <div className="banner warn">{tr('Khối lượng còn lại cần khoảng {0} phút/ngày, vượt giới hạn {1} phút. Hãy tăng giới hạn, bớt chủ đề hoặc ưu tiên phần quan trọng.', p.perDay, e.dailyCapMinutes)}</div>
      )}

      <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
        <section className="card col">
          <h3>{tr('Lịch ôn từng ngày')}</h3>
          {p.days.length === 0 ? (
            <p className="muted">{p.daysLeft < 0 ? tr('Kỳ thi đã qua. Chúc bạn đạt kết quả tốt!') : tr('Thêm chủ đề để có lịch ôn.')}</p>
          ) : (
            <ol className="exam-days-list">
              {p.days.map((d) => (
                <li key={d.date} className={d.date === p.today ? 'today' : ''}>
                  <div className="exam-day-head">
                    <b>{d.date === p.today ? tr('Hôm nay') : new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'numeric' })}</b>
                    <span className="small muted tabular">{tr('{0} phút', d.minutes)}</span>
                  </div>
                  <ul>
                    {d.items.map((it, i) => (
                      <li key={i}>
                        <span aria-hidden>{KIND_ICON[it.kind]}</span> {it.kind === 'cards' ? <Link href="/learn/review">{tr(it.title)}</Link> : it.title}
                        <span className="small muted"> · {tr('{0} phút', it.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card col">
          <h3>{tr('Chủ đề')}</h3>
          <p className="small muted">{tr('Đánh dấu chủ đề đã nắm chắc – lịch ôn sẽ tự chia lại.')}</p>
          {e.topics.map((t) => {
            const tid = (t._id ?? t.id)!;
            return (
              <label key={tid} className="row topic-check">
                <input type="checkbox" checked={t.done} onChange={(ev) => void toggleTopic(tid, ev.target.checked)} />
                <span className={`grow ${t.done ? 'muted' : ''}`} style={{ textDecoration: t.done ? 'line-through' : undefined }}>
                  {t.title}
                </span>
                <span className="small muted">{t.minutes}′</span>
              </label>
            );
          })}
          <Link href="/focus" className="btn block">
            <Icon name="play" size={14} /> {tr('Bắt đầu ôn ngay')}
          </Link>
        </section>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={tr('Sửa kỳ thi')} width={720}>
        <ExamForm
          exam={e}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void res.reload();
          }}
        />
      </Modal>
    </div>
  );
}
