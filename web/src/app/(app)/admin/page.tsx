'use client';

import { useState } from 'react';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Spinner } from '@/components/ui';
import { TrendChart } from '@/components/TrendChart';

type MetricKey = 'dau' | 'signups' | 'focusMinutes' | 'sessions' | 'reviews' | 'quizzes' | 'messages' | 'ai';
interface Metrics {
  totals: { users: number; dau: number; wau: number; mau: number };
  activity: ({ day: string } & Record<MetricKey, number>)[];
  week: { focusMinutes: number; prevFocusMinutes: number; sessions: number; reviews: number; quizzes: number; messages: number; ai: number; signups: number };
  content: Record<'decks' | 'cards' | 'quizzes' | 'materials' | 'exams' | 'rooms' | 'classes' | 'groups' | 'messages' | 'shared', number>;
  features: { key: string; users: number }[];
  platforms: { key: string; users: number }[];
  funnel: { step: string; users: number; of?: number }[];
  sentry: boolean;
}

const METRICS: { key: MetricKey; label: string; unit?: string }[] = [
  { key: 'dau', label: 'Người dùng hoạt động' },
  { key: 'signups', label: 'Đăng ký mới' },
  { key: 'focusMinutes', label: 'Phút tập trung', unit: ' phút' },
  { key: 'sessions', label: 'Phiên học' },
  { key: 'reviews', label: 'Lượt ôn thẻ' },
  { key: 'quizzes', label: 'Bài kiểm tra' },
  { key: 'messages', label: 'Tin nhắn' },
  { key: 'ai', label: 'Lượt hỏi AI' },
];

const FEATURE_LABEL: Record<string, string> = {
  focus: 'Tập trung', plan: 'Kế hoạch', exam: 'Ôn thi', flashcards: 'Flashcard', learn: 'Ôn tập', quiz: 'Bộ câu hỏi', materials: 'Tài liệu', ai: 'Trợ lý AI',
  analytics: 'Phân tích', dashboard: 'Trang chủ', social: 'Bạn bè & phòng học', library: 'Thư viện', classes: 'Lớp học', notifications: 'Thông báo', chat: 'Tin nhắn', other: 'Khác',
};
const PLATFORM_LABEL: Record<string, string> = { web: 'Web', android: 'Android', ios: 'iOS', extension: 'Tiện ích', unknown: 'Khác' };

