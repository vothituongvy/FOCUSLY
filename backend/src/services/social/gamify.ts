import { Types } from 'mongoose';
import { FocusSessionModel } from '../../models/FocusSession';
import { GamifyModel } from '../../models/Social';
import { CardModel, QuizAttemptModel, ReviewLogModel } from '../../models/Learn';
import { TaskModel } from '../../models/Learning';
import { UserModel } from '../../models/User';
import { computeFocusSeconds } from '../sessions';
import { dayKey, lastDayKeys, safeTimeZone, wideRange } from '../../utils/time';
import { computeStreak, daysToFreeze, freezeReward, levelOf } from './logic';

export const STREAK_MIN_SECONDS = 10 * 60;

/** Giây tập trung theo ngày (giờ địa phương) trong N ngày gần nhất */
export async function focusByDay(userId: string, tz: string, days: number, now = new Date()) {
  const ss = await FocusSessionModel.find({ user: userId, deletedAt: null, startedAt: { $gte: new Date(now.getTime() - (days + 1) * 86_400_000) } })
    .select('startedAt actualFocusSeconds status segments')
    .lean();
  const map = new Map<string, number>();
  for (const s of ss) {
    const k = dayKey(s.startedAt, tz);
    const open = ['active', 'paused', 'on_break'].includes(s.status);
    map.set(k, (map.get(k) ?? 0) + (open ? computeFocusSeconds(s, now) : s.actualFocusSeconds));
  }
  return map;
}

const QUEST_XP = { focus: 20, cards: 15, task: 15, quiz: 15, all: 30 } as const;

/** Trạng thái streak + nhiệm vụ hôm nay; tự dùng thẻ đóng băng và cộng XP khi cần */
export async function gamifyStatus(userId: string, now = new Date()) {
  const user = await UserModel.findById(userId).select('profile.timezone profile.dailyTargetMinutes').lean();
  const tz = safeTimeZone(user?.profile?.timezone);
  const target = user?.profile?.dailyTargetMinutes ?? 120;
  const g = (await GamifyModel.findOne({ user: userId })) ?? (await GamifyModel.create({ user: userId }));
  const byDay = await focusByDay(userId, tz, 366, now);
  const days = lastDayKeys(366, tz, now).reverse();
  const today = days[0];
  const qualified = new Set([...byDay].filter(([, s]) => s >= STREAK_MIN_SECONDS).map(([d]) => d));
  const frozen = new Set(g.frozenDays);

  // 1) dùng thẻ đóng băng cho các ngày lỡ gần nhất (nếu đủ thẻ)
  const toFreeze = daysToFreeze(days, qualified, frozen, g.freezes);
  let usedFreeze: string[] = [];
  if (toFreeze.length) {
    toFreeze.forEach((d) => frozen.add(d));
    g.frozenDays = [...frozen].sort().slice(-60);
    g.freezes -= toFreeze.length;
    usedFreeze = toFreeze;
  }
  const streak = computeStreak(days, qualified, frozen);

  // 2) thưởng thẻ đóng băng theo mốc 7 ngày
  const reward = freezeReward(streak.current, g.lastRewardStreak, g.freezes);
  g.freezes = reward.freezes;
  g.lastRewardStreak = reward.lastRewardStreak;

  // 3) nhiệm vụ hôm nay
  const r = wideRange(1, now);
  const todayMin = Math.round((byDay.get(today) ?? 0) / 60);
  const hasCards = await CardModel.exists({ user: userId, deletedAt: null });
  const [reviews, attempts, tasksDone] = await Promise.all([
    ReviewLogModel.find({ user: userId, reviewedAt: { $gte: r.from } }).select('reviewedAt').lean(),
    QuizAttemptModel.find({ user: userId, deletedAt: null, completedAt: { $gte: r.from } }).select('completedAt').lean(),
    TaskModel.find({ user: userId, deletedAt: null, completedAt: { $gte: r.from } }).select('completedAt').lean(),
  ]);
  const cnt = (xs: { at: Date | null | undefined }[]) => xs.filter((x) => x.at && dayKey(x.at, tz) === today).length;
  const focusGoal = Math.min(60, Math.max(25, Math.round(target / 2 / 5) * 5));
  const dayNo = Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 86_400_000);
  const third = dayNo % 2 === 0 ? 'quiz' : 'task';
  const quests = [
    { id: 'focus', title: `Tập trung ${focusGoal} phút`, progress: todayMin, target: focusGoal, xp: QUEST_XP.focus, link: '/focus' },
    hasCards
      ? { id: 'cards', title: 'Ôn 10 flashcard', progress: cnt(reviews.map((x) => ({ at: x.reviewedAt }))), target: 10, xp: QUEST_XP.cards, link: '/learn/review' }
      : { id: 'task', title: 'Hoàn thành 1 nhiệm vụ', progress: cnt(tasksDone.map((x) => ({ at: x.completedAt }))), target: 1, xp: QUEST_XP.task, link: '/plan' },
    third === 'quiz' || !hasCards
      ? { id: 'quiz', title: 'Làm 1 bộ câu hỏi', progress: cnt(attempts.map((x) => ({ at: x.completedAt }))), target: 1, xp: QUEST_XP.quiz, link: '/learn' }
      : { id: 'task', title: 'Hoàn thành 1 nhiệm vụ', progress: cnt(tasksDone.map((x) => ({ at: x.completedAt }))), target: 1, xp: QUEST_XP.task, link: '/plan' },
  ].map((q) => ({ ...q, progress: Math.min(q.progress, q.target), done: q.progress >= q.target }));

  // 4) cộng XP cho nhiệm vụ mới hoàn thành (ghi nhận 1 lần/ngày)
  const doneMap: Record<string, string[]> = { ...(g.questsDone as Record<string, string[]>) };
  const before = new Set(doneMap[today] ?? []);
  let gained = 0;
  for (const q of quests) if (q.done && !before.has(q.id)) {
    before.add(q.id);
    gained += q.xp;
  }
  if (quests.every((q) => q.done) && !before.has('all')) {
    before.add('all');
    gained += QUEST_XP.all;
  }
  if (gained || before.size !== (doneMap[today] ?? []).length) {
    doneMap[today] = [...before];
    // chỉ giữ 14 ngày gần nhất
    for (const k of Object.keys(doneMap).sort().slice(0, -14)) delete doneMap[k];
    g.questsDone = doneMap;
    g.markModified('questsDone');
    g.xp += gained;
  }
  await g.save();

  return {
    streak: { ...streak, minMinutesPerDay: STREAK_MIN_SECONDS / 60, frozenDays: g.frozenDays.slice(-14), usedFreeze },
    freezes: g.freezes,
    nextFreezeIn: 7 - (streak.current % 7),
    quests,
    allDoneBonus: QUEST_XP.all,
    xp: g.xp,
    gained,
    ...levelOf(g.xp),
  };
}

/** Streak hiện tại (không ghi DB) – dùng cho bảng xếp hạng / báo cáo */
export async function quickStreak(userId: string | Types.ObjectId, tz: string, now = new Date()) {
  const g = await GamifyModel.findOne({ user: userId }).select('frozenDays').lean();
  const byDay = await focusByDay(String(userId), tz, 120, now);
  const days = lastDayKeys(120, tz, now).reverse();
  const qualified = new Set([...byDay].filter(([, s]) => s >= STREAK_MIN_SECONDS).map(([d]) => d));
  return computeStreak(days, qualified, new Set(g?.frozenDays ?? [])).current;
}
