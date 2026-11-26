'use client';

import { useMemo, useState } from 'react';
import { del } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtDate, fmtDuration, toDateInput } from '@/lib/format';
import { REASON_LABEL, REASONS, type Distraction, type DistractionStats } from '@/lib/types';
import { DistractionModal } from '@/components/DistractionModal';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

const CATEGORY: Record<string, string> = { digital: 'Kỹ thuật số', internal: 'Bên trong', external: 'Bên ngoài' };
const ICON: Record<string, string> = { ...Object.fromEntries(REASONS.map((r) => [r.value, r.icon])), left_app: '' };

export default function JournalPage() {
  const subjects = useLearning((s) => s.subjects);
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const stats = useResource<DistractionStats>(`/distractions/stats?days=${days}`, ['distractions']);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);
  const list = useResource<{ items: Distraction[]; total: number }>(
    `/distractions?limit=100&from=${encodeURIComponent(from)}${reason ? `&reason=${reason}` : ''}`,
    ['distractions'],
  );
  const s = stats.data;
  const maxReason = Math.max(1, ...(s?.byReason.map((r) => r.count) ?? [1]));
  const maxHour = Math.max(1, ...(s?.byHour.map((h) => h.count) ?? [1]));
  const maxTrend = Math.max(1, ...(s?.trend.map((t) => t.count) ?? [1]));

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>Nhật ký phân tâm</h1>
          <p className="muted">Hiểu điều gì làm bạn mất tập trung để cải thiện thói quen học.</p>
        </div>
        <div className="row">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 140 }}>
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
          </select>
          <button className="btn" onClick={() => setAdding(true)}>
            + Ghi nhận
          </button>
        </div>
      </div>

      {!s ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-4">
            <div className="card">
              <div className="stat-label">Lần phân tâm ghi nhận</div>
              <div className="stat-value">{s.manualCount}</div>
              <div className="small muted">{days} ngày qua</div>
            </div>
            <div className="card">
              <div className="stat-label">Rời app/tab (tự động)</div>
              <div className="stat-value">{s.autoCount}</div>
              <div className="small muted">Khi bật Focus Shield</div>
            </div>
            <div className="card">
              <div className="stat-label">Tần suất</div>
              <div className="stat-value">{s.perFocusHour ?? '—'}</div>
              <div className="small muted">lần / giờ tập trung</div>
            </div>
            <div className="card">
              <div className="stat-label">Thường mất tập trung sau</div>
              <div className="stat-value">{s.medianMinuteIntoSession != null ? `${Math.round(s.medianMinuteIntoSession)}p` : '—'}</div>
              <div className="small muted">trung vị, tính từ đầu phiên</div>
            </div>
          </div>

          {s.insights.length > 0 && (
            <div className="card col">
              <h3>Gợi ý cải thiện</h3>
              {s.insights.map((t) => (
                <div key={t} className="banner info">
                  {t}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-2">
            <div className="card col">
              <h3>Nguyên nhân</h3>
              {s.byReason.length === 0 && <Empty>Chưa có dữ liệu.</Empty>}
              {s.byReason.map((r) => (
                <div className="hbar" key={r.reason}>
                  <span className="truncate">
                    {r.label}
                  </span>
                  <div className="progress">
                    <span style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                  <b style={{ textAlign: 'right' }}>{r.count}</b>
                </div>
              ))}
              {s.byCategory.length > 0 && (
                <div className="chips mt-8">
                  {s.byCategory.map((c) => (
                    <span key={c.category} className="badge">
                      {CATEGORY[c.category]}: {c.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="card col">
              <h3>Theo khung giờ</h3>
              <div className="bars" style={{ height: 120, gap: 3 }}>
                {s.byHour.map((h) => (
                  <div className="bar-col" key={h.hour} title={`${h.hour}:00 – ${h.count} lần`}>
                    <div className="bar" style={{ height: `${(h.count / maxHour) * 100}%`, background: h.count ? undefined : 'var(--surface-2)' }} />
                    <span style={{ fontSize: 10 }} className="muted">
                      {h.hour % 3 === 0 ? h.hour : ''}
                    </span>
                  </div>
                ))}
              </div>
              <h3 className="mt-8">Theo môn học</h3>
              {s.bySubject.length === 0 && <p className="small muted">Chưa có dữ liệu.</p>}
              {s.bySubject.map((b) => (
                <div className="row between small" key={b.subjectId ?? 'none'}>
                  <span>{b.name}</span>
                  <span>
                    <b>{b.count}</b> lần
                    {b.medianMinuteIntoSession != null && <span className="muted"> · sau ~{Math.round(b.medianMinuteIntoSession)}p</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Xu hướng theo ngày</h3>
            <div className="bars" style={{ height: 110, gap: 3 }}>
              {s.trend.map((t) => (
                <div className="bar-col" key={t.date} title={`${t.date}: ${t.count} lần · ${t.focusMinutes} phút học`}>
                  <div className="bar" style={{ height: `${(t.count / maxTrend) * 100}%`, background: t.count ? '#f59e0b' : 'var(--surface-2)' }} />
                </div>
              ))}
            </div>
            <div className="row between small muted">
              <span>{s.trend[0]?.date}</span>
              <span>{s.trend[s.trend.length - 1]?.date}</span>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h3>Lịch sử</h3>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: 200 }}>
            <option value="">Tất cả nguyên nhân</option>
            {Object.entries(REASON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {!list.data ? (
          <Spinner />
        ) : list.data.items.length === 0 ? (
          <Empty>Chưa có ghi nhận nào. Tuyệt vời! </Empty>
        ) : (
          <div className="list">
            {list.data.items.map((d) => {
              const subj = subjects.find((x) => x.id === d.subject);
              return (
                <div className="list-item" key={d.id}>
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>
                      {REASON_LABEL[d.reason]} {d.source === 'auto' && <span className="badge">tự động</span>}
                    </div>
                    <div className="small muted">
                      {fmtDate(d.occurredAt, true)}
                      {subj && ` · ${subj.icon} ${subj.name}`}
                      {d.minuteIntoSession != null && ` · phút thứ ${Math.round(d.minuteIntoSession)}`}
                      {d.durationSeconds ? ` · ${fmtDuration(d.durationSeconds)}` : ''}
                      {d.note && ` · ${d.note}`}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={async () => {
                      if (!confirm('Xoá ghi nhận này?')) return;
                      await del(`/distractions/${d.id}`);
                      void list.reload();
                      void stats.reload();
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {adding && (
        <DistractionModal
          key={toDateInput(new Date().toISOString())}
          open
          onClose={() => setAdding(false)}
          onSaved={() => {
            void list.reload();
            void stats.reload();
          }}
        />
      )}
    </div>
  );
}
