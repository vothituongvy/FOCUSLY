'use client';

import Link from 'next/link';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Progress, Spinner } from '@/components/ui';

interface Report {
  range: { from: string; to: string };
  minutes: number;
  prevMinutes: number;
  change: number | null;
  targetMinutes: number;
  activeDays: number;
  days: { date: string; label: string; minutes: number }[];
  bestDay: { date: string; label: string; minutes: number } | null;
  sessions: number;
  cardsReviewed: number;
  quizzes: number;
  quizAccuracy: number | null;
  tasksDone: number;
  streak: number;
  dueCards: number;
  friendRank: { rank: number; of: number } | null;
  summary: string;
}

export default function ReportPage() {
  const { data: r } = useResource<Report>('/social/weekly-report', ['sessions', 'cards', 'tasks', 'quizAttempts']);
  if (!r) return <Spinner />;
  const max = Math.max(1, ...r.days.map((d) => d.minutes));
  const h = (m: number) => (m >= 60 ? tr('{0} giờ {1} phút', Math.floor(m / 60), m % 60) : tr('{0} phút', m));
  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Báo cáo tuần')}</h1>
          <p className="muted">
            {r.range.from} → {r.range.to} · {tr('Tự gửi qua thông báo và email lúc 19:00 tối Chủ nhật (bật/tắt trong Cài đặt → Thông báo).')}
          </p>
        </div>
      </div>

      <section className="card report-hero">
        <div>
          <div className="stat-label">{tr('Thời gian tập trung 7 ngày qua')}</div>
          <div className="report-big tabular">{h(r.minutes)}</div>
          <div className="small">
            {r.change === null ? tr('Tuần trước chưa có dữ liệu để so sánh.') : r.change >= 0 ? tr('Tăng {0}% so với tuần trước ({1})', r.change, h(r.prevMinutes)) : tr('Giảm {0}% so với tuần trước ({1})', -r.change, h(r.prevMinutes))}
          </div>
          <div className="mt-8" style={{ maxWidth: 360 }}>
            <Progress value={r.minutes / Math.max(1, r.targetMinutes)} />
            <span className="small muted">{tr('{0}% mục tiêu tuần ({1} phút)', Math.round((r.minutes / Math.max(1, r.targetMinutes)) * 100), r.targetMinutes)}</span>
          </div>
        </div>
        <div className="week-bars" role="img" aria-label={tr('Phút tập trung theo ngày')}>
          {r.days.map((d) => (
            <div key={d.date} className="week-bar">
              <span className="small muted tabular">{d.minutes || ''}</span>
              <span className="bar" style={{ height: `${Math.max(3, (d.minutes / max) * 120)}px` }} data-best={r.bestDay?.date === d.date || undefined} />
              <span className="small">{tr(d.label)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="metrics">
        <div>
          <div className="stat-label">{tr('Ngày có học')}</div>
          <div className="stat-value">{r.activeDays}/7</div>
          <div className="small muted">{tr('Chuỗi hiện tại {0} ngày', r.streak)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Phiên hoàn thành')}</div>
          <div className="stat-value">{r.sessions}</div>
          <div className="small muted">{tr('{0} nhiệm vụ xong', r.tasksDone)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Thẻ đã ôn')}</div>
          <div className="stat-value">{r.cardsReviewed}</div>
          <div className="small muted">{r.dueCards ? tr('{0} thẻ đến hạn trong 24 giờ', r.dueCards) : tr('Không có thẻ đến hạn')}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Bài kiểm tra')}</div>
          <div className="stat-value">{r.quizzes}</div>
          <div className="small muted">{r.quizAccuracy !== null ? tr('Đúng trung bình {0}%', r.quizAccuracy) : '—'}</div>
        </div>
      </section>

      <section className="card col">
        <h3>{tr('Gợi ý cho tuần tới')}</h3>
        <ul className="col" style={{ gap: 6, margin: 0, paddingLeft: 18 }}>
          {r.activeDays < 5 && <li>{tr('Đặt mục tiêu học ít nhất 5/7 ngày – chỉ cần 10 phút để giữ chuỗi.')}</li>}
          {r.bestDay && <li>{tr('Ngày bạn học tốt nhất là {0} ({1} phút) – thử giữ khung giờ đó cho các ngày khác.', tr(r.bestDay.label), r.bestDay.minutes)}</li>}
          {r.dueCards > 0 && (
            <li>
              {tr('Ôn {0} thẻ đến hạn trước khi học bài mới.', r.dueCards)} <Link href="/learn/review">{tr('Ôn ngay')}</Link>
            </li>
          )}
          {r.friendRank ? (
            <li>{tr('Bạn đứng thứ {0}/{1} trong nhóm bạn bè.', r.friendRank.rank, r.friendRank.of)}</li>
          ) : (
            <li>
              {tr('Học cùng bạn bè giúp duy trì thói quen.')} <Link href="/friends">{tr('Kết bạn')}</Link>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
