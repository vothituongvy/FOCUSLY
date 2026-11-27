'use client';

import { useResource } from '@/lib/hooks';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

export interface Forecast {
  trained: boolean;
  samples: number;
  successRate: number | null;
  confidence: number;
  typicalMinutes: number;
  suggestedMinutes: number;
  byHour: { hour: number; probability: number; sessions: number }[];
  bestHours: { hour: number; probability: number }[];
  now: { hour: number; probability: number; level: 'high' | 'medium' | 'low' };
  tips: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const LEVEL: Record<Forecast['now']['level'], string> = { high: tr('dễ giữ tập trung'), medium: tr('tập trung ở mức vừa'), low: tr('dễ bị phân tâm') };

/** Một dòng gợi ý trong màn Bắt đầu phiên: khả năng giữ tập trung lúc này + độ dài phiên phù hợp */
export function ForecastHint({ minutes, strict, onUseMinutes }: { minutes?: number; strict?: boolean; onUseMinutes?: (m: number) => void }) {
  const f = useResource<Forecast>(`/ai/forecast?${minutes ? `minutes=${minutes}&` : ''}strict=${strict ? 1 : 0}`, ['sessions']).data;
  if (!f) return null;
  if (!f.trained) {
    return (
      <p className="forecast-hint small muted">
        <Icon name="ai" size={15} /> {tr('FOCUSLY Brain đang học thói quen của bạn ({0}/6 phiên).', f.samples)}
      </p>
    );
  }
  return (
    <div className={`forecast-hint ${f.now.level}`}>
      <Icon name="ai" size={16} />
      <span>
        {tr('Lúc này ({0}h) bạn {1}: ', f.now.hour, LEVEL[f.now.level])}
        <b>{pct(f.now.probability)}</b>
        {tr(' · Giờ tốt nhất: {0}', f.bestHours.map((b) => `${b.hour}h`).join(', '))}
      </span>
      {onUseMinutes && f.suggestedMinutes !== minutes && (
        <button type="button" className="link-btn small" onClick={() => onUseMinutes(f.suggestedMinutes)}>
          {tr('Dùng phiên {0} phút', f.suggestedMinutes)}
        </button>
      )}
    </div>
  );
}

/** Thẻ dự báo 24 giờ cho trang Trợ lý AI */
export function ForecastCard() {
  const f = useResource<Forecast>('/ai/forecast', ['sessions']).data;
  if (!f) return null;
  const best = new Set(f.bestHours.map((b) => b.hour));
  const hours = f.byHour.filter((h) => h.hour >= 6);
  return (
    <div className="card col">
      <div className="row between wrap">
        <h3>{tr('Dự báo tập trung')}</h3>
        <span className="small muted">{tr('FOCUSLY Brain · học từ {0} phiên của bạn', f.samples)}</span>
      </div>
      {!f.trained ? (
        <p className="small muted">{tr('Cần ít nhất 6 phiên học (đã có {0}) để model hiểu bạn tập trung tốt nhất lúc nào. Cứ học đều vài ngày nhé!', f.samples)}</p>
      ) : (
        <>
          <div className="forecast-bars" role="img" aria-label={tr('Khả năng giữ tập trung theo giờ')}>
            {hours.map((h) => (
              <div key={h.hour} className={`forecast-col ${best.has(h.hour) ? 'best' : ''} ${h.hour === f.now.hour ? 'now' : ''}`} title={`${h.hour}h: ${pct(h.probability)}`}>
                <div className="forecast-bar" style={{ height: `${Math.max(4, h.probability * 100)}%` }} />
                <span>{h.hour % 3 === 0 ? h.hour : ''}</span>
              </div>
            ))}
          </div>
          <div className="row wrap small" style={{ gap: 16 }}>
            <span>
              {tr('Giờ tốt nhất:')}{' '}<b>{f.bestHours.map((b) => `${b.hour}h (${pct(b.probability)})`).join(', ')}</b>
            </span>
            <span>
              {tr('Phiên phù hợp:')}{' '}<b>{tr('{0} phút', f.suggestedMinutes)}</b>
            </span>
            <span>
              {tr('Độ tin cậy:')}{' '}<b>{pct(f.confidence)}</b>
            </span>
          </div>
        </>
      )}
      {f.tips.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {f.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
