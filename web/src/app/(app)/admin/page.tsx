'use client';

import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Spinner } from '@/components/ui';

interface Metrics {
  totals: { users: number; dau: number; wau: number; mau: number };
  dau: { day: string; users: number }[];
  signups: { day: string; users: number }[];
  features: { key: string; users: number }[];
  platforms: { key: string; users: number }[];
  funnel: { step: string; users: number; of?: number }[];
  sentry: boolean;
}

const FEATURE_LABEL: Record<string, string> = {
  focus: 'Tập trung', plan: 'Kế hoạch', exam: 'Ôn thi', flashcards: 'Flashcard', learn: 'Ôn tập', quiz: 'Bộ câu hỏi', materials: 'Tài liệu', ai: 'Trợ lý AI',
  analytics: 'Phân tích', dashboard: 'Trang chủ', social: 'Bạn bè & phòng học', library: 'Thư viện', classes: 'Lớp học', notifications: 'Thông báo', other: 'Khác',
};

/** Số liệu sử dụng – chỉ tài khoản có email trong ADMIN_EMAILS (máy chủ) */
export default function AdminPage() {
  const { data: m, error } = useResource<Metrics>('/admin/metrics');
  if (error) return <p className="error-text">{error}</p>;
  if (!m) return <Spinner />;
  const maxDau = Math.max(1, ...m.dau.map((d) => d.users));
  const maxF = Math.max(1, ...m.features.map((f) => f.users));
  const top = m.funnel[0]?.users || 1;
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Số liệu sử dụng')}</h1>
          <p className="muted">
            {tr('Chỉ đếm số người dùng theo ngày và tính năng – không lưu nội dung.')} · Sentry: {m.sentry ? tr('đang bật') : tr('chưa bật (thêm SENTRY_DSN)')}
          </p>
        </div>
      </div>
      <section className="metrics">
        <div>
          <div className="stat-label">{tr('Tổng người dùng')}</div>
          <div className="stat-value">{m.totals.users}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Hoạt động hôm nay (DAU)')}</div>
          <div className="stat-value">{m.totals.dau}</div>
        </div>
        <div>
          <div className="stat-label">{tr('7 ngày (WAU)')}</div>
          <div className="stat-value">{m.totals.wau}</div>
        </div>
        <div>
          <div className="stat-label">{tr('30 ngày (MAU)')}</div>
          <div className="stat-value">{m.totals.mau}</div>
          <div className="small muted">{tr('Độ gắn bó DAU/MAU {0}%', m.totals.mau ? Math.round((m.totals.dau / m.totals.mau) * 100) : 0)}</div>
        </div>
      </section>

      <section className="card col">
        <h3>{tr('Người dùng hoạt động mỗi ngày (30 ngày)')}</h3>
        <div className="dau-chart" role="img" aria-label="DAU">
          {m.dau.map((d, i) => (
            <div key={d.day} className="dau-col" title={`${d.day}: ${d.users} · ${tr('đăng ký mới')} ${m.signups[i]?.users ?? 0}`}>
              <span className="bar" style={{ height: `${(d.users / maxDau) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="row between small muted">
          <span>{m.dau[0]?.day}</span>
          <span>{m.dau[m.dau.length - 1]?.day}</span>
        </div>
      </section>

      <div className="grid grid-2">
        <section className="card col">
          <h3>{tr('Tính năng được dùng (7 ngày, số người)')}</h3>
          {m.features.map((f) => (
            <div key={f.key} className="hbar-row">
              <span className="small">{tr(FEATURE_LABEL[f.key] ?? f.key)}</span>
              <span className="hbar">
                <span style={{ width: `${(f.users / maxF) * 100}%` }} />
              </span>
              <b className="small tabular">{f.users}</b>
            </div>
          ))}
          <div className="small muted">{tr('Nền tảng')}: {m.platforms.map((p) => `${p.key} ${p.users}`).join(' · ') || '—'}</div>
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
    </div>
  );
}
