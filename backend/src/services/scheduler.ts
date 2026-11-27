import { env } from '../config/env';
import { UserModel } from '../models/User';
import { TaskModel } from '../models/Learning';
import { FocusSessionModel } from '../models/FocusSession';
import { DistractionModel } from '../models/Distraction';
import { CardModel } from '../models/Learn';
import { notify } from './notifications';
import { computeFocusSeconds } from './sessions';
import { dayKey, minutesOfDay, parseHm, safeTimeZone, weekdayIn, wideRange } from '../utils/time';
import { sendWeeklyReport } from './social/report';

/**
 * Bộ nhắc chạy mỗi phút (trong cùng process API).
 * - Study Reminder: tới khung giờ học mong muốn
 * - Task Reminder: nhiệm vụ sắp đến hạn
 * - Break Reminder: hết giờ Pomodoro (đẩy tới điện thoại khi app chạy nền)
 * - Daily Summary: tổng kết cuối ngày
 * - Review Reminder: flashcard đến hạn ôn
 * Mọi thông báo có dedupeKey nên chạy lặp không gửi trùng.
 * Lưu ý: Render free ngủ khi không có request → nhắc có thể trễ.
 */
const WINDOW_MIN = 2;
const near = (m: number, target: number) => (m - target + 1440) % 1440 < WINDOW_MIN;

async function userReminders(now: Date) {
  const users = await UserModel.find({}).select('profile.timezone profile.preferredStudyTimes profile.dailyTargetMinutes notificationSettings name').lean();
  for (const u of users) {
    const tz = safeTimeZone(u.profile?.timezone);
    const ns: Partial<NonNullable<typeof u.notificationSettings>> = u.notificationSettings ?? {};
    const m = minutesOfDay(now, tz);
    const today = dayKey(now, tz);
    const uid = String(u._id);

    if (ns.studyReminder !== false) {
      for (const t of u.profile?.preferredStudyTimes ?? []) {
        if (!near(m, parseHm(t.start))) continue;
        const open = await FocusSessionModel.exists({ user: uid, status: { $in: ['active', 'paused', 'on_break'] } });
        if (open) continue;
        await notify(uid, {
          type: 'study_reminder',
          title: 'Đến giờ học rồi 📚',
          body: `Khung giờ ${t.start}–${t.end}. Bắt đầu một phiên tập trung nhé!`,
          data: { link: '/focus' },
          dedupeKey: `study:${today}:${t.start}`,
        });
      }
    }

    // Báo cáo tuần: 19:00 tối Chủ nhật giờ địa phương
    if (ns.weeklyReport !== false && weekdayIn(now, tz) === 0 && near(m, 19 * 60)) {
      await sendWeeklyReport(uid, today, ns.weeklyEmail !== false).catch((e) => console.warn('[weekly]', (e as Error).message));
    }

    if (ns.dailySummary !== false && near(m, parseHm(ns.dailySummaryTime ?? '21:30'))) {
      const r = wideRange(1, now);
      const sessions = await FocusSessionModel.find({ user: uid, startedAt: { $gte: r.from }, deletedAt: null }).select('startedAt actualFocusSeconds').lean();
      const focusMin = Math.round(sessions.filter((s) => dayKey(s.startedAt, tz) === today).reduce((a, s) => a + s.actualFocusSeconds, 0) / 60);
      const done = (await TaskModel.find({ user: uid, completedAt: { $gte: r.from } }).select('completedAt').lean()).filter((t) => t.completedAt && dayKey(t.completedAt, tz) === today).length;
      const dis = (await DistractionModel.find({ user: uid, occurredAt: { $gte: r.from }, reason: { $ne: 'left_app' } }).select('occurredAt').lean()).filter((d) => dayKey(d.occurredAt, tz) === today).length;
      const target = u.profile?.dailyTargetMinutes ?? 120;
      await notify(uid, {
        type: 'daily_summary',
        title: focusMin >= target ? 'Tuyệt vời! Bạn đã đạt mục tiêu hôm nay 🎉' : 'Tổng kết ngày học',
        body: `Tập trung ${focusMin}/${target} phút · ${done} nhiệm vụ hoàn thành · ${dis} lần phân tâm.`,
        data: { link: '/analytics' },
        dedupeKey: `summary:${today}`,
      });
    }

    if (ns.reviewReminder !== false && near(m, parseHm('08:00'))) {
      const due = await CardModel.countDocuments({ user: uid, deletedAt: null, suspended: { $ne: true }, 'srs.due': { $lte: now } });
      if (due >= 5) {
        await notify(uid, {
          type: 'review_due',
          title: `Có ${due} thẻ cần ôn hôm nay 🧠`,
          body: 'Ôn 10 phút với Spaced Repetition để nhớ lâu hơn.',
          data: { link: '/learn' },
          dedupeKey: `review:${today}`,
        });
      }
    }
  }
}

