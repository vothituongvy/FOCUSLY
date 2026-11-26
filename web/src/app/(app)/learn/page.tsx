'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtDate, fmtDuration } from '@/lib/format';
import type { LearnOverview, Mistake, Quiz } from '@/lib/types';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

type Tab = 'cards' | 'quiz' | 'mistakes' | 'progress';
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function LearnInner() {
  const initial = (useSearchParams().get('tab') as Tab) ?? 'cards';
  const [tab, setTab] = useState<Tab>(initial);
  const ov = useResource<LearnOverview>('/learn/overview', ['cards', 'decks', 'quizAttempts']);
  const o = ov.data;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>Ôn tập & Kiểm tra kiến thức</h1>
          <p className="muted">Đo mức độ nắm kiến thức thay vì chỉ đo thời gian ngồi học.</p>
        </div>
        <div className="row">
          <Link href="/learn/decks/new" className="btn secondary">
            + Bộ flashcard
          </Link>
          <Link href="/learn/quiz/new" className="btn secondary">
            + Bộ câu hỏi
          </Link>
          <Link href="/learn/review" className="btn" aria-disabled={!o?.dueTotal}>
            <Icon name="cards" size={16} /> Ôn ngay {o?.dueTotal ? `(${o.dueTotal})` : ''}
          </Link>
        </div>
      </div>

      {o && (
        <div className="grid grid-4">
          <div className="card">
            <div className="stat-label">Thẻ cần ôn hôm nay</div>
            <div className="stat-value">{o.dueTotal}</div>
            <div className="small muted">trên {o.cardTotal} thẻ</div>
          </div>
          <div className="card">
            <div className="stat-label">Đã ôn hôm nay</div>
            <div className="stat-value">{o.reviewsToday}</div>
            <div className="small muted">lượt ôn</div>
          </div>
          <div className="card">
            <div className="stat-label">Tỷ lệ nhớ (30 ngày)</div>
            <div className="stat-value">{pct(o.retention30d)}</div>
            <div className="small muted">trả lời Hard/Good/Easy</div>
          </div>
          <div className="card">
            <div className="stat-label">Quiz Accuracy</div>
            <div className="stat-value">{pct(o.avgQuizAccuracy)}</div>
            <div className="small muted">20 lần làm gần nhất</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="tabs">
          {(
            [
              ['cards', '🃏 Flashcard'],
              ['quiz', 'Bộ câu hỏi'],
              ['mistakes', 'Ôn câu sai'],
              ['progress', 'Tiến độ ghi nhớ'],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        {!o ? <Spinner /> : tab === 'cards' ? <Decks o={o} /> : tab === 'quiz' ? <Quizzes o={o} /> : tab === 'mistakes' ? <Mistakes /> : <ProgressTab o={o} />}
      </div>
    </div>
  );
}

function Decks({ o }: { o: LearnOverview }) {
  if (!o.decks.length) return <Empty>Chưa có bộ thẻ. Tạo thủ công hoặc dùng AI tạo từ tài liệu.</Empty>;
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {o.decks.map((d) => (
        <div key={d.id} className="card col" style={{ boxShadow: 'none', borderTop: `4px solid ${d.color}` }}>
          <Link href={`/learn/decks/${d.id}`} style={{ fontWeight: 700, color: 'var(--text)' }}>
            {d.title}
          </Link>
          <div className="small muted">
            {d.total} thẻ · mới {d.new} · đang học {d.learning} · đã nhớ {d.young + d.mature}
          </div>
          <div className="progress" title="Tỷ lệ thẻ đã thuộc lâu (≥21 ngày)">
            <span style={{ width: `${d.total ? (d.mature / d.total) * 100 : 0}%`, background: 'var(--success)' }} />
          </div>
          <div className="row between">
            <span className={`badge ${d.due ? 'high' : 'done'}`}>{d.due ? `${d.due} cần ôn` : 'Đã ôn xong'}</span>
            <Link href={`/learn/review?deck=${d.id}`} className="btn sm">
              Ôn
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Quizzes({ o }: { o: LearnOverview }) {
  const subjects = useLearning((s) => s.subjects);
  const list = useResource<{ items: Quiz[] }>('/quizzes?limit=200', ['quizzes']);
  return (
    <div className="col">
      {!list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <Empty>Chưa có bộ câu hỏi.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Bộ câu hỏi</th>
              <th>Môn</th>
              <th>Số câu</th>
              <th>Nguồn</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link href={`/learn/quiz/${q.id}`}>{q.title}</Link>
                </td>
                <td>{subjects.find((s) => s.id === q.subject)?.name ?? '—'}</td>
                <td>{q.questions.length}</td>
                <td>{q.source === 'ai' ? 'AI' : 'Tự tạo'}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link href={`/learn/quiz/${q.id}?take=1`} className="btn sm">
                    Làm bài
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="mt-16">Kết quả gần đây</h3>
      {o.recentAttempts.length === 0 ? (
        <Empty>Chưa làm bài nào.</Empty>
      ) : (
        <div className="list">
          {o.recentAttempts.map((a) => (
            <div key={a.id} className="list-item">
              <span className="grow">{typeof a.quiz === 'object' ? a.quiz?.title : ''}</span>
              <b>
                {a.score}/{a.total}
              </b>
              <span className="small muted">{fmtDuration(a.durationSeconds)}</span>
              <span className="small muted">{fmtDate(a.completedAt, true)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Mistakes() {
  const m = useResource<{ items: Mistake[] }>('/learn/mistakes?days=60', ['quizAttempts']);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  if (!m.data) return <Spinner />;
  if (!m.data.items.length) return <Empty>Không còn câu sai nào </Empty>;
  const toggle = (k: string) => setSelected((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  return (
    <div className="col">
      <div className="row between">
        <p className="small muted">Câu bạn trả lời sai ở lần làm gần nhất. Làm lại bài hoặc chuyển thành flashcard để ôn theo lịch lặp lại ngắt quãng.</p>
        <button
          className="btn sm"
          disabled={!selected.size}
          onClick={async () => {
            const items = m.data!.items.filter((x) => selected.has(x.key)).map((x) => ({ prompt: x.prompt, correctAnswer: x.correctAnswer, explanation: x.explanation }));
            const r = await post<{ created: number }>('/learn/mistakes/to-cards', { items });
            setMsg(`Đã tạo ${r.created} flashcard trong bộ “Ôn câu sai”.`);
            setSelected(new Set());
          }}
        >
          Chuyển {selected.size || ''} câu thành flashcard
        </button>
      </div>
      {msg && <p className="success-text">{msg}</p>}
      {m.data.items.map((x) => (
        <div key={x.key} className="card" style={{ boxShadow: 'none' }}>
          <label className="row" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={selected.has(x.key)} onChange={() => toggle(x.key)} />
            <div className="grow col" style={{ gap: 4 }}>
              <b>{x.prompt}</b>
              <span className="small" style={{ color: 'var(--danger)' }}>
                Bạn trả lời: {String(x.yourAnswer ?? '(bỏ trống)')}
              </span>
              <span className="small" style={{ color: 'var(--success)' }}>
                Đáp án: {x.correctAnswer}
              </span>
              {x.explanation && <span className="small muted">{x.explanation}</span>}
              <span className="small muted">
                {x.quizTitle} · {fmtDate(x.at)} · <Link href={`/learn/quiz/${x.quizId}?take=1`}>Làm lại</Link>
              </span>
            </div>
          </label>
        </div>
      ))}
    </div>
  );
}

function ProgressTab({ o }: { o: LearnOverview }) {
  const p = useResource<{ days: { date: string; reviews: number; retention: number | null; quizAccuracy: number | null }[]; perQuiz: { quizId: string; title: string; attempts: number; first: number | null; last: number | null; best: number | null }[] }>('/learn/progress', ['cards', 'quizAttempts']);
  if (!p.data) return <Spinner />;
  const max = Math.max(1, ...p.data.days.map((d) => d.reviews));
  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h3>Lượt ôn & tỷ lệ nhớ 30 ngày</h3>
        <div className="bars" style={{ height: 130, gap: 3 }}>
          {p.data.days.map((d) => (
            <div key={d.date} className="bar-col" title={`${d.date}: ${d.reviews} lượt, nhớ ${pct(d.retention)}`}>
              <div className="bar" style={{ height: `${(d.reviews / max) * 100}%`, background: d.retention == null ? 'var(--surface-2)' : d.retention >= 0.8 ? 'var(--success)' : d.retention >= 0.6 ? '#f59e0b' : 'var(--danger)' }} />
            </div>
          ))}
        </div>
        <p className="small muted">Màu cột: xanh ≥80% nhớ · cam 60–80% · đỏ &lt;60%</p>
      </div>
      <div>
        <h3>Tiến bộ qua các lần làm bài</h3>
        {p.data.perQuiz.filter((q) => q.attempts).length === 0 ? (
          <Empty>Làm bài ít nhất 1 lần để so sánh.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Bộ câu hỏi</th>
                <th>Số lần</th>
                <th>Lần đầu</th>
                <th>Gần nhất</th>
                <th>Tốt nhất</th>
              </tr>
            </thead>
            <tbody>
              {p.data.perQuiz
                .filter((q) => q.attempts)
                .map((q) => (
                  <tr key={q.quizId}>
                    <td>{q.title}</td>
                    <td>{q.attempts}</td>
                    <td>{pct(q.first)}</td>
                    <td>
                      {pct(q.last)}{' '}
                      {q.first != null && q.last != null && q.last !== q.first && <span className={`delta ${q.last > q.first ? 'up' : 'down'}`}>{q.last > q.first ? '▲' : '▼'}</span>}
                    </td>
                    <td>{pct(q.best)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="small muted">Tổng {o.cardTotal} thẻ trong {o.decks.length} bộ.</div>
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LearnInner />
    </Suspense>
  );
}
