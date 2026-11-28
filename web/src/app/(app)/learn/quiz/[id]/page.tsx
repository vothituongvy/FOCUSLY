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
import { tr } from '@/lib/i18n';
import { ImportFromFile } from '@/components/ImportFromFile';
import { Feedback } from '@/components/Feedback';
import { ShareToLibrary } from '@/components/ShareToLibrary';
import { uiConfirm } from '@/lib/dialog';

const TYPE_LABEL: Record<QuestionType, string> = { mcq: tr('Trắc nghiệm'), multi: tr('Nhiều đáp án đúng'), true_false: tr('Đúng / Sai'), short: tr('Trả lời ngắn') };
const blank = (type: QuestionType = 'mcq'): Question => ({
  type,
  prompt: '',
  options: type === 'mcq' || type === 'multi' ? ['', '', '', ''] : [],
  correctIndex: type === 'mcq' ? 0 : null,
  correctIndexes: [],
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
      title: d.title || tr('Bộ câu hỏi'),
      subject: d.subject || null,
      material: d.material || null,
      task: d.task || null,
      source: d.source ?? 'manual',
      questions: d.questions.map((q) => {
        // bỏ lựa chọn trống nhưng giữ đúng vị trí đáp án đúng
        const kept = q.options.map((o, k) => ({ o: o.trim(), k })).filter((x) => x.o);
        const remap = (k: number) => kept.findIndex((x) => x.k === k);
        return {
          ...q,
          options: q.type === 'mcq' || q.type === 'multi' ? kept.map((x) => x.o) : [],
          correctIndex: q.type === 'mcq' ? remap(q.correctIndex ?? 0) : null,
          correctIndexes: q.type === 'multi' ? (q.correctIndexes ?? []).map(remap).filter((k) => k >= 0) : [],
          acceptedAnswers: q.type === 'short' ? q.acceptedAnswers.filter((a) => a.trim()) : [],
        };
      }),
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
      {d.source === 'ai' && <div className="banner info">{tr('Câu hỏi do AI tạo là bản nháp – hãy kiểm tra đáp án, sửa hoặc xoá câu chưa phù hợp trước khi lưu.')}</div>}
      <div className="card form">
        <div className="grid grid-2">
          <label className="field">
            {tr('Tên bộ câu hỏi')}
            <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </label>
          <label className="field">
            {tr('Môn học')}
            <select value={d.subject ?? ''} onChange={(e) => setD({ ...d, subject: e.target.value || null })}>
              <option value="">{tr('— Không —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={tr('Chủ đề để AI tạo thêm câu hỏi')} />
          <button className="btn secondary" disabled={!topic || busy === 'ai'} onClick={generate}>
            {busy === 'ai' ? tr('Đang tạo...') : tr('AI tạo 8 câu')}
          </button>
        </div>
      </div>

      {d.questions.map((q, i) => (
        <div key={i} className="card col">
          <div className="row between">
            <span className="row" style={{ gap: 8 }}>
              <b>{tr('Câu {0}', i + 1)}</b>
              {q.origin && <Feedback kind="question" origin={q.origin} text={q.prompt} />}
            </span>
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
          <textarea value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder={tr('Nội dung câu hỏi')} style={{ minHeight: 50 }} />
          {q.type === 'mcq' &&
            q.options.map((o, k) => (
              <label key={k} className="row">
                <input type="radio" checked={q.correctIndex === k} onChange={() => setQ(i, { correctIndex: k })} title={tr('Đáp án đúng')} />
                <input value={o} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={tr('Lựa chọn {0}', String.fromCharCode(65 + k))} />
              </label>
            ))}
          {q.type === 'multi' && (
            <>
              <span className="small muted">{tr('Tick TẤT CẢ đáp án đúng. Người làm phải chọn đủ và đúng mới được điểm.')}</span>
              {q.options.map((o, k) => {
                const on = (q.correctIndexes ?? []).includes(k);
                return (
                  <label key={k} className="row">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setQ(i, { correctIndexes: on ? (q.correctIndexes ?? []).filter((x) => x !== k) : [...(q.correctIndexes ?? []), k].sort((a, b) => a - b) })}
                      title={tr('Đáp án đúng')}
                    />
                    <input value={o} onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={tr('Lựa chọn {0}', String.fromCharCode(65 + k))} />
                  </label>
                );
              })}
            </>
          )}
          {(q.type === 'mcq' || q.type === 'multi') && q.options.length < 8 && (
            <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setQ(i, { options: [...q.options, ''] })}>
              {tr('+ Thêm lựa chọn')}
            </button>
          )}
          {q.type === 'true_false' && (
            <div className="chips">
              <button className={`chip ${q.correctBoolean === true ? 'active' : ''}`} onClick={() => setQ(i, { correctBoolean: true })}>
                {tr('Đáp án: Đúng')}
              </button>
              <button className={`chip ${q.correctBoolean === false ? 'active' : ''}`} onClick={() => setQ(i, { correctBoolean: false })}>
                {tr('Đáp án: Sai')}
              </button>
            </div>
          )}
          {q.type === 'short' && (
            <input
              value={q.acceptedAnswers.join(' | ')}
              onChange={(e) => setQ(i, { acceptedAnswers: e.target.value.split('|').map((x) => x.trim()) })}
              placeholder={tr('Các đáp án chấp nhận, phân tách bằng |  (không phân biệt hoa thường/dấu)')}
            />
          )}
          <input value={q.explanation ?? ''} onChange={(e) => setQ(i, { explanation: e.target.value })} placeholder={tr('Giải thích (hiện sau khi làm bài)')} />
        </div>
      ))}

      <div className="row wrap">
        {(['mcq', 'multi', 'true_false', 'short'] as QuestionType[]).map((t) => (
          <button key={t} className="btn secondary sm" onClick={() => setD({ ...d, questions: [...d.questions, blank(t)] })}>
            + {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button className="btn lg" disabled={busy === 'save' || !d.questions.length} onClick={save}>
          {tr('Lưu bộ câu hỏi ({0} câu)', d.questions.length)}
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            {tr('Huỷ')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ======================= TAKE QUIZ ======================= */
function QuizTaker({ quiz, onFinished }: { quiz: Quiz; onFinished: (a: QuizAttempt) => void }) {
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | number[] | null>>({});
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 1000);
    return () => clearInterval(t);
  }, []);

  const answered = quiz.questions.filter((q) => { const a = answers[q.qid!]; return a !== undefined && a !== '' && !(Array.isArray(a) && a.length === 0); }).length;

  const submit = async () => {
    if (answered < quiz.questions.length && !(await uiConfirm(tr('Bạn mới trả lời {0}/{1} câu. Nộp bài?', answered, quiz.questions.length)))) return;
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
          {tr('Đã trả lời')}{' '}<b>{answered}</b>/{quiz.questions.length}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(elapsed)}</span>
      </div>
      {quiz.questions.map((q, i) => (
        <div key={q.qid} className="card col">
          <span className="small muted">
            {tr('Câu {0} · {1}', i + 1, TYPE_LABEL[q.type])}
          </span>
          <b style={{ whiteSpace: 'pre-wrap' }}>{q.prompt}</b>
          {q.type === 'mcq' &&
            q.options.map((o, k) => (
              <button key={k} className={`option ${answers[q.qid!] === k ? 'selected' : ''}`} onClick={() => setAnswers({ ...answers, [q.qid!]: k })}>
                <b>{String.fromCharCode(65 + k)}.</b> {o}
              </button>
            ))}
          {q.type === 'multi' && (
            <>
              <span className="small muted">{tr('Chọn tất cả đáp án đúng')}</span>
              {q.options.map((o, k) => {
                const cur = (answers[q.qid!] as number[] | undefined) ?? [];
                const on = cur.includes(k);
                return (
                  <button
                    key={k}
                    role="checkbox"
                    aria-checked={on}
                    className={`option ${on ? 'selected' : ''}`}
                    onClick={() => setAnswers({ ...answers, [q.qid!]: on ? cur.filter((x) => x !== k) : [...cur, k].sort((a, b) => a - b) })}
                  >
                    <span className={`option-box ${on ? 'on' : ''}`} aria-hidden>{on ? '✓' : ''}</span>
                    <b>{String.fromCharCode(65 + k)}.</b> {o}
                  </button>
                );
              })}
            </>
          )}
          {q.type === 'true_false' && (
            <div className="grid grid-2">
              {[true, false].map((v) => (
                <button key={String(v)} className={`option ${answers[q.qid!] === v ? 'selected' : ''}`} onClick={() => setAnswers({ ...answers, [q.qid!]: v })}>
                  {v ? tr('Đúng') : 'Sai'}
                </button>
              ))}
            </div>
          )}
          {q.type === 'short' && (
            <input value={String(answers[q.qid!] ?? '')} onChange={(e) => setAnswers({ ...answers, [q.qid!]: e.target.value })} placeholder={tr('Câu trả lời của bạn')} />
          )}
        </div>
      ))}
      {error && <p className="error-text">{error}</p>}
      <button className="btn lg" disabled={busy} onClick={submit}>
        {tr('Nộp bài')}
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
          {tr('{0}/{1} câu đúng · {2}%', attempt.score, attempt.total, Math.round(attempt.accuracy * 100))}
        </h2>
        <p className="muted">{tr('Thời gian {0}', fmtDuration(attempt.durationSeconds))}</p>
        <div className="row">
          <button className="btn" onClick={onRetry}>
            {tr('Làm lại')}
          </button>
          {wrong.length > 0 && (
            <button
              className="btn secondary"
              onClick={async () => {
                const r = await post<{ created: number }>('/learn/mistakes/to-cards', {
                  items: wrong.map((w) => ({ prompt: w.prompt, correctAnswer: w.correctAnswer, explanation: w.explanation })),
                });
                setMsg(tr('Đã tạo {0} flashcard để ôn lại câu sai.', r.created));
              }}
            >
              {tr('🃏 Chuyển {0} câu sai thành flashcard', wrong.length)}
            </button>
          )}
          <Link href="/learn" className="btn ghost">
            {tr('Về trang ôn tập')}
          </Link>
        </div>
        {msg && <p className="success-text">{msg}</p>}
      </div>
      {attempt.answers.map((a, i) => {
        const q = quiz.questions.find((x) => x.qid === a.qid);
        const your =
          q?.type === 'mcq' && typeof a.answer === 'number'
            ? q.options[a.answer]
            : q?.type === 'multi' && Array.isArray(a.answer)
              ? (a.answer as number[]).map((k) => q.options[k]).join('; ') || tr('(bỏ trống)')
              : q?.type === 'true_false' && a.answer != null ? (a.answer ? tr('Đúng') : 'Sai') : String(a.answer ?? tr('(bỏ trống)'));
        return (
          <div key={a.qid} className={`card col option ${a.correct ? 'correct' : 'wrong'}`} style={{ cursor: 'default', alignItems: 'stretch' }}>
            <b>
              <Icon name={a.correct ? 'check' : 'x'} size={15} />{' '}{tr('Câu {0}. {1}', i + 1, a.prompt)}
            </b>
            <span className="small">{tr('Bạn trả lời: {0}', your)}</span>
            {!a.correct && <span className="small">{tr('Đáp án đúng:')}{' '}<b>{a.correctAnswer}</b></span>}
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
          {tr('‹ Bộ câu hỏi')}
        </Link>
        <div className="row between wrap">
          <h1>{tr('Tạo bộ câu hỏi')}</h1>
          <ImportFromFile target="quiz" />
        </div>
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
            {tr('‹ Bộ câu hỏi')}
          </Link>
          <h1>{q.title}</h1>
          <p className="muted small">
            {tr('{0} câu ·', q.questions.length)}{' '}{q.source === 'ai' ? tr('tạo bởi AI') : tr('tự tạo')}
          </p>
          {mode === 'view' && <ShareToLibrary kind="quiz" id={q.id} />}
        </div>
        {mode === 'view' && (
          <div className="row">
            <button className="btn" onClick={() => setMode('take')}>
              <Icon name="play" size={16} />{' '}{tr('Làm bài')}
            </button>
            <button className="btn secondary" onClick={() => setMode('edit')}>
              {tr('Sửa')}
            </button>
            <button
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!(await uiConfirm(tr('Xoá bộ câu hỏi?')))) return;
                await del(`/quizzes/${id}`);
                router.push('/learn?tab=quiz');
              }}
            >
              {tr('Xoá')}
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
          <h3 style={{ marginBottom: 8 }}>{tr('Lịch sử làm bài')}</h3>
          {!attempts.data?.items.length ? (
            <p className="muted small">{tr('Chưa làm lần nào.')}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('Thời điểm')}</th>
                  <th>{tr('Điểm')}</th>
                  <th>{tr('Độ chính xác')}</th>
                  <th>{tr('Thời gian')}</th>
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

