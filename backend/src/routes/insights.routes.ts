import { Router } from 'express';
import { requireAuth, uid } from '../middleware/auth';
import { ah, notFound } from '../utils/http';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { DistractionModel } from '../models/Distraction';
import { SubjectModel, TaskModel } from '../models/Learning';
import { computeFocusSeconds, getActiveSession, viewSession } from '../services/sessions';
import { dayKey, hourIn, lastDayKeys, safeTimeZone, wideRange } from '../utils/time';
import { GamifyModel } from '../models/Social';
import { computeStreak } from '../services/social/logic';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Lưu ý: router này được mount tại '/', nên gắn requireAuth theo từng route
// (tránh chặn các route khác như /shield/state dùng extension token)
const router = Router();

/** Một ngày được tính vào Study Streak nếu tập trung ít nhất N phút */
const STREAK_MIN_SECONDS = 10 * 60;

const REASON_LABELS: Record<string, string> = {
  social_media: 'Mạng xã hội',
  notification: 'Thông báo',
  message: 'Tin nhắn',
  too_difficult: 'Nội dung quá khó',
  tired: 'Mệt mỏi, buồn ngủ',
  other_task: 'Muốn làm việc khác',
  environment: 'Môi trường xung quanh',
  left_app: 'Rời ứng dụng/tab',
  blocked_site: 'Cố mở trang bị chặn',
  other: 'Khác',
};

