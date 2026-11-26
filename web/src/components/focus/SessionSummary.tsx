'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { fmtDuration } from '@/lib/format';
import type { FocusSession, Quiz } from '@/lib/types';
import { Markdown } from '../Markdown';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

/** PHASE 2 – Bước 7 của quy trình: Active Recall & kiểm tra kiến thức sau phiên */
function KnowledgeCheck({ session }: { session: FocusSession }) {
  const router = useRouter();
  const subjectId = typeof session.subject === 'string' ? session.subject : null;
  const [content, setContent] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [recallId, setRecallId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (subjectId) void get<{ items: Quiz[] }>(`/quizzes?subject=${subjectId}&limit=5`).then((r) => setQuizzes(r.items)).catch(() => undefined);
  }, [subjectId]);

  const saveRecall = async () => {
    setError('');
    try {
      const r = await post<{ item: { id: string } }>('/recalls', { session: session.id, content, selfRating: rating });
      setRecallId(r.item.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const aiFeedback = async () => {
    if (!recallId) return;
    setBusy('feedback');
    setError('');
    try {
      const r = await post<{ feedback: string }>('/ai/recall-feedback', { recallId });
      setFeedback(r.feedback);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const generateQuiz = async () => {
    setBusy('quiz');
    setError('');
    try {
      const r = await post<{ draft: unknown }>('/ai/generate/quiz', { sessionId: session.id, count: 5 });
      sessionStorage.setItem('focusly.quizDraft', JSON.stringify({ ...(r.draft as object), subject: subjectId, task: typeof session.task === 'string' ? session.task : null }));
      router.push('/learn/quiz/new?draft=1');
    } catch (e) {
      setError(errorMessage(e));
      setBusy('');
    }
  };

  return (
    <div className="card col mt-16" style={{ boxShadow: 'none' }}>
      <h3>{tr('Kiểm tra kiến thức')}</h3>
      <p className="small muted">{tr('Active Recall: viết lại những gì bạn vừa học mà không nhìn tài liệu – cách ghi nhớ hiệu quả hơn đọc lại.')}</p>
      {!recallId ? (
        <>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={tr('VD: Hiện tại hoàn thành dùng cho việc bắt đầu trong quá khứ và còn liên quan tới hiện tại...')} style={{ minHeight: 110 }} />
          <div className="row wrap">
            <span className="small muted">{tr('Tự đánh giá mức hiểu:')}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`chip ${rating === n ? 'active' : ''}`} onClick={() => setRating(n)}>
                {n}
              </button>
            ))}
            <button className="btn sm" disabled={!content.trim()} onClick={saveRecall} style={{ marginLeft: 'auto' }}>
              {tr('Lưu ghi nhớ')}
            </button>
          </div>
        </>
      ) : (
        <div className="col">
          <span className="success-text">{tr('✓ Đã lưu phần tự nhớ lại.')}</span>
          {!feedback && (
            <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} disabled={busy === 'feedback'} onClick={aiFeedback}>
              {busy === 'feedback' ? tr('AI đang đọc...') : tr('Nhận phản hồi từ AI')}
            </button>
          )}
          {feedback && (
            <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
              <Markdown text={feedback} />
            </div>
          )}
        </div>
      )}
      <div className="row wrap mt-8">
        <button className="btn" disabled={busy === 'quiz'} onClick={generateQuiz}>
          {busy === 'quiz' ? tr('Đang tạo câu hỏi...') : tr('Tạo 5 câu hỏi kiểm tra (AI)')}
        </button>
        {quizzes.map((q) => (
          <Link key={q.id} href={`/learn/quiz/${q.id}?take=1`} className="btn secondary sm">
            <Icon name="quiz" size={16} /> {q.title}
          </Link>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function SessionSummary({ session, onNew }: { session: FocusSession; onNew: () => void }) {
  const planned = session.plannedMinutes * 60;
  const items = [
    [tr('Thời gian tập trung thực tế'), fmtDuration(session.actualFocusSeconds)],
    [tr('Thời gian dự kiến'), planned ? fmtDuration(planned) : '—'],
    [tr('Thời gian nghỉ'), fmtDuration(session.breakSeconds)],
    [tr('Số lần tạm dừng'), String(session.pauseCount)],
    [tr('Số lần phân tâm ghi nhận'), String(session.distractionCount)],
    [tr('Số lần rời tab/app'), String(session.appLeaveCount)],
    [tr('Pomodoro hoàn thành'), session.mode === 'pomodoro' ? String(session.pomodoro.completedCycles ?? 0) : '—'],
  ];
  const achieved = session.summary.goalAchieved;

  return (
    <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 6, marginBottom: 18 }}>
        <h1>{session.status === 'abandoned' ? tr('Đã huỷ phiên học') : tr('Tổng kết phiên học')}</h1>
        <p className="muted">{session.goal}</p>
        {achieved !== null && <span className={`badge ${achieved ? 'done' : 'high'}`}>{achieved ? tr('Đã đạt mục tiêu') : tr('Chưa đạt mục tiêu')}</span>}
      </div>
      <div className="list">
        {items.map(([k, v]) => (
          <div className="list-item" key={k}>
            <span className="grow muted">{k}</span>
            <b>{v}</b>
          </div>
        ))}
        {session.summary.rating && (
          <div className="list-item">
            <span className="grow muted">{tr('Tự đánh giá')}</span>
            <b>{'★'.repeat(session.summary.rating)}</b>
          </div>
        )}
      </div>
      {session.summary.note && <p className="mt-16">{session.summary.note}</p>}
      {planned > 0 && session.actualFocusSeconds < planned * 0.5 && session.status === 'completed' && (
        <div className="banner warn mt-16">{tr('Phiên này ngắn hơn một nửa dự kiến. Thử chia nhiệm vụ nhỏ hơn hoặc rút ngắn thời lượng phiên.')}</div>
      )}
      {session.status === 'completed' && <KnowledgeCheck session={session} />}
      <div className="row mt-24" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={onNew}>
          <Icon name="play" size={16} />{' '}{tr('Phiên mới')}
        </button>
        <Link className="btn secondary" href="/journal">
          {tr('Xem nhật ký phân tâm')}
        </Link>
        <Link className="btn secondary" href="/dashboard">
          {tr('Về tổng quan')}
        </Link>
      </div>
    </div>
  );
}
