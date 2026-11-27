import { env } from '../../config/env';
import { CardModel, QuizAttemptModel, ReviewLogModel } from '../../models/Learn';
import { TaskModel } from '../../models/Learning';
import { UserModel } from '../../models/User';
import { FocusSessionModel } from '../../models/FocusSession';
import { lastDayKeys, safeTimeZone } from '../../utils/time';
import { sendMail } from '../mail';
import { notify } from '../notifications';
import { focusByDay, quickStreak } from './gamify';
import { leaderboard } from './friends';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Báo cáo 7 ngày gần nhất so với 7 ngày trước đó */
export async function weeklyReport(userId: string, now = new Date()) {
  const u = await UserModel.findById(userId).select('name email profile.timezone profile.dailyTargetMinutes').lean();
  const tz = safeTimeZone(u?.profile?.timezone);
  const byDay = await focusByDay(userId, tz, 15, now);
  const keys = lastDayKeys(14, tz, now);
  const prevKeys = keys.slice(0, 7);
  const thisKeys = keys.slice(7);
  const sum = (ks: string[]) => Math.round(ks.reduce((a, k) => a + (byDay.get(k) ?? 0), 0) / 60);
  const minutes = sum(thisKeys);
  const prevMinutes = sum(prevKeys);
  const days = thisKeys.map((k) => ({ date: k, label: WD[new Date(`${k}T12:00:00Z`).getUTCDay()], minutes: Math.round((byDay.get(k) ?? 0) / 60) }));
  const best = [...days].sort((a, b) => b.minutes - a.minutes)[0];
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [sessions, reviews, attempts, tasks, dueCards] = await Promise.all([
    FocusSessionModel.countDocuments({ user: userId, deletedAt: null, startedAt: { $gte: since }, status: 'completed' }),
    ReviewLogModel.countDocuments({ user: userId, reviewedAt: { $gte: since } }),
    QuizAttemptModel.find({ user: userId, deletedAt: null, completedAt: { $gte: since } }).select('accuracy').lean(),
    TaskModel.countDocuments({ user: userId, deletedAt: null, completedAt: { $gte: since } }),
    CardModel.countDocuments({ user: userId, deletedAt: null, suspended: { $ne: true }, 'srs.due': { $lte: new Date(now.getTime() + 86_400_000) } }),
  ]);
  const board = await leaderboard(userId, now).catch(() => null);
  const me = board?.rows.find((r) => r.me);
  const target = (u?.profile?.dailyTargetMinutes ?? 120) * 7;
  return {
    name: u?.name ?? '',
    email: u?.email ?? '',
    range: { from: thisKeys[0], to: thisKeys[6] },
    minutes,
    prevMinutes,
    change: prevMinutes ? Math.round(((minutes - prevMinutes) / prevMinutes) * 100) : null,
    targetMinutes: target,
    activeDays: days.filter((d) => d.minutes >= 10).length,
    days,
    bestDay: best?.minutes ? best : null,
    sessions,
    cardsReviewed: reviews,
    quizzes: attempts.length,
    quizAccuracy: attempts.length ? Math.round((attempts.reduce((a, t) => a + (t.accuracy ?? 0), 0) / attempts.length) * 100) : null,
    tasksDone: tasks,
    streak: await quickStreak(userId, tz, now),
    dueCards,
    friendRank: me && board && board.rows.length > 1 ? { rank: me.rank, of: board.rows.length } : null,
  };
}

export type WeeklyReport = Awaited<ReturnType<typeof weeklyReport>>;

export function reportSummary(r: WeeklyReport) {
  const h = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m} phút`);
  const trend = r.change === null ? '' : r.change >= 0 ? ` (tăng ${r.change}%)` : ` (giảm ${-r.change}%)`;
  return `Tuần này bạn tập trung ${h(r.minutes)}${trend} trong ${r.activeDays}/7 ngày · ${r.cardsReviewed} thẻ đã ôn · chuỗi ${r.streak} ngày.`;
}

export function reportEmail(r: WeeklyReport) {
  const max = Math.max(1, ...r.days.map((d) => d.minutes));
  const bars = r.days
    .map(
      (d) =>
        `<td style="vertical-align:bottom;text-align:center;padding:0 4px"><div style="background:#16203a;width:22px;height:${Math.max(2, Math.round((d.minutes / max) * 90))}px;border-radius:4px 4px 0 0;margin:auto"></div><div style="font-size:11px;color:#666;margin-top:4px">${d.label}</div></td>`,
    )
    .join('');
  const row = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#555">${k}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${v}</td></tr>`;
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#16203a">
    <h2 style="margin-bottom:4px">FOCUSLY · Báo cáo tuần</h2>
    <p style="color:#666;margin-top:0">${r.range.from} → ${r.range.to}</p>
    <p>Chào ${esc(r.name)}, ${esc(reportSummary(r))}</p>
    <table style="margin:16px 0;height:110px"><tr>${bars}</tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${row('Thời gian tập trung', `${r.minutes} / ${r.targetMinutes} phút`)}
      ${row('Phiên hoàn thành', String(r.sessions))}
      ${row('Thẻ đã ôn', String(r.cardsReviewed))}
      ${row('Bài kiểm tra', r.quizzes ? `${r.quizzes} bài · đúng ${r.quizAccuracy}%` : '—')}
      ${row('Nhiệm vụ xong', String(r.tasksDone))}
      ${row('Chuỗi ngày học', `${r.streak} ngày`)}
      ${r.friendRank ? row('Xếp hạng với bạn bè', `#${r.friendRank.rank}/${r.friendRank.of}`) : ''}
    </table>
    ${r.dueCards ? `<p>Bạn có <b>${r.dueCards} thẻ</b> cần ôn trong 24 giờ tới.</p>` : ''}
    <p><a href="${env.webUrl}/dashboard" style="background:#16203a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Mở FOCUSLY</a></p>
    <p style="color:#999;font-size:12px">Tắt email này trong Cài đặt → Thông báo → Báo cáo tuần.</p>
  </div>`;
}

/** Gửi báo cáo tuần (thông báo + email) – gọi từ bộ nhắc lúc 19:00 Chủ nhật giờ địa phương */
export async function sendWeeklyReport(userId: string, weekKey: string, withEmail: boolean) {
  const r = await weeklyReport(userId);
  const sent = await notify(userId, {
    type: 'weekly_report',
    title: r.minutes ? `Báo cáo tuần: ${r.minutes} phút tập trung 📊` : 'Báo cáo tuần của bạn 📊',
    body: reportSummary(r),
    data: { link: '/report' },
    dedupeKey: `weekly:${weekKey}`,
  });
  if (sent && withEmail && r.email && env.smtp.host) {
    await sendMail(r.email, `FOCUSLY – Báo cáo tuần ${r.range.from} → ${r.range.to}`, reportEmail(r)).catch((e) => console.warn('[weekly] mail', (e as Error).message));
  }
}
