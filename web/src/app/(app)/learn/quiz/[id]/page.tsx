'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { del, errorMessage, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtClock, fmtDate, fmtDuration } from '@/lib/format';
import type { Question, QuestionType, Quiz, QuizAttempt } from '@/lib/types';
import { Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

const TYPE_LABEL: Record<QuestionType, string> = { mcq: 'Trắc nghiệm', true_false: 'Đúng / Sai', short: 'Trả lời ngắn' };
const blank = (type: QuestionType = 'mcq'): Question => ({
  type,
  prompt: '',
  options: type === 'mcq' ? ['', '', '', ''] : [],
  correctIndex: type === 'mcq' ? 0 : null,
  correctBoolean: type === 'true_false' ? true : null,
  acceptedAnswers: [],
  explanation: '',
});

interface Draft {
  title: string;
  subject?: string | null;
  material?: string | null;
  task?: string | null;
  questions: Question[];
  source?: 'ai' | 'manual';
}

/* ======================= EDITOR ======================= */
function QuizEditor({ initial, onSaved, onCancel }: { initial: Draft; onSaved: (q: Quiz) => void; onCancel?: () => void }) {
  const subjects = useLearning((s) => s.subjects);
  const [d, setD] = useState<Draft>(initial);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const setQ = (i: number, patchQ: Partial<Question>) => setD({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patchQ } : q)) });

  const generate = async () => {
    setBusy('ai');
    setError('');
    try {
      const r = await post<{ draft: Draft }>('/ai/generate/quiz', { topic, count: 8 });
      setD({ ...d, title: d.title || r.draft.title, source: 'ai', questions: [...d.questions, ...r.draft.questions] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    const body = {
      title: d.title || 'Bộ câu hỏi',
      subject: d.subject || null,
      material: d.material || null,
      task: d.task || null,
      source: d.source ?? 'manual',
      questions: d.questions.map((q) => ({
        ...q,
        options: q.type === 'mcq' ? q.options.filter((o) => o.trim()) : [],
        acceptedAnswers: q.type === 'short' ? q.acceptedAnswers.filter((a) => a.trim()) : [],
      })),
    };
    try {
      const r = (initial as Quiz).id ? await patch<{ item: Quiz }>(`/quizzes/${(initial as Quiz).id}`, body) : await post<{ item: Quiz }>('/quizzes', body);
      onSaved(r.item);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      {d.source === 'ai' && <div className="banner info">Câu hỏi do AI tạo là bản nháp – hãy kiểm tra đáp án, sửa hoặc xoá câu chưa phù hợp trước khi lưu.</div>}
      <div className="card form">
        <div className="grid grid-2">
          <label className="field">
            Tên bộ câu hỏi
            <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </label>
          <label className="field">
            Môn học
            <select value={d.subject ?? ''} onChange={(e) => setD({ ...d, subject: e.target.value || null })}>
              <option value="">— Không —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Chủ đề để AI tạo thêm câu hỏi" />
          <button className="btn secondary" disabled={!topic || busy === 'ai'} onClick={generate}>
            {busy === 'ai' ? 'Đang tạo...' : 'AI tạo 8 câu'}
          </button>
        </div>
      </div>

      {d.questions.map((q, i) => (
        <div key={i} className="card col">
          <div className="row between">
            <b>Câu {i + 1}</b>
            <div className="row">
              <select
                value={q.type}
                onChange={(e) => setQ(i, { ...blank(e.target.value as QuestionType), prompt: q.prompt, explanation: q.explanation })}
                style={{ width: 160 }}
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={() => setD({ ...d, questions: d.questions.filter((_, j) => j !== i) })}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
          <textarea value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="Nội dung câu hỏi" style={{ minHeight: 50 }} />
          {q.type === 'mcq' &&
            q.options.map((o, k) => (
              <label key={k} className="row">
                <input type="radio" checked={q.correctIndex === k} onChange={() => setQ(i, { correctIndex: k })} title="Đáp án đúng" />
                <input value={o} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`Lựa chọn ${String.fromCharCode(65 + k)}`} />
              </label>
            ))}
          {q.type === 'true_false' && (
            <div className="chips">
              <button className={`chip ${q.correctBoolean === true ? 'active' : ''}`} onClick={() => setQ(i, { correctBoolean: true })}>
                Đáp án: Đúng
              </button>
              <button className={`chip ${q.correctBoolean === false ? 'active' : ''}`} onClick={() => setQ(i, { correctBoolean: false })}>
                Đáp án: Sai
              </button>
            </div>
          )}
          {q.type === 'short' && (
            <input
              value={q.acceptedAnswers.join(' | ')}
              onChange={(e) => setQ(i, { acceptedAnswers: e.target.value.split('|').map((x) => x.trim()) })}
              placeholder="Các đáp án chấp nhận, phân tách bằng |  (không phân biệt hoa thường/dấu)"
            />
          )}
          <input value={q.explanation ?? ''} onChange={(e) => setQ(i, { explanation: e.target.value })} placeholder="Giải thích (hiện sau khi làm bài)" />
        </div>
      ))}

      <div className="row wrap">
        {(['mcq', 'true_false', 'short'] as QuestionType[]).map((t) => (
          <button key={t} className="btn secondary sm" onClick={() => setD({ ...d, questions: [...d.questions, blank(t)] })}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn lg" disabled={busy === 'save' || !d.questions.length} onClick={save}>
          Lưu bộ câu hỏi ({d.questions.length} câu)
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Huỷ
          </button>
        )}
      </div>
    </div>
  );
}

/* ======================= TAKE QUIZ ======================= */
function QuizTaker({ quiz, onFinished }: { quiz: Quiz; onFinished: (a: QuizAttempt) => void }) {
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const answered = quiz.questions.filter((q) => answers[q.qid!] !== undefined && answers[q.qid!] !== '').length;

  const submit = async () => {
    if (answered < quiz.questions.length && !confirm(`Bạn mới trả lời ${answered}/${quiz.questions.length} câu. Nộp bài?`)) return;
    setBusy(true);
    try {
      const r = await post<{ item: QuizAttempt }>(`/learn/quizzes/${quiz.id}/attempts`, {
        answers: quiz.questions.map((q) => ({ qid: q.qid!, answer: answers[q.qid!] ?? null })),
        durationSeconds: Math.round(elapsed),
        startedAt: new Date(started.current).toISOString(),
      });
      onFinished(r.item);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14, maxWidth: 780 }}>
      <div className="row between card" style={{ position: 'sticky', top: 8, zIndex: 5, padding: 12 }}>
        <span>
          Đã trả lời <b>{answered}</b>/{quiz.questions.length}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(elapsed)}</span>
      </div>
      {quiz.questions.map((q, i) => (
        <div key={q.qid} className="card col">
          <span className="small muted">
            Câu {i + 1} · {TYPE_LABEL[q.type]}
          </span>
          <b style={{ whiteSpace: 'pre-wrap' }}>{q.prompt}</b>
          {q.type === 'mcq' &&
            q.options.map((o, k) => (
              <button key={k} className={`option ${answers[q.qid!] === k ? 'selected' : ''}`} onClick={() => setAnswers({ ...answers, [q.qid!]: k })}>
                <b>{String.fromCharCode(65 + k)}.</b> {o}
              </button>
            ))}
          {q.type === 'true_false' && (
            <div className="grid grid-2">
              {[true, false].map((v) => (
                <button key={String(v)} className={`option ${answers[q.qid!] === v ? 'selected' : ''}`} onClick={() => setAnswers({ ...answers, [q.qid!]: v })}>
                  {v ? 'Đúng' : 'Sai'}
                </button>
              ))}
            </div>
          )}
          {q.type === 'short' && (
            <input value={String(answers[q.qid!] ?? '')} onChange={(e) => setAnswers({ ...answers, [q.qid!]: e.target.value })} placeholder="Câu trả lời của bạn" />
          )}
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
      <button className="btn lg" disabled={busy} onClick={submit}>
        Nộp bài
      </button>
    </div>
  );
}

function AttemptResult({ attempt, quiz, onRetry }: { attempt: QuizAttempt; quiz: Quiz; onRetry: () => void }) {
  const [msg, setMsg] = useState('');
  const wrong = attempt.answers.filter((a) => !a.correct);
  return (
    <div className="col" style={{ gap: 14, maxWidth: 780 }}>
      <div className="card col" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h2>
          {attempt.score}/{attempt.total} câu đúng · {Math.round(attempt.accuracy * 100)}%
        </h2>
        <p className="muted">Thời gian {fmtDuration(attempt.durationSeconds)}</p>
        <div className="row">
          <button className="btn" onClick={onRetry}>
            Làm lại
          </button>
          {wrong.length > 0 && (
            <button
              className="btn secondary"
              onClick={async () => {
                const r = await post<{ created: number }>('/learn/mistakes/to-cards', {
                  items: wrong.map((w) => ({ prompt: w.prompt, correctAnswer: w.correctAnswer, explanation: w.explanation })),
                });
                setMsg(`Đã tạo ${r.created} flashcard để ôn lại câu sai.`);
              }}
            >
              🃏 Chuyển {wrong.length} câu sai thành flashcard
            </button>
          )}
          <Link href="/learn" className="btn ghost">
            Về trang ôn tập
          </Link>
        </div>
        {msg && <p className="success-text">{msg}</p>}
      </div>
      {attempt.answers.map((a, i) => {
        const q = quiz.questions.find((x) => x.qid === a.qid);
        const your =
          q?.type === 'mcq' && typeof a.answer === 'number' ? q.options[a.answer] : q?.type === 'true_false' && a.answer != null ? (a.answer ? 'Đúng' : 'Sai') : String(a.answer ?? '(bỏ trống)');
        return (
          <div key={a.qid} className={`card col option ${a.correct ? 'correct' : 'wrong'}`} style={{ cursor: 'default', alignItems: 'stretch' }}>
            <b>
              <Icon name={a.correct ? 'check' : 'x'} size={15} /> Câu {i + 1}. {a.prompt}
            </b>
            <span className="small">Bạn trả lời: {your}</span>
            {!a.correct && <span className="small">Đáp án đúng: <b>{a.correctAnswer}</b></span>}
            {a.explanation && <span className="small muted">{a.explanation}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ======================= PAGE ======================= */
function QuizInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const isNew = id === 'new';
  const [mode, setMode] = useState<'view' | 'edit' | 'take' | 'result'>(isNew ? 'edit' : params.get('take') ? 'take' : 'view');
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const quiz = useResource<{ item: Quiz }>(isNew ? null : `/quizzes/${id}`, ['quizzes']);
  const attempts = useResource<{ items: QuizAttempt[] }>(isNew ? null : `/learn/attempts?quiz=${id}`, ['quizAttempts']);

  useEffect(() => {
    if (!isNew) return;
    const raw = params.get('draft') ? sessionStorage.getItem('focusly.quizDraft') : null;
    if (raw) sessionStorage.removeItem('focusly.quizDraft');
    setDraft(raw ? JSON.parse(raw) : { title: '', questions: [blank('mcq')] });
  }, [isNew, params]);

  if (isNew) {
    return (
      <div className="col" style={{ gap: 14, maxWidth: 820 }}>
        <Link href="/learn?tab=quiz" className="small">
          ‹ Bộ câu hỏi
        </Link>
        <h1>Tạo bộ câu hỏi</h1>
        {draft && <QuizEditor initial={draft} onSaved={(q) => router.replace(`/learn/quiz/${q.id}`)} />}
      </div>
    );
  }

  const q = quiz.data?.item;
  if (!q) return <Spinner />;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="page-header">
        <div>
          <Link href="/learn?tab=quiz" className="small">
            ‹ Bộ câu hỏi
          </Link>
          <h1>{q.title}</h1>
          <p className="muted small">
            {q.questions.length} câu · {q.source === 'ai' ? 'tạo bởi AI' : 'tự tạo'}
          </p>
        </div>
        {mode === 'view' && (
          <div className="row">
            <button className="btn" onClick={() => setMode('take')}>
              <Icon name="play" size={16} /> Làm bài
            </button>
            <button className="btn secondary" onClick={() => setMode('edit')}>
              Sửa
            </button>
            <button
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm('Xoá bộ câu hỏi?')) return;
                await del(`/quizzes/${id}`);
                router.push('/learn?tab=quiz');
              }}
            >
              Xoá
            </button>
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <QuizEditor
          initial={{ ...q, source: q.source }}
          onSaved={() => {
            void quiz.reload();
            setMode('view');
          }}
          onCancel={() => setMode('view')}
        />
      )}
      {mode === 'take' && (
        <QuizTaker
          key={attempt?.id ?? 'take'}
          quiz={q}
          onFinished={(a) => {
            setAttempt(a);
            setMode('result');
            void attempts.reload();
          }}
        />
      )}
      {mode === 'result' && attempt && <AttemptResult attempt={attempt} quiz={q} onRetry={() => setMode('take')} />}
      {mode === 'view' && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Lịch sử làm bài</h3>
          {!attempts.data?.items.length ? (
            <p className="muted small">Chưa làm lần nào.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Điểm</th>
                  <th>Độ chính xác</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {attempts.data.items.map((a) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => { setAttempt(a); setMode('result'); }}>
                    <td>{fmtDate(a.completedAt, true)}</td>
                    <td>
                      {a.score}/{a.total}
                    </td>
                    <td>{Math.round(a.accuracy * 100)}%</td>
                    <td>{fmtDuration(a.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <QuizInner />
    </Suspense>
  );
}

