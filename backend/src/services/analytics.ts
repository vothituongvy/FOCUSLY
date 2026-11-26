import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { SubjectModel, TaskModel } from '../models/Learning';
import { DistractionModel } from '../models/Distraction';
import { QuizAttemptModel, RecoveryModel, ReviewLogModel } from '../models/Learn';
import { computeFocusSeconds } from './sessions';
import { dayKey, hourIn, lastDayKeys, safeTimeZone, wideRange } from '../utils/time';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PHASE 3 – Analytics & Learning Insights + Focus Intelligence.
 * Các chỉ số được giữ TÁCH BIỆT (Planned / Actual Focus / Distraction / Completion / Quiz Accuracy),
 * không gộp thành một điểm duy nhất.
 */

export type Range = 'day' | 'week' | 'month';
const RANGE_DAYS: Record<Range, number> = { day: 1, week: 7, month: 30 };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const OPEN = ['active', 'paused', 'on_break'];
export const REASON_VI: Record<string, string> = {
  social_media: 'mạng xã hội',
  notification: 'thông báo',
  message: 'tin nhắn',
  too_difficult: 'nội dung quá khó',
  tired: 'mệt mỏi',
  other_task: 'muốn làm việc khác',
  environment: 'môi trường xung quanh',
  left_app: 'rời ứng dụng',
  blocked_site: 'cố mở trang bị chặn',
  other: 'khác',
};

async function loadPeriod(userId: string, days: number, end: Date) {
  const r = wideRange(days * 2, end); // gồm cả kỳ trước để so sánh
  const [sessions, tasks, distractions, attempts, reviews, recoveries, subjects] = await Promise.all([
    FocusSessionModel.find({ user: userId, deletedAt: null, startedAt: { $gte: r.from } }).lean(),
    TaskModel.find({
      user: userId,
      deletedAt: null,
      $or: [{ scheduledDate: { $gte: r.from } }, { deadline: { $gte: r.from } }, { completedAt: { $gte: r.from } }],
    }).lean(),
    DistractionModel.find({ user: userId, deletedAt: null, occurredAt: { $gte: r.from } }).lean(),
    QuizAttemptModel.find({ user: userId, deletedAt: null, completedAt: { $gte: r.from } }).lean(),
    ReviewLogModel.find({ user: userId, reviewedAt: { $gte: r.from } }).lean(),
    RecoveryModel.find({ user: userId, deletedAt: null, startedAt: { $gte: r.from } }).lean(),
    SubjectModel.find({ user: userId, deletedAt: null }).lean(),
  ]);
  return { sessions, tasks, distractions, attempts, reviews, recoveries, subjects };
}