/** Thống kê hệ thống – chỉ tài khoản có email trong ADMIN_EMAILS (máy chủ) */
export default function AdminPage() {
  const { data: m, error } = useResource<Metrics>('/admin/metrics');
  const [metric, setMetric] = useState<MetricKey>('dau');
  const [table, setTable] = useState(false);
  if (error) return <p className="error-text">{error}</p>;
  if (!m) return <Spinner />;
  const maxF = Math.max(1, ...m.features.map((f) => f.users));
  const maxP = Math.max(1, ...m.platforms.map((f) => f.users));
  const top = m.funnel[0]?.users || 1;
  const cur = METRICS.find((x) => x.key === metric)!;
  const series = m.activity.map((a) => ({ day: a.day, value: a[metric] }));
  const change = m.week.prevFocusMinutes ? Math.round(((m.week.focusMinutes - m.week.prevFocusMinutes) / m.week.prevFocusMinutes) * 100) : null;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Thống kê hệ thống')}</h1>
          <p className="muted">
            {tr('Chỉ tài khoản quản trị xem được. Chỉ đếm số lượng – không xem nội dung của người dùng.')} · Sentry: {m.sentry ? tr('đang bật') : tr('chưa bật (thêm SENTRY_DSN)')}
          </p>
        </div>
      </div>

      <section className="metrics">
        <div>
          <div className="stat-label">{tr('Tổng người dùng')}</div>
          <div className="stat-value">{m.totals.users.toLocaleString()}</div>
          <div className="small muted">{tr('+{0} trong 7 ngày', m.week.signups)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Hoạt động hôm nay (DAU)')}</div>
          <div className="stat-value">{m.totals.dau}</div>
          <div className="small muted">{tr('Độ gắn bó DAU/MAU {0}%', m.totals.mau ? Math.round((m.totals.dau / m.totals.mau) * 100) : 0)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('7 ngày (WAU)')}</div>
          <div className="stat-value">{m.totals.wau}</div>
          <div className="small muted">{tr('30 ngày (MAU)')}: {m.totals.mau}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Phút tập trung 7 ngày')}</div>
          <div className="stat-value">{m.week.focusMinutes.toLocaleString()}</div>
          <div className="small muted">{change === null ? '—' : change >= 0 ? tr('Tăng {0}% so với tuần trước', change) : tr('Giảm {0}% so với tuần trước', -change)}</div>
        </div>
      </section>

      <section className="card col">
        <div className="row between wrap">
          <h3>{tr('{0} – 30 ngày', tr(cur.label))}</h3>
          <button className="btn ghost sm" onClick={() => setTable(!table)}>
            {table ? tr('Xem biểu đồ') : tr('Xem bảng số liệu')}
          </button>
        </div>
        <div className="chips" role="tablist" aria-label={tr('Chọn chỉ số')}>
          {METRICS.map((x) => (
            <button key={x.key} role="tab" aria-selected={metric === x.key} className={`chip ${metric === x.key ? 'active' : ''}`} onClick={() => setMetric(x.key)}>
              {tr(x.label)}
            </button>
          ))}
        </div>
        {table ? (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{tr('Ngày')}</th>
                  {METRICS.map((x) => (
                    <th key={x.key} style={{ textAlign: 'right' }}>
                      {tr(x.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...m.activity].reverse().map((a) => (
                  <tr key={a.day}>
                    <td className="tabular">{a.day}</td>
                    {METRICS.map((x) => (
                      <td key={x.key} className="tabular" style={{ textAlign: 'right' }}>
                        {a[x.key].toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TrendChart data={series} label={tr(cur.label)} unit={cur.unit ? tr(cur.unit) : ''} />
        )}
        <div className="admin-week">
          {(
            [
              ['sessions', 'Phiên học'],
              ['reviews', 'Lượt ôn thẻ'],
              ['quizzes', 'Bài kiểm tra'],
              ['messages', 'Tin nhắn'],
              ['ai', 'Lượt hỏi AI'],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <span className="small muted">{tr(l)} · 7 {tr('ngày')}</span>
              <b className="tabular">{m.week[k].toLocaleString()}</b>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card col">
          <h3>{tr('Tính năng được dùng (7 ngày, số người)')}</h3>
          {m.features.map((f) => (
            <div key={f.key} className="hbar-row">
              <span className="small">{tr(FEATURE_LABEL[f.key] ?? f.key)}</span>
              <span className="hbar" title={`${f.users}`}>
                <span style={{ width: `${(f.users / maxF) * 100}%` }} />
              </span>
              <b className="small tabular">{f.users}</b>
            </div>
          ))}
          <h3 className="mt-8">{tr('Nền tảng (7 ngày)')}</h3>
          {m.platforms.map((p) => (
            <div key={p.key} className="hbar-row">
              <span className="small">{tr(PLATFORM_LABEL[p.key] ?? p.key)}</span>
              <span className="hbar">
                <span style={{ width: `${(p.users / maxP) * 100}%` }} />
              </span>
              <b className="small tabular">{p.users}</b>
            </div>
          ))}
        </section>
        <section className="card col">
          <h3>{tr('Phễu người dùng mới (30 ngày)')}</h3>
          {m.funnel.map((f) => (
            <div key={f.step} className="hbar-row">
              <span className="small">{tr(f.step)}</span>
              <span className="hbar">
                <span style={{ width: `${(f.users / top) * 100}%` }} />
              </span>
              <b className="small tabular">
                {f.users}
                {f.of !== undefined ? `/${f.of}` : ''} <span className="muted">({Math.round((f.users / (f.of || top)) * 100)}%)</span>
              </b>
            </div>
          ))}
          <p className="small muted">{tr('Bước giảm mạnh nhất là nơi người dùng bỏ app – ưu tiên cải thiện bước đó.')}</p>
        </section>
      </div>

      <section className="card col">
        <h3>{tr('Nội dung trên hệ thống')}</h3>
        <div className="admin-content">
          {(
            [
              ['decks', 'Bộ flashcard'],
              ['cards', 'Thẻ'],
              ['quizzes', 'Bộ câu hỏi'],
              ['materials', 'Tài liệu'],
              ['shared', 'Đang chia sẻ công khai'],
              ['exams', 'Kỳ thi'],
              ['classes', 'Lớp học'],
              ['rooms', 'Phòng học chung'],
              ['groups', 'Nhóm chat'],
              ['messages', 'Tin nhắn'],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <b className="tabular">{m.content[k].toLocaleString()}</b>
              <span className="small muted">{tr(l)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