async function taskReminders(now: Date) {
  const tasks = await TaskModel.find({
    deletedAt: null,
    status: { $in: ['todo', 'in_progress'] },
    deadline: { $gt: now, $lte: new Date(now.getTime() + 24 * 60 * 60_000) },
  })
    .select('user title deadline')
    .lean();
  if (!tasks.length) return;
  const users = new Map(
    (await UserModel.find({ _id: { $in: [...new Set(tasks.map((t) => String(t.user)))] } }).select('notificationSettings').lean()).map((u) => [String(u._id), u]),
  );
  for (const t of tasks) {
    const ns = users.get(String(t.user))?.notificationSettings;
    if (ns?.taskReminder === false) continue;
    const minutesLeft = (t.deadline!.getTime() - now.getTime()) / 60_000;
    if (minutesLeft > (ns?.taskReminderMinutes ?? 60)) continue;
    await notify(String(t.user), {
      type: 'task_reminder',
      title: '⏰ Nhiệm vụ sắp đến hạn',
      body: `"${t.title}" còn khoảng ${Math.max(1, Math.round(minutesLeft))} phút.`,
      data: { link: '/plan', taskId: String(t._id) },
      dedupeKey: `task:${t._id}:${t.deadline!.toISOString()}`,
    });
  }
}

/** Nhắc hẹn học: người dùng đặt giờ nhắc cho từng nhiệm vụ trên Lịch (Web / App) */
async function scheduledReminders(now: Date) {
  const tasks = await TaskModel.find({
    deletedAt: null,
    status: { $in: ['todo', 'in_progress'] },
    // trong cửa sổ vài phút vừa qua (bộ nhắc chạy mỗi phút; máy chủ có thể trễ một chút)
    remindAt: { $gt: new Date(now.getTime() - 10 * 60_000), $lte: now },
  })
    .select('user title remindAt estimatedMinutes')
    .lean();
  for (const t of tasks) {
    await notify(String(t.user), {
      type: 'task_reminder',
      title: '📚 Đến giờ học rồi',
      body: `"${t.title}"${t.estimatedMinutes ? ` · ${t.estimatedMinutes} phút` : ''}. Bắt đầu phiên tập trung nhé!`,
      data: { link: `/focus?task=${t._id}`, taskId: String(t._id) },
      dedupeKey: `remind:${t._id}:${t.remindAt!.toISOString()}`,
      urgent: true,
    });
  }
}

async function breakReminders(now: Date) {
  const sessions = await FocusSessionModel.find({ status: 'active', mode: 'pomodoro', deletedAt: null });
  for (const s of sessions) {
    const segs = s.segments as unknown as { type: string; startedAt: Date; endedAt?: Date | null }[];
    const lastBreak = segs.map((x) => x.type).lastIndexOf('break');
    const sinceBreak = computeFocusSeconds({ segments: segs.slice(lastBreak + 1) }, now);
    if (sinceBreak < (s.pomodoro?.focusMinutes ?? 25) * 60) continue;
    const user = await UserModel.findById(s.user).select('notificationSettings').lean();
    if (user?.notificationSettings?.breakReminder === false) continue;
    await notify(String(s.user), {
      type: 'break_reminder',
      title: 'Hết giờ tập trung 🍅',
      body: `Nghỉ ${s.pomodoro?.breakMinutes ?? 5} phút để nạp lại năng lượng.`,
      data: { link: '/focus', sessionId: s.id },
      dedupeKey: `break:${s.id}:${segs.length}`,
      urgent: true,
    });
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function tick(now = new Date()) {
  if (running) return;
  running = true;
  try {
    await Promise.all([userReminders(now), taskReminders(now), scheduledReminders(now), breakReminders(now)]);
  } catch (e) {
    console.error('[scheduler]', e);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (!env.enableScheduler || timer) return;
  timer = setInterval(() => void tick(), 60_000);
  console.log('[scheduler] Bộ nhắc lịch đã chạy (mỗi phút)');
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