function summarize(data: Awaited<ReturnType<typeof loadPeriod>>, keys: Set<string>, tz: string, now: Date) {
  const inK = (d?: Date | null) => Boolean(d && keys.has(dayKey(new Date(d), tz)));
  const sessions = data.sessions.filter((s) => inK(s.startedAt));
  const focusSec = (s: any) => (OPEN.includes(s.status) ? computeFocusSeconds(s, now) : s.actualFocusSeconds);
  const actualFocusMin = sessions.reduce((a, s) => a + focusSec(s), 0) / 60;
  const breakMin = sessions.reduce((a, s) => a + (s.breakSeconds ?? 0), 0) / 60;
  const plannedSessionMin = sessions.reduce((a, s) => a + (s.plannedMinutes ?? 0), 0);
  const tasksInPeriod = data.tasks.filter((t) => t.status !== 'cancelled' && (inK(t.scheduledDate) || inK(t.deadline) || inK(t.completedAt)));
  const tasksDone = tasksInPeriod.filter((t) => t.status === 'done');
  const plannedTaskMin = tasksInPeriod.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0);
  const distractions = data.distractions.filter((d) => inK(d.occurredAt));
  const manualD = distractions.filter((d) => d.reason !== 'left_app');
  const attempts = data.attempts.filter((a) => inK(a.completedAt));
  const reviews = data.reviews.filter((r) => inK(r.reviewedAt));
  const withGoal = sessions.filter((s) => s.summary?.goalAchieved != null);
  const recoveries = data.recoveries.filter((r) => inK(r.startedAt));

  return {
    sessions,
    tasksInPeriod,
    distractions,
    attempts,
    reviews,
    metrics: {
      plannedMinutes: Math.round(Math.max(plannedSessionMin, plannedTaskMin)),
      actualFocusMinutes: Math.round(actualFocusMin),
      studyMinutes: Math.round(actualFocusMin + breakMin),
      breakMinutes: Math.round(breakMin),
      sessionCount: sessions.length,
      completedSessions: sessions.filter((s) => s.status === 'completed').length,
      abandonedSessions: sessions.filter((s) => s.status === 'abandoned').length,
      avgSessionMinutes: round1(avg(sessions.filter((s) => !OPEN.includes(s.status)).map((s) => s.actualFocusSeconds / 60))),
      distractionCount: manualD.length,
      appLeaveCount: distractions.length - manualD.length,
      distractionsPerHour: actualFocusMin > 0 ? round1(manualD.length / (actualFocusMin / 60)) : null,
      tasksTotal: tasksInPeriod.length,
      tasksDone: tasksDone.length,
      completionRate: tasksInPeriod.length ? tasksDone.length / tasksInPeriod.length : null,
      goalAchievedRate: withGoal.length ? withGoal.filter((s) => s.summary?.goalAchieved).length / withGoal.length : null,
      quizAttempts: attempts.length,
      quizAccuracy: avg(attempts.map((a) => a.accuracy)),
      cardReviews: reviews.length,
      retention: reviews.length ? reviews.filter((r) => r.grade >= 3).length / reviews.length : null,
      recoveries: recoveries.length,
      recoveryResumeRate: recoveries.length ? recoveries.filter((r) => r.outcome === 'resumed').length / recoveries.length : null,
    },
  };
}

/** Phân bổ thời gian focus theo giờ trong ngày (bước 5 phút) */
function focusByHour(sessions: any[], tz: string, now: Date) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, focusMinutes: 0, distractions: 0 }));
  for (const s of sessions) {
    for (const seg of s.segments ?? []) {
      if (seg.type !== 'focus') continue;
      const start = new Date(seg.startedAt).getTime();
      const end = seg.endedAt ? new Date(seg.endedAt).getTime() : now.getTime();
      for (let t = start; t < end; t += 5 * 60_000) {
        hours[hourIn(new Date(t), tz)].focusMinutes += Math.min(5, (end - t) / 60_000);
      }
    }
  }
  return hours.map((h) => ({ ...h, focusMinutes: Math.round(h.focusMinutes) }));
}