const REASON_TIPS: Record<string, string> = {
  social_media: 'Thêm các trang mạng xã hội vào Block List và bật Focus Shield trước khi học.',
  notification: 'Bật chế độ Không làm phiền trên điện thoại/máy tính trong lúc học.',
  message: 'Báo trước với mọi người khung giờ học, kiểm tra tin nhắn trong giờ nghỉ.',
  too_difficult: 'Chia nhỏ nhiệm vụ khó thành các bước nhỏ, đặt mục tiêu phiên cụ thể hơn.',
  tired: 'Thử học vào khung giờ bạn tỉnh táo hơn và nghỉ giải lao đều đặn.',
  other_task: 'Ghi việc khác vào danh sách nhiệm vụ để xử lý sau, rồi quay lại mục tiêu hiện tại.',
  environment: 'Tìm không gian yên tĩnh hơn hoặc dùng tai nghe chống ồn.',
  left_app: 'Bật Phiên nghiêm ngặt: chỉ tính giờ khi bạn ở trong FOCUSLY.',
  blocked_site: 'Phiên nghiêm ngặt đang làm đúng việc của nó. Thêm trang cần cho việc học vào danh sách cho phép nếu bị chặn nhầm.',
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function loadUser(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound();
  return user;
}

/* ================= DASHBOARD ================= */

router.get(
  '/dashboard',
  requireAuth,
  ah(async (req, res) => {
    const userId = uid(req);
    const user = await loadUser(userId);
    const tz = safeTimeZone(user.profile?.timezone);
    const now = new Date();
    const today = dayKey(now, tz);
    const dailyTargetMinutes = user.profile?.dailyTargetMinutes ?? 120;

    const active = await getActiveSession(userId);

    // ---- Phiên học 7 ngày gần nhất
    const week = wideRange(7, now);
    const sessions = await FocusSessionModel.find({
      user: userId,
      deletedAt: null,
      startedAt: { $gte: week.from },
    }).lean();
    const weekKeys = lastDayKeys(7, tz, now);
    const byDay = new Map(weekKeys.map((k) => [k, { date: k, focusSeconds: 0, sessions: 0 }]));
    for (const s of sessions) {
      const key = dayKey(s.startedAt, tz);
      const bucket = byDay.get(key);
      if (!bucket) continue;
      const open = ['active', 'paused', 'on_break'].includes(s.status);
      bucket.focusSeconds += open ? computeFocusSeconds(s, now) : s.actualFocusSeconds;
      bucket.sessions += 1;
    }
    const weekly = [...byDay.values()].map((d) => ({ ...d, focusMinutes: Math.round(d.focusSeconds / 60) }));
    const todayStats = byDay.get(today) ?? { focusSeconds: 0, sessions: 0 };

    // ---- Nhiệm vụ hôm nay
    const taskRange = wideRange(1, now);
    const candidateTasks = await TaskModel.find({
      user: userId,
      deletedAt: null,
      status: { $ne: 'cancelled' },
      $or: [
        { scheduledDate: { $gte: taskRange.from, $lt: taskRange.to } },
        { deadline: { $gte: taskRange.from, $lt: taskRange.to } },
        { completedAt: { $gte: taskRange.from } },
      ],
    }).lean();
    const todayTasks = candidateTasks.filter(
      (t) =>
        (t.scheduledDate && dayKey(t.scheduledDate, tz) === today) ||
        (t.deadline && dayKey(t.deadline, tz) === today) ||
        (t.completedAt && dayKey(t.completedAt, tz) === today),
    );
    const completedToday = todayTasks.filter((t) => t.status === 'done').length;

    const upcomingTasks = await TaskModel.find({
      user: userId,
      deletedAt: null,
      status: { $in: ['todo', 'in_progress'] },
    })
      .sort({ deadline: 1, scheduledDate: 1, priority: -1 })
      .limit(50)
      .populate('subject', 'name color icon')
      .lean();
    const overdueCount = upcomingTasks.filter((t) => t.deadline && t.deadline < now).length;
    const upcoming = upcomingTasks
      .sort((a, b) => {
        const ad = (a.deadline ?? a.scheduledDate)?.getTime() ?? Infinity;
        const bd = (b.deadline ?? b.scheduledDate)?.getTime() ?? Infinity;
        return ad - bd;
      })
      .slice(0, 6)
      .map((t) => ({ ...t, id: String(t._id), _id: undefined }));

    // ---- Streak (365 ngày)
    const yearSessions = await FocusSessionModel.find({
      user: userId,
      deletedAt: null,
      startedAt: { $gte: new Date(now.getTime() - 366 * 86_400_000) },
    })
      .select('startedAt actualFocusSeconds status segments')
      .lean();
    const secondsByDay = new Map<string, number>();
    for (const s of yearSessions) {
      const k = dayKey(s.startedAt, tz);
      const open = ['active', 'paused', 'on_break'].includes(s.status);
      secondsByDay.set(k, (secondsByDay.get(k) ?? 0) + (open ? computeFocusSeconds(s, now) : s.actualFocusSeconds));
    }
    const days = lastDayKeys(366, tz, now).reverse(); // [today, yesterday, ...]
    // ngày dùng thẻ đóng băng được tính như ngày có học
    const frozenDays = new Set((await GamifyModel.findOne({ user: userId }).select('frozenDays').lean())?.frozenDays ?? []);
    const st = computeStreak(days, new Set(days.filter((k) => (secondsByDay.get(k) ?? 0) >= STREAK_MIN_SECONDS)), frozenDays);
    const streak = st.current;
    const best = st.best;

    // ---- Phân tâm hôm nay
    const todayDistractions = (
      await DistractionModel.find({
        user: userId,
        deletedAt: null,
        occurredAt: { $gte: taskRange.from },
      })
        .select('occurredAt reason source')
        .lean()
    ).filter((d) => dayKey(d.occurredAt, tz) === today);
    const manualDistractions = todayDistractions.filter((d) => d.reason !== 'left_app').length;

    // ---- Focus Score (THAM KHẢO, công thức công khai)
    const focusSeconds = todayStats.focusSeconds;
    const targetRatio = dailyTargetMinutes > 0 ? Math.min(1, focusSeconds / 60 / dailyTargetMinutes) : 0;
    const taskRatio = todayTasks.length ? completedToday / todayTasks.length : null;
    const perHour = focusSeconds > 0 ? manualDistractions / (focusSeconds / 3600) : null;
    const distractionRatio = perHour === null ? 0 : Math.max(0, 1 - perHour / 4);
    const parts = [
      { key: 'target', label: 'Đạt thời gian mục tiêu', weight: 50, value: targetRatio },
      ...(taskRatio !== null ? [{ key: 'tasks', label: 'Hoàn thành nhiệm vụ hôm nay', weight: 30, value: taskRatio }] : []),
      { key: 'distraction', label: 'Ít phân tâm (≤4 lần/giờ)', weight: 20, value: distractionRatio },
    ];
    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    const score = Math.round((parts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight) * 100);

    // ---- Hoạt động gần đây
    const [recentSessions, recentTasks, recentDistractions] = await Promise.all([
      FocusSessionModel.find({ user: userId, deletedAt: null }).sort({ updatedAt: -1 }).limit(6).populate('subject', 'name icon').lean(),
      TaskModel.find({ user: userId, deletedAt: null, completedAt: { $ne: null } }).sort({ completedAt: -1 }).limit(6).lean(),
      DistractionModel.find({ user: userId, deletedAt: null }).sort({ occurredAt: -1 }).limit(6).lean(),
    ]);
    const activities = [
      ...recentSessions.map((s: any) => ({
        type: ['completed', 'abandoned'].includes(s.status) ? 'session_ended' : 'session_started',
        at: s.endedAt ?? s.startedAt,
        title:
          ['completed', 'abandoned'].includes(s.status)
            ? `Hoàn thành phiên ${Math.round(s.actualFocusSeconds / 60)} phút${s.subject?.name ? ` – ${s.subject.name}` : ''}`
            : `Bắt đầu phiên học${s.subject?.name ? ` – ${s.subject.name}` : ''}`,
        refId: String(s._id),
      })),
      ...recentTasks.map((t) => ({ type: 'task_done', at: t.completedAt, title: `Hoàn thành: ${t.title}`, refId: String(t._id) })),
      ...recentDistractions.map((d) => ({
        type: 'distraction',
        at: d.occurredAt,
        title: `Phân tâm: ${REASON_LABELS[d.reason] ?? d.reason}`,
        refId: String(d._id),
      })),
    ]
      .filter((a) => a.at)
      .sort((a, b) => new Date(b.at as Date).getTime() - new Date(a.at as Date).getTime())
      .slice(0, 10);

    res.json({
      date: today,
      timezone: tz,
      dailyGoal: { targetMinutes: dailyTargetMinutes, focusMinutes: Math.round(focusSeconds / 60), ratio: targetRatio },
      studyTime: { todaySeconds: focusSeconds, todaySessions: todayStats.sessions },
      tasks: { completed: completedToday, total: todayTasks.length, overdue: overdueCount },
      upcomingTasks: upcoming,
      streak: { current: streak, best, minMinutesPerDay: STREAK_MIN_SECONDS / 60 },
      weeklyProgress: weekly,
      distractionsToday: { manual: manualDistractions, appLeaves: todayDistractions.length - manualDistractions },
      focusScore: { score, isReference: true, breakdown: parts, note: 'Điểm tham khảo, không phải đánh giá chính thức.' },
      recentActivities: activities,
      activeSession: active ? viewSession(active) : null,
    });
  }),
);

/* ================= DISTRACTION STATS ================= */

router.get(
  '/distractions/stats',
  requireAuth,
  ah(async (req, res) => {
    const userId = uid(req);
    const user = await loadUser(userId);
    const tz = safeTimeZone(user.profile?.timezone);
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const now = new Date();
    const range = wideRange(days, now);
    const keys = lastDayKeys(days, tz, now);
    const keySet = new Set(keys);

    const [distractions, sessions, subjects] = await Promise.all([
      DistractionModel.find({ user: userId, deletedAt: null, occurredAt: { $gte: range.from } }).lean(),
      FocusSessionModel.find({ user: userId, deletedAt: null, startedAt: { $gte: range.from } })
        .select('startedAt actualFocusSeconds subject plannedMinutes mode pomodoro')
        .lean(),
      SubjectModel.find({ user: userId }).select('name color icon').lean(),
    ]);
    const list = distractions.filter((d) => keySet.has(dayKey(d.occurredAt, tz)));
    const manual = list.filter((d) => d.reason !== 'left_app');
    const subjectName = new Map(subjects.map((s) => [String(s._id), s]));

    const count = <T extends string>(arr: T[]) => {
      const m = new Map<T, number>();
      arr.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    const byReason = count(list.map((d) => d.reason)).map(([reason, c]) => ({ reason, label: REASON_LABELS[reason], count: c }));
    const byCategory = count(list.map((d) => d.category)).map(([category, c]) => ({ category, count: c }));
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    list.forEach((d) => byHour[hourIn(d.occurredAt, tz)].count++);
    const dayMap = new Map(keys.map((k) => [k, { date: k, count: 0, focusMinutes: 0 }]));
    list.forEach((d) => {
      const b = dayMap.get(dayKey(d.occurredAt, tz));
      if (b && d.reason !== 'left_app') b.count++;
    });
    sessions.forEach((s) => {
      const b = dayMap.get(dayKey(s.startedAt, tz));
      if (b) b.focusMinutes += Math.round(s.actualFocusSeconds / 60);
    });

    const subjectGroups = new Map<string, number[]>();
    manual.forEach((d) => {
      const k = d.subject ? String(d.subject) : 'none';
      if (!subjectGroups.has(k)) subjectGroups.set(k, []);
      if (d.minuteIntoSession != null) subjectGroups.get(k)!.push(d.minuteIntoSession);
      else subjectGroups.get(k)!.push(-1);
    });
    const bySubject = [...subjectGroups.entries()]
      .map(([id, minutes]) => {
        const valid = minutes.filter((m) => m >= 0);
        return {
          subjectId: id === 'none' ? null : id,
          name: id === 'none' ? 'Không gắn môn' : (subjectName.get(id)?.name ?? 'Đã xoá'),
          count: minutes.length,
          medianMinuteIntoSession: median(valid),
        };
      })
      .sort((a, b) => b.count - a.count);

    const totalFocusHours = sessions.reduce((s, x) => s + x.actualFocusSeconds, 0) / 3600;
    const minutesInto = manual.map((d) => d.minuteIntoSession).filter((m): m is number => m != null);

    // ---- Gợi ý cải thiện
    const insights: string[] = [];
    const topManual = byReason.find((r) => r.reason !== 'left_app');
    if (topManual && topManual.count >= 3) {
      insights.push(`Nguyên nhân phân tâm phổ biến nhất: ${topManual.label} (${topManual.count} lần). ${REASON_TIPS[topManual.reason] ?? ''}`.trim());
    }
    for (const s of bySubject) {
      if (s.count >= 3 && s.medianMinuteIntoSession != null && s.medianMinuteIntoSession >= 5 && s.medianMinuteIntoSession < 40) {
        const suggest = Math.max(10, Math.floor(s.medianMinuteIntoSession / 5) * 5);
        insights.push(
          `Bạn thường mất tập trung sau khoảng ${Math.round(s.medianMinuteIntoSession)} phút khi học ${s.name}. Hãy thử chia phiên thành các khoảng ${suggest} phút.`,
        );
      }
    }
    const peak = [...byHour].sort((a, b) => b.count - a.count)[0];
    if (peak && peak.count >= 3) {
      insights.push(`Khung giờ ${String(peak.hour).padStart(2, '0')}:00–${String((peak.hour + 1) % 24).padStart(2, '0')}:00 bạn hay bị phân tâm nhất.`);
    }
    const leaves = list.filter((d) => d.reason === 'left_app');
    if (leaves.length >= 5) {
      insights.push(`Bạn đã rời ứng dụng/tab ${leaves.length} lần khi đang học. ${REASON_TIPS.left_app}`);
    }

    res.json({
      days,
      total: list.length,
      manualCount: manual.length,
      autoCount: list.length - manual.length,
      perFocusHour: totalFocusHours > 0 ? Math.round((manual.length / totalFocusHours) * 10) / 10 : null,
      medianMinuteIntoSession: median(minutesInto),
      byReason,
      byCategory,
      byHour,
      bySubject,
      trend: [...dayMap.values()],
      insights,
    });
  }),
);

export default router;
