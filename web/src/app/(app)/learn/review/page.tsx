'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { GRADES, previewInterval } from '@/lib/srs';
import type { Card } from '@/lib/types';
import { Empty, Progress, Spinner } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { isEnglish, PronounceButton, speak, SpeakButton } from '@/components/Speech';

/** PHASE 2 – Ôn flashcard theo Spaced Repetition (phím tắt: Space lật thẻ, 1–4 chấm điểm) */
function ReviewInner() {
  const deck = useSearchParams().get('deck');
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // tự đọc mặt trước mỗi thẻ (ghi nhớ trên máy này)
  const [autoRead, setAutoReadState] = useState(false);
  useEffect(() => {
    try {
      setAutoReadState(localStorage.getItem('focusly.autoRead') === '1');
    } catch {
      /* trình duyệt chặn lưu trữ */
    }
  }, []);
  const setAutoRead = (v: boolean) => {
    setAutoReadState(v);
    try {
      localStorage.setItem('focusly.autoRead', v ? '1' : '0');
    } catch {
      /* bỏ qua */
    }
  };
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [error, setError] = useState('');
  const [startedAt] = useState(Date.now());

  useEffect(() => {
    void get<{ items: Card[] }>(`/learn/due?limit=100${deck ? `&deck=${deck}` : ''}`).then((r) => setQueue(r.items));
  }, [deck]);

  const card = queue?.[index];

  const grade = useCallback(
    async (key: (typeof GRADES)[number]['key'], g: number) => {
      if (!card) return;
      setError('');
      try {
        await post(`/learn/cards/${card.id}/review`, { grade: g });
        setStats((s) => ({ ...s, [key]: s[key] + 1 }));
        // Quên: đưa thẻ về cuối hàng để học lại trong phiên này
        if (g < 3 && queue) setQueue([...queue, card]);
        setIndex((i) => i + 1);
        setFlipped(false);
      } catch (e) {
        setError(errorMessage(e));
      }
    },
    [card, queue],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      if (flipped) {
        const g = GRADES.find((x) => x.hotkey === e.key);
        if (g) void grade(g.key, g.grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, grade]);

  const front = queue && index < queue.length ? queue[index]?.front : undefined;
  useEffect(() => {
    if (autoRead && front) speak(front);
  }, [front, autoRead]);

  if (!queue) return <Spinner />;
  const done = index >= queue.length;
  const reviewed = stats.again + stats.hard + stats.good + stats.easy;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <Link href="/learn" className="small">
            {tr('‹ Ôn tập')}
          </Link>
          <h1>{tr('Ôn flashcard')}</h1>
        </div>
        {!done && (
          <span className="muted">
            {tr('Thẻ {0}/{1}', index + 1, queue.length)}
          </span>
        )}
      </div>
      {!done && <Progress value={index / Math.max(1, queue.length)} />}

      {queue.length === 0 ? (
        <Empty>
          {tr('Không có thẻ nào đến hạn ôn')}{' '}<Link href="/learn">{tr('Quay lại')}</Link>
        </Empty>
      ) : done ? (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
          <h2>{tr('Hoàn thành phiên ôn tập')}</h2>
          <p className="muted">
            {tr('{0} lượt trong {1} phút', reviewed, Math.max(1, Math.round((Date.now() - startedAt) / 60000)))}
          </p>
          <div className="row">
            <span className="badge urgent">{tr('Quên {0}', stats.again)}</span>
            <span className="badge high">{tr('Khó {0}', stats.hard)}</span>
            <span className="badge done">{tr('Nhớ {0}', stats.good)}</span>
            <span className="badge medium">{tr('Dễ {0}', stats.easy)}</span>
          </div>
          <Link href="/learn" className="btn mt-8">
            {tr('Về trang ôn tập')}
          </Link>
        </div>
      ) : (
        card && (
          <>
            <div className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)}>
              <div className="flashcard-inner">
                <div className="flashcard-face">
                  <div>
                    {card.front}
                    {card.hint && <div className="small muted mt-16">{card.hint}</div>}
                  </div>
                </div>
                <div className="flashcard-face back">{card.back}</div>
              </div>
            </div>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <SpeakButton text={flipped ? card.back : card.front} label={flipped ? tr('Nghe mặt sau') : tr('Nghe mặt trước')} />
              <PronounceButton text={isEnglish(card.front) ? card.front : card.back} />
              <label className="row small muted" style={{ gap: 6 }}>
                <input type="checkbox" checked={autoRead} onChange={(e) => setAutoRead(e.target.checked)} style={{ width: 'auto' }} /> {tr('Tự đọc mặt trước')}
              </label>
            </div>
            {!flipped ? (
              <div style={{ textAlign: 'center' }}>
                <button className="btn lg" onClick={() => setFlipped(true)}>
                  {tr('Hiện đáp án (Space)')}
                </button>
                <p className="small muted mt-8">{tr('Hãy tự trả lời trong đầu trước khi lật thẻ – đó là Active Recall.')}</p>
              </div>
            ) : (
              <div className="grade-row">
                {GRADES.map((g) => (
                  <button key={g.key} className={`grade-btn ${g.key}`} onClick={() => grade(g.key, g.grade)}>
                    {g.label} <small>{previewInterval(card.srs, g.grade)}{' '}{tr('· phím {0}', g.hotkey)}</small>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="error-text" style={{ textAlign: 'center' }}>{error}</p>}
          </>
        )
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ReviewInner />
    </Suspense>
  );
}
