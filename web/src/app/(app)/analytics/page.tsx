'use client';

import Link from 'next/link';
import { useState } from 'react';
import { API_URL, tokens } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { WEEKDAYS_VI } from '@/lib/format';
import { REASON_LABEL, type Analytics, type Insight } from '@/lib/types';
import { Empty, Progress, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

type Range = 'day' | 'week' | 'month';
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v == null || !isFinite(v)) return null;
  const good = invert ? v < 0 : v > 0;
  return (
    <span className={`delta small ${good ? 'up' : 'down'}`}>
      {v > 0 ? '▲' : '▼'}{' '}{tr('{0}% so với kỳ trước', Math.abs(Math.round(v * 100)))}
    </span>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>('week');
  const { data: a, loading } = useResource<Analytics>(`/analytics/overview?range=${range}`, ['sessions', 'tasks', 'distractions', 'quizAttempts']);
  const insights = useResource<{ insights: Insight[] }>('/analytics/insights', ['sessions']);

  const exportCsv = async () => {
    const r = await fetch(`${API_URL}/api/analytics/export?range=${range === 'day' ? 'week' : range}`, { headers: { Authorization: `Bearer ${tokens.access}` } });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `focusly-${range}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Phân tích hiệu quả học tập')}</h1>
          <p className="muted">{tr('Các chỉ số được tách riêng: thời gian dự kiến, tập trung thực tế, phân tâm, hoàn thành và độ chính xác kiểm tra.')}</p>
        </div>
        <div className="row">
          <div className="chips">
            {(
              [
                ['day', tr('Hôm nay')],
                ['week', tr('7 ngày')],
                ['month', tr('30 ngày')],
              ] as [Range, string][]
            ).map(([k, l]) => (
              <button key={k} className={`chip ${range === k ? 'active' : ''}`} onClick={() => setRange(k)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn secondary sm" onClick={exportCsv}>
            <Icon name="download" size={16} /> CSV
          </button>
          <Link href="/ai?tab=coach" className="btn sm">
            <Icon name="ai" size={16} />{' '}{tr('AI phân tích')}
          </Link>
        </div>
      </div>

      {loading && !a ? (
        <Spinner />
      ) : !a ? null : (
        <>
          <div className="grid grid-4">
            <div className="card">
              <div className="stat-label">{tr('Thời gian tập trung thực tế')}</div>
              <div className="stat-value">{mins(a.metrics.actualFocusMinutes)}</div>
              <div className="small muted">{tr('Dự kiến')}{' '}{mins(a.metrics.plannedMinutes)}{' '}{tr('· Tổng học (gồm nghỉ)')}{' '}{mins(a.metrics.studyMinutes)}</div>
              <Delta v={a.change.actualFocusMinutes} />
            </div>
            <div className="card">
              <div className="stat-label">{tr('Tỷ lệ hoàn thành nhiệm vụ')}</div>
              <div className="stat-value">{pct(a.metrics.completionRate)}</div>
              <div className="small muted">
                {tr('{0}/{1} nhiệm vụ · đạt mục tiêu phiên', a.metrics.tasksDone, a.metrics.tasksTotal)}{' '}{pct(a.metrics.goalAchievedRate)}
              </div>
              <Delta v={a.change.completionRate} />
            </div>
            <div className="card">
              <div className="stat-label">{tr('Số lần phân tâm')}</div>
              <div className="stat-value">{a.metrics.distractionCount}</div>
              <div className="small muted">
                {tr('{0} lần/giờ · rời app/tab {1}', a.metrics.distractionsPerHour ?? '—', a.metrics.appLeaveCount)}
              </div>
              <Delta v={a.change.distractionsPerHour} invert />
            </div>
            <div className="card">
              <div className="stat-label">Quiz Accuracy</div>
              <div className="stat-value">{pct(a.metrics.quizAccuracy)}</div>
              <div className="small muted">
                {tr('{0} bài · ôn {1} thẻ · nhớ', a.metrics.quizAttempts, a.metrics.cardReviews)}{' '}{pct(a.metrics.retention)}
              </div>
              <Delta v={a.change.quizAccuracy} />
            </div>
          </div>

          <div className="grid grid-3-1">
            <div className="card">
              <div className="card-title">
                <h3>{range === 'day' ? tr('Hôm nay') : tr('Theo ngày')}{tr(': dự kiến vs thực tế')}</h3>
                <span className="small muted">
                  <span className="dot" style={{ background: '#d5dbe5' }} />{' '}{tr('dự kiến')}{' '}<span className="dot" style={{ background: 'var(--marker)', marginLeft: 8, outline: '1px solid var(--ink)' }} />{' '}{tr('thực tế')}
                </span>
              </div>
              <SeriesChart a={a} />
            </div>
            <div className="card col">
              <h3>{tr('Phiên học')}</h3>
              {[
                [tr('Số phiên'), String(a.metrics.sessionCount)],
                [tr('Hoàn thành'), String(a.metrics.completedSessions)],
                [tr('Huỷ giữa chừng'), String(a.metrics.abandonedSessions)],
                [tr('Độ dài TB'), a.metrics.avgSessionMinutes != null ? tr('{0} phút', a.metrics.avgSessionMinutes) : '—'],
                [tr('Nghỉ'), mins(a.metrics.breakMinutes)],
                ['Quick Reset', tr('{0} lần · quay lại {1}', a.metrics.recoveries, pct(a.metrics.recoveryResumeRate))],
              ].map(([k, v]) => (
                <div key={k} className="row between small">
                  <span className="muted">{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3 style={{ marginBottom: 10 }}>{tr('Khung giờ học hiệu quả')}</h3>
              <HourHeat a={a} />
              {a.bestFocusTimes.length > 0 ? (
                <div className="col mt-16" style={{ gap: 6 }}>
                  {a.bestFocusTimes.map((b, i) => (
                    <div key={b.hour} className="row between small">
                      <span>
                        {['', '', ''][i]} {String(b.hour).padStart(2, '0')}:00–{String((b.hour + 1) % 24).padStart(2, '0')}:00
                      </span>
                      <span className="muted">
                        {tr('{0} phút · {1} phân tâm/giờ', b.focusMinutes, b.distractionsPerHour ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="small muted mt-8">{tr('Cần ít nhất 15 phút tập trung trong một khung giờ.')}</p>
              )}
            </div>
            <div className="card col">
              <h3>{tr('Nguyên nhân phân tâm')}</h3>
              {a.distractionReasons.length === 0 ? (
                <Empty>{tr('Không có phân tâm')}{' '}</Empty>
              ) : (
                a.distractionReasons.map((r) => (
                  <div key={r.reason} className="hbar">
                    <span>{REASON_LABEL[r.reason] ?? r.reason}</span>
                    <Progress value={r.count / a.distractionReasons[0].count} />
                    <b style={{ textAlign: 'right' }}>{r.count}</b>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>{tr('Hiệu quả theo từng môn')}</h3>
            {a.bySubject.length === 0 ? (
              <Empty>{tr('Chưa có dữ liệu theo môn.')}</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{tr('Môn học')}</th>
                    <th>{tr('Tập trung')}</th>
                    <th>{tr('Phiên')}</th>
                    <th>{tr('Nhiệm vụ')}</th>
                    <th>{tr('Phân tâm/giờ')}</th>
                    <th>Quiz</th>
                  </tr>
                </thead>
                <tbody>
                  {a.bySubject.map((s) => (
                    <tr key={s.subjectId}>
                      <td>
                        <span className="dot" style={{ background: s.color }} /> {s.icon} {s.name}
                      </td>
                      <td>{mins(s.focusMinutes)}</td>
                      <td>{s.sessions}</td>
                      <td>
                        {s.tasksDone}/{s.tasksTotal}
                      </td>
                      <td>{s.distractionsPerHour ?? '—'}</td>
                      <td style={{ color: s.quizAccuracy != null && s.quizAccuracy < 0.6 ? 'var(--danger)' : undefined }}>{pct(s.quizAccuracy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="card col">
        <h3>{tr('Learning Insights – đề xuất cải thiện')}</h3>
        {!insights.data ? (
          <Spinner />
        ) : insights.data.insights.length === 0 ? (
          <Empty>{tr('Học thêm vài phiên để FOCUSLY phân tích thói quen của bạn.')}</Empty>
        ) : (
          <div className="grid grid-2">
            {insights.data.insights.map((i) => (
              <div key={i.id} className={`card insight ${i.kind}`} style={{ boxShadow: 'none' }}>
                <b>
                  {i.title}
                </b>
                <div className="small muted">{i.detail}</div>
                {i.action && (
                  <Link href={i.action.link} className="small">
                    {i.action.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SeriesChart({ a }: { a: Analytics }) {
  const max = Math.max(a.dailyTargetMinutes, ...a.series.flatMap((s) => [s.focusMinutes, s.plannedMinutes]), 1);
  return (
    <div className="bars" style={{ height: 180, gap: a.series.length > 10 ? 3 : 10 }}>
      {a.series.map((s) => (
        <div key={s.date} className="bar-col" title={tr('{0}\nThực tế {1}p · Dự kiến {2}p · {3} phân tâm · {4} nhiệm vụ', s.date, s.focusMinutes, s.plannedMinutes, s.distractions, s.tasksDone)}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%', width: '100%', justifyContent: 'center' }}>
            <div className="bar under" style={{ height: `${(s.plannedMinutes / max) * 100}%`, maxWidth: 16 }} />
            <div className="bar" style={{ height: `${(s.focusMinutes / max) * 100}%`, maxWidth: 16 }} />
          </div>
          {a.series.length <= 10 && <span className="small">{WEEKDAYS_VI[new Date(`${s.date}T12:00:00`).getDay()]}</span>}
        </div>
      ))}
    </div>
  );
}

function HourHeat({ a }: { a: Analytics }) {
  const max = Math.max(1, ...a.byHour.map((h) => h.focusMinutes));
  return (
    <>
      <div className="heat">
        {a.byHour.map((h) => (
          <div key={h.hour} title={tr('{0}:00 – {1} phút, {2} phân tâm', h.hour, h.focusMinutes, h.distractions)} style={{ opacity: h.focusMinutes ? 0.15 + (0.85 * h.focusMinutes) / max : 0.06 }} />
        ))}
      </div>
      <div className="row between small muted mt-8">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </>
  );
}