export async function computeAnalytics(userId: string, range: Range = 'week', end = new Date()) {
  const user = await UserModel.findById(userId).select('profile').lean();
  const tz = safeTimeZone(user?.profile?.timezone);
  const n = RANGE_DAYS[range];
  const data = await loadPeriod(userId, n, end);
  const keysArr = lastDayKeys(n, tz, end);
  const prevKeysArr = lastDayKeys(n, tz, new Date(end.getTime() - n * 86_400_000));
  const cur = summarize(data, new Set(keysArr), tz, end);
  const prev = summarize(data, new Set(prevKeysArr), tz, end);

  // ---- chuỗi theo ngày
  const series = keysArr.map((k) => {
    const one = summarize(data, new Set([k]), tz, end).metrics;
    return {
      date: k,
      focusMinutes: one.actualFocusMinutes,
      plannedMinutes: one.plannedMinutes,
      distractions: one.distractionCount,
      tasksDone: one.tasksDone,
      quizAccuracy: one.quizAccuracy,
    };
  });

  // ---- theo môn học
  const subjName = new Map(data.subjects.map((s) => [String(s._id), s]));
  const subjectIds = new Set<string>();
  cur.sessions.forEach((s) => s.subject && subjectIds.add(String(s.subject)));
  cur.tasksInPeriod.forEach((t) => t.subject && subjectIds.add(String(t.subject)));
  cur.attempts.forEach((a) => a.subject && subjectIds.add(String(a.subject)));
  const bySubject = [...subjectIds]
    .map((id) => {
      const ss = cur.sessions.filter((s) => String(s.subject) === id);
      const ts = cur.tasksInPeriod.filter((t) => String(t.subject) === id);
      const qa = cur.attempts.filter((a) => String(a.subject) === id);
      const ds = cur.distractions.filter((d) => String(d.subject) === id && d.reason !== 'left_app');
      const focusMin = Math.round(ss.reduce((a, s) => a + s.actualFocusSeconds, 0) / 60);
      const subj = subjName.get(id);
      return {
        subjectId: id,
        name: subj?.name ?? 'Đã xoá',
        color: subj?.color ?? '#94a3b8',
        icon: subj?.icon ?? '📘',
        focusMinutes: focusMin,
        sessions: ss.length,
        tasksDone: ts.filter((t) => t.status === 'done').length,
        tasksTotal: ts.length,
        quizAccuracy: avg(qa.map((a) => a.accuracy)),
        distractions: ds.length,
        distractionsPerHour: focusMin > 0 ? round1(ds.length / (focusMin / 60)) : null,
      };
    })
    .sort((a, b) => b.focusMinutes - a.focusMinutes);

  // ---- khung giờ hiệu quả
  const byHour = focusByHour(cur.sessions, tz, end);
  cur.distractions.filter((d) => d.reason !== 'left_app').forEach((d) => byHour[hourIn(d.occurredAt, tz)].distractions++);
  const scored = byHour
    .filter((h) => h.focusMinutes >= 15)
    .map((h) => {
      const rate = h.distractions / (h.focusMinutes / 60);
      return { ...h, distractionsPerHour: round1(rate), quality: Math.round(h.focusMinutes * (1 - Math.min(0.8, rate / 6))) };
    })
    .sort((a, b) => b.quality - a.quality);

  const reasons = new Map<string, number>();
  cur.distractions.forEach((d) => reasons.set(d.reason, (reasons.get(d.reason) ?? 0) + 1));

  const delta = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : (a - b) / b);

  return {
    range,
    from: keysArr[0],
    to: keysArr[keysArr.length - 1],
    timezone: tz,
    metrics: cur.metrics,
    previous: prev.metrics,
    change: {
      actualFocusMinutes: delta(cur.metrics.actualFocusMinutes, prev.metrics.actualFocusMinutes),
      completionRate: delta(cur.metrics.completionRate, prev.metrics.completionRate),
      distractionsPerHour: delta(cur.metrics.distractionsPerHour, prev.metrics.distractionsPerHour),
      quizAccuracy: delta(cur.metrics.quizAccuracy, prev.metrics.quizAccuracy),
    },
    dailyTargetMinutes: user?.profile?.dailyTargetMinutes ?? 120,
    series,
    bySubject,
    byHour,
    bestFocusTimes: scored.slice(0, 3),
    distractionReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

export interface Insight {
  id: string;
  kind: 'praise' | 'tip' | 'warning';
  title: string;
  detail: string;
  metric?: string;
  action?: { label: string; link: string };
}

/** Focus Intelligence: phân tích hành vi 30 ngày và đưa ra gợi ý dựa trên luật (không cần AI) */
export async function computeInsights(userId: string): Promise<{ insights: Insight[]; analytics: Awaited<ReturnType<typeof computeAnalytics>> }> {
  const a = await computeAnalytics(userId, 'month');
  const m = a.metrics;
  const out: Insight[] = [];
  const now = Date.now();

  // 1. Khung giờ vàng
  if (a.bestFocusTimes.length) {
    const b = a.bestFocusTimes[0];
    out.push({
      id: 'best_time',
      kind: 'tip',
      title: `Khung giờ hiệu quả nhất: ${String(b.hour).padStart(2, '0')}:00–${String((b.hour + 1) % 24).padStart(2, '0')}:00`,
      detail: `Bạn tập trung ${b.focusMinutes} phút trong khung giờ này với ${b.distractionsPerHour ?? 0} lần phân tâm/giờ. Hãy xếp nhiệm vụ khó vào đây.`,
      action: { label: 'Mở kế hoạch', link: '/plan' },
    });
  }

  // 2. Độ dài phiên lý tưởng
  const data = await loadPeriod(userId, 30, new Date());
  const good = data.sessions.filter((s) => s.status === 'completed' && (s.summary?.goalAchieved || (s.summary?.rating ?? 0) >= 4)).map((s) => s.actualFocusSeconds / 60);
  const onset = median(data.distractions.filter((d) => d.reason !== 'left_app' && d.minuteIntoSession != null).map((d) => d.minuteIntoSession as number));
  if (good.length >= 3) {
    const ideal = Math.round(median(good)!);
    out.push({
      id: 'ideal_length',
      kind: 'tip',
      title: `Độ dài phiên phù hợp với bạn: ~${ideal} phút`,
      detail: `Các phiên bạn đạt mục tiêu hoặc tự đánh giá cao thường dài khoảng ${ideal} phút${onset ? `, còn phân tâm thường xuất hiện sau ~${Math.round(onset)} phút` : ''}.`,
      metric: `${ideal} phút`,
    });
  } else if (onset && onset < 30) {
    out.push({
      id: 'short_sessions',
      kind: 'tip',
      title: 'Thử chia phiên ngắn hơn',
      detail: `Bạn thường mất tập trung sau ~${Math.round(onset)} phút. Đặt Pomodoro ${Math.max(10, Math.floor(onset / 5) * 5)} phút có thể giúp duy trì tốt hơn.`,
    });
  }

  // 3. Tính đều đặn
  const activeDays = a.series.filter((d) => d.focusMinutes >= 10).length;
  out.push(
    activeDays >= 20
      ? { id: 'consistency', kind: 'praise', title: `Rất đều đặn: học ${activeDays}/30 ngày`, detail: 'Giữ nhịp này, sự nhất quán quan trọng hơn cường độ.' }
      : { id: 'consistency', kind: activeDays >= 10 ? 'tip' : 'warning', title: `Bạn học ${activeDays}/30 ngày gần đây`, detail: 'Đặt mục tiêu nhỏ mỗi ngày (vd 25 phút) để xây dựng thói quen.', action: { label: 'Đặt nhắc học', link: '/settings?tab=notifications' } },
  );

  // 4. Kế hoạch vs thực tế
  if (m.plannedMinutes > 0) {
    const ratio = m.actualFocusMinutes / m.plannedMinutes;
    if (ratio < 0.7)
      out.push({
        id: 'plan_gap',
        kind: 'warning',
        title: `Thời gian thực tế chỉ đạt ${Math.round(ratio * 100)}% kế hoạch`,
        detail: `Kế hoạch ${m.plannedMinutes} phút, thực tế ${m.actualFocusMinutes} phút. Hãy ước lượng thời lượng nhiệm vụ sát hơn hoặc giảm số nhiệm vụ mỗi ngày.`,
      });
    else if (ratio >= 0.9) out.push({ id: 'plan_gap', kind: 'praise', title: 'Bám sát kế hoạch tốt', detail: `Bạn thực hiện ${Math.round(ratio * 100)}% thời gian đã lên kế hoạch.` });
  }

  // 5. Môn học bị bỏ quên
  const openTasks = await TaskModel.find({ user: userId, deletedAt: null, status: { $in: ['todo', 'in_progress'] }, subject: { $ne: null } }).select('subject deadline').lean();
  const recent = new Set(data.sessions.filter((s) => +new Date(s.startedAt) > now - 7 * 86_400_000).map((s) => String(s.subject)));
  const neglected = [...new Set(openTasks.map((t) => String(t.subject)))].filter((id) => !recent.has(id));
  if (neglected.length) {
    const names = neglected.map((id) => data.subjects.find((s) => String(s._id) === id)?.name).filter(Boolean).slice(0, 3);
    if (names.length) out.push({ id: 'neglected', kind: 'warning', title: `7 ngày chưa học: ${names.join(', ')}`, detail: 'Các môn này vẫn còn nhiệm vụ chưa xong.', action: { label: 'Xem nhiệm vụ', link: '/plan' } });
  }

  // 6. Quá hạn
  const overdue = openTasks.filter((t) => t.deadline && +t.deadline < now).length;
  if (overdue >= 2) out.push({ id: 'overdue', kind: 'warning', title: `${overdue} nhiệm vụ đã quá hạn`, detail: 'Dời deadline hợp lý hoặc chia nhỏ nhiệm vụ để tránh dồn việc.', action: { label: 'Xử lý ngay', link: '/plan' } });

  // 7. Kết quả kiểm tra yếu
  const weak = a.bySubject.filter((s) => s.quizAccuracy != null && s.quizAccuracy < 0.6);
  for (const w of weak.slice(0, 2)) {
    out.push({
      id: `weak_${w.subjectId}`,
      kind: 'warning',
      title: `${w.name}: độ chính xác kiểm tra ${Math.round((w.quizAccuracy ?? 0) * 100)}%`,
      detail: 'Ôn lại các câu sai và chuyển chúng thành flashcard để ghi nhớ lâu hơn.',
      action: { label: 'Ôn câu sai', link: '/learn?tab=mistakes' },
    });
  }

  // 8. Phân tâm
  if (m.distractionsPerHour != null && m.distractionsPerHour >= 3) {
    const top = a.distractionReasons.find((r) => r.reason !== 'left_app');
    out.push({
      id: 'distraction_rate',
      kind: 'warning',
      title: `${m.distractionsPerHour} lần phân tâm mỗi giờ học`,
      detail: `Nguyên nhân hàng đầu: ${top ? REASON_VI[top.reason] : 'chưa rõ'}. Bật Focus Shield và thêm các trang gây xao nhãng vào Block List.`,
      action: { label: 'Nhật ký phân tâm', link: '/journal' },
    });
  } else if (m.distractionsPerHour != null && m.actualFocusMinutes > 120 && m.distractionsPerHour < 1) {
    out.push({ id: 'distraction_rate', kind: 'praise', title: 'Mức tập trung rất tốt', detail: `Chưa tới 1 lần phân tâm mỗi giờ trong 30 ngày qua.` });
  }

  // 9. Focus Recovery
  if (m.recoveries >= 3 && m.recoveryResumeRate != null) {
    out.push({
      id: 'recovery',
      kind: m.recoveryResumeRate >= 0.7 ? 'praise' : 'tip',
      title: `Quay lại học sau gián đoạn: ${Math.round(m.recoveryResumeRate * 100)}%`,
      detail: m.recoveryResumeRate >= 0.7 ? 'Quick Reset đang giúp bạn không bỏ cuộc giữa chừng.' : 'Thử bài hít thở 1 phút trước khi quyết định dừng phiên.',
    });
  }

  // 10. Ôn tập
  if (m.retention != null && m.cardReviews >= 20) {
    out.push({
      id: 'retention',
      kind: m.retention >= 0.8 ? 'praise' : 'tip',
      title: `Tỷ lệ nhớ flashcard: ${Math.round(m.retention * 100)}%`,
      detail: m.retention >= 0.8 ? 'Khả năng ghi nhớ tốt.' : 'Viết mặt sau thẻ ngắn gọn hơn và ôn đều mỗi ngày.',
    });
  }

  const order = { warning: 0, tip: 1, praise: 2 };
  return { insights: out.sort((x, y) => order[x.kind] - order[y.kind]), analytics: a };
}
