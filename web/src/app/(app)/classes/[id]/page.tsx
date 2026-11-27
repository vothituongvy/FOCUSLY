'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { del, errorMessage, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import type { LearnOverview, Quiz } from '@/lib/types';
import { Avatar, Empty, Modal, Progress, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface Assignment {
  id: string;
  kind: 'deck' | 'quiz';
  title: string;
  note: string;
  dueAt: string | null;
  createdAt: string;
}
interface Prog {
  started: boolean;
  percent: number;
  done: boolean;
  detail: string;
  copyId?: string;
}
interface ClassDetail {
  id: string;
  name: string;
  description: string;
  isTeacher: boolean;
  code?: string;
  teacher: { name: string } | null;
  assignments: (Assignment & { progress?: Prog })[];
  students?: { id: string; name: string; avatarUrl: string | null; weekMinutes: number; progress: Prog[] }[];
  members?: number;
}

const due = (d: string | null) => (d ? new Date(d).toLocaleDateString() : null);

export default function ClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const res = useResource<{ item: ClassDetail }>(`/classes/${id}`, ['decks', 'cards', 'quizAttempts']);
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState('');
  const c = res.data?.item;
  if (!c) return res.error ? <p className="error-text">{res.error}</p> : <Spinner />;

  const start = async (a: Assignment) => {
    setError('');
    try {
      const r = await post<{ kind: string; id: string }>(`/classes/${id}/assignments/${a.id}/start`);
      router.push(r.kind === 'deck' ? `/learn/decks/${r.id}` : `/learn/quiz/${r.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <Link href="/classes" className="small">
            ← {tr('Lớp học')}
          </Link>
          <h1>{c.name}</h1>
          <p className="muted">
            {c.isTeacher ? (
              <>
                {tr('Mã lớp')}: <b className="tabular" style={{ letterSpacing: '.12em' }}>{c.code}</b> · {tr('{0} học sinh', c.students?.length ?? 0)}
              </>
            ) : (
              <>
                {tr('Giáo viên: {0}', c.teacher?.name ?? '—')} · {tr('{0} học sinh', c.members ?? 0)}
              </>
            )}
          </p>
          {c.description && <p className="small">{c.description}</p>}
        </div>
        <div className="row wrap">
          {c.isTeacher && (
            <>
              <button className="btn secondary" onClick={() => c.code && navigator.clipboard?.writeText(c.code)}>
                <Icon name="copy" size={16} /> {tr('Sao chép mã lớp')}
              </button>
              <button className="btn marker" onClick={() => setAssignOpen(true)}>
                <Icon name="plus" size={16} /> {tr('Giao bài')}
              </button>
            </>
          )}
          <button className="btn ghost" onClick={() => confirm(c.isTeacher ? tr('Xoá lớp này?') : tr('Rời lớp này?')) && del(`/classes/${id}`).then(() => router.push('/classes'))}>
            {c.isTeacher ? tr('Xoá lớp') : tr('Rời lớp')}
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      {c.isTeacher ? (
        <section className="card col">
          <h3>{tr('Tiến độ cả lớp')}</h3>
          {!c.students?.length ? (
            <Empty>{tr('Chưa có học sinh. Gửi mã lớp {0} để học sinh vào lớp.', c.code ?? '')}</Empty>
          ) : !c.assignments.length ? (
            <Empty>{tr('Chưa giao bài nào. Bấm “Giao bài” để giao một bộ flashcard hoặc bài kiểm tra của bạn.')}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table class-table">
                <thead>
                  <tr>
                    <th>{tr('Học sinh')}</th>
                    <th>{tr('Phút/tuần')}</th>
                    {c.assignments.map((a) => (
                      <th key={a.id} title={a.title}>
                        <span className="row" style={{ gap: 4 }}>
                          {a.kind === 'deck' ? '🃏' : '📝'} <span className="truncate" style={{ maxWidth: 140 }}>{a.title}</span>
                          <button className="icon-btn" title={tr('Huỷ giao bài')} onClick={() => confirm(tr('Huỷ bài “{0}”?', a.title)) && del(`/classes/${id}/assignments/${a.id}`).then(() => res.reload())}>
                            ✕
                          </button>
                        </span>
                        {a.dueAt && <span className="small muted">{tr('hạn {0}', due(a.dueAt))}</span>}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {c.students.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <Avatar name={s.name} url={s.avatarUrl} /> {s.name}
                        </span>
                      </td>
                      <td className="tabular">{s.weekMinutes}</td>
                      {s.progress.map((p, i) => (
                        <td key={i} title={p.detail}>
                          {!p.started ? (
                            <span className="small muted">{tr('chưa làm')}</span>
                          ) : (
                            <span className="col" style={{ gap: 2, minWidth: 90 }}>
                              <span className="small tabular">{p.percent}%</span>
                              <Progress value={p.percent / 100} />
                            </span>
                          )}
                        </td>
                      ))}
                      <td>
                        <button className="icon-btn" title={tr('Xoá khỏi lớp')} onClick={() => confirm(tr('Xoá {0} khỏi lớp?', s.name)) && del(`/classes/${id}/members/${s.id}`).then(() => res.reload())}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">{tr('Flashcard: % số thẻ học sinh đã học. Bài kiểm tra: điểm cao nhất.')}</p>
        </section>
      ) : (
        <section className="card col">
          <h3>{tr('Bài được giao')}</h3>
          {!c.assignments.length ? (
            <Empty>{tr('Giáo viên chưa giao bài nào.')}</Empty>
          ) : (
            <div className="list">
              {c.assignments.map((a) => (
                <div key={a.id} className="list-item wrap">
                  <span style={{ fontSize: 20 }}>{a.kind === 'deck' ? '🃏' : '📝'}</span>
                  <span className="grow col" style={{ gap: 2, minWidth: 160 }}>
                    <b>{a.title}</b>
                    <span className="small muted">
                      {a.dueAt ? tr('Hạn {0}', due(a.dueAt)) : tr('Không có hạn')}
                      {a.progress?.detail && ` · ${a.progress.detail}`}
                    </span>
                    {a.note && <span className="small">{a.note}</span>}
                  </span>
                  {a.progress?.started && (
                    <span style={{ width: 120 }}>
                      <Progress value={a.progress.percent / 100} />
                    </span>
                  )}
                  <button className={`btn sm ${a.progress?.done ? 'secondary' : ''}`} onClick={() => start(a)}>
                    {a.progress?.started ? (a.kind === 'deck' ? tr('Tiếp tục ôn') : tr('Làm lại')) : tr('Bắt đầu')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {c.isTeacher && <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} classId={id} onDone={() => res.reload()} />}
    </div>
  );
}

function AssignModal({ open, onClose, classId, onDone }: { open: boolean; onClose: () => void; classId: string; onDone: () => void }) {
  const decks = useResource<LearnOverview>(open ? '/learn/overview' : null).data?.decks ?? [];
  const quizzes = useResource<{ items: Quiz[] }>(open ? '/quizzes?limit=200' : null).data?.items ?? [];
  const [kind, setKind] = useState<'deck' | 'quiz'>('deck');
  const [source, setSource] = useState('');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const options = kind === 'deck' ? decks.map((d) => ({ id: d.id, title: d.title })) : quizzes.map((q) => ({ id: q.id, title: q.title }));
  const submit = async () => {
    setError('');
    try {
      await post(`/classes/${classId}/assignments`, { kind, source, note, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null });
      onDone();
      onClose();
      setSource('');
      setNote('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={tr('Giao bài cho lớp')}>
      <div className="col" style={{ gap: 12 }}>
        <div className="chips">
          <button className={`chip ${kind === 'deck' ? 'active' : ''}`} onClick={() => (setKind('deck'), setSource(''))}>
            🃏 {tr('Bộ flashcard')}
          </button>
          <button className={`chip ${kind === 'quiz' ? 'active' : ''}`} onClick={() => (setKind('quiz'), setSource(''))}>
            📝 {tr('Bài kiểm tra')}
          </button>
        </div>
        <label className="field">
          {kind === 'deck' ? tr('Chọn bộ flashcard của bạn') : tr('Chọn bộ câu hỏi của bạn')}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{tr('— Chọn —')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {tr('Hạn nộp (không bắt buộc)')}
          <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label className="field">
          {tr('Lời dặn')}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={tr('VD: Làm trước buổi học thứ Năm')} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" disabled={!source} onClick={submit}>
          {tr('Giao bài & báo cho học sinh')}
        </button>
      </div>
    </Modal>
  );
}
