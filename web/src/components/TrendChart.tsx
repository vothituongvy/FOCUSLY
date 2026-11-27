'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Biểu đồ đường 1 chuỗi theo ngày (SVG thuần): đường 2px, vùng tô nhạt, lưới mờ,
 * di chuột hiện đường dóng + giá trị. Một trục duy nhất.
 */
export function TrendChart({ data, label, unit = '', height = 220 }: { data: { day: string; value: number }[]; label: string; unit?: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 40, r: 12, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = useMemo(() => {
    const p = 10 ** Math.floor(Math.log10(max));
    const step = [1, 2, 5, 10].map((m) => m * p).find((s) => max / s <= 4) ?? p * 10;
    return Math.ceil(max / step) * step;
  }, [max]);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join('');
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(nice * f));
  const fmtDay = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const h = hover !== null ? data[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.min(data.length - 1, Math.max(0, i)));
  };

  return (
    <div ref={ref} className="trend" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="trend-grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="trend-axis">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % 7 === data.length % 7 || i === data.length - 1 ? (
            <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle" className="trend-axis">
              {fmtDay(d.day)}
            </text>
          ) : null,
        )}
        <path d={area} className="trend-area" />
        <path d={line} className="trend-line" />
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} className="trend-cross" />
            <circle cx={x(hover)} cy={y(h.value)} r={5} className="trend-dot" />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div className="trend-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <span className="small muted">{fmtDay(h.day)}</span>
          <b className="tabular">
            {h.value.toLocaleString()}
            {unit}
          </b>
        </div>
      )}
    </div>
  );
}
