'use client';

import Link from 'next/link';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';

interface Memory {
  trained: boolean;
  samples: number;
  atRisk: { cardId: string; front: string; recallNow: number; halfLifeDays: number }[];
  forgettingSoon: number;
  averageRecall: number | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** FOCUSLY Brain dự báo thẻ sắp quên (Half-Life Regression) */
export function MemoryForecast() {
  const m = useResource<Memory>('/ai/memory', ['cards']).data;
  if (!m || !m.atRisk.length) return null;
  return (
    <div className="card col">
      <div className="row between wrap">
        <h3>{tr('Brain dự báo: thẻ sắp quên')}</h3>
        <span className="small muted">
          {tr('Trí nhớ trung bình {0}', pct(m.averageRecall ?? 0))} · {tr('{0} thẻ dưới 70% trong 24 giờ tới', m.forgettingSoon)}
        </span>
      </div>
      <div className="list">
        {m.atRisk.slice(0, 6).map((c) => (
          <div key={c.cardId} className="list-item">
            <span className="grow truncate">{c.front}</span>
            <span className="memory-meter" aria-label={tr('Khả năng còn nhớ {0}', pct(c.recallNow))}>
              <span style={{ width: pct(c.recallNow), background: c.recallNow < 0.5 ? 'var(--stop)' : c.recallNow < 0.7 ? '#e0a100' : 'var(--go)' }} />
            </span>
            <b className="small tabular" style={{ width: 40, textAlign: 'right' }}>{pct(c.recallNow)}</b>
          </div>
        ))}
      </div>
      <div className="row between wrap">
        <span className="small muted">{tr('Model half-life regression học từ lịch sử ôn thẻ – ôn đúng lúc sắp quên giúp nhớ lâu nhất.')}</span>
        <Link href="/learn/review" className="btn sm">{tr('Ôn ngay')}</Link>
      </div>
    </div>
  );
}
