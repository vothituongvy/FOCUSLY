import { Router } from 'express';
import { requireAuth, uid } from '../middleware/auth';
import { ah, forbidden } from '../utils/http';
import { UsageDayModel } from '../models/Social';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { CardModel, DeckModel, MaterialModel, QuizAttemptModel, QuizModel, ReviewLogModel } from '../models/Learn';
import { AIUsageModel } from '../models/AI';
import { ChatMessageModel, ChatModel, ClassModel, ExamModel, RoomModel } from '../models/Social';
import type { Model } from 'mongoose';
import { dayKey, lastDayKeys } from '../utils/time';
import { sentryEnabled } from '../services/sentry';

/**
 * Số liệu sử dụng cho người quản trị (email trong ADMIN_EMAILS, cách nhau dấu phẩy):
 * người dùng hoạt động mỗi ngày, tính năng hay dùng, nền tảng, phễu người dùng mới.
 */
const router = Router();
router.use(requireAuth);

const ADMINS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export async function isAdmin(userId: string) {
  if (!ADMINS.length) return false;
  const u = await UserModel.findById(userId).select('email').lean();
  return !!u && ADMINS.includes(u.email.toLowerCase());
}

router.get(
  '/me',
  ah(async (req, res) => {
    res.json({ admin: await isAdmin(uid(req)) });
  }),
);

router.get(
  '/metrics',
  ah(async (req, res) => {
    if (!(await isAdmin(uid(req)))) throw forbidden('Chỉ quản trị viên (ADMIN_EMAILS) mới xem được');
    const TZ = 'Asia/Ho_Chi_Minh';
    const now = new Date();
    const days30 = lastDayKeys(30, TZ, now);
    const usage = await UsageDayModel.find({ day: { $gte: days30[0] } }).lean();

    const dauMap = new Map<string, Set<string>>();
    for (const u of usage) {
      if (!dauMap.has(u.day)) dauMap.set(u.day, new Set());
      dauMap.get(u.day)!.add(String(u.user));
    }
    const dau = days30.map((d) => ({ day: d, users: dauMap.get(d)?.size ?? 0 }));
    const uniq = (ds: string[]) => new Set(usage.filter((u) => ds.includes(u.day)).map((u) => String(u.user))).size;
    const last7 = days30.slice(-7);

    const featureUsers = new Map<string, Set<string>>();
    const platformUsers = new Map<string, Set<string>>();
    for (const u of usage.filter((x) => last7.includes(x.day))) {
      for (const f of u.features) (featureUsers.get(f) ?? featureUsers.set(f, new Set()).get(f)!).add(String(u.user));
      for (const p of u.platforms) (platformUsers.get(p) ?? platformUsers.set(p, new Set()).get(p)!).add(String(u.user));
    }
    const toList = (m: Map<string, Set<string>>) => [...m].map(([k, v]) => ({ key: k, users: v.size })).sort((a, b) => b.users - a.users);

    // Phễu người dùng mới (đăng ký trong 30 ngày)
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const newUsers = await UserModel.find({ createdAt: { $gte: since } }).select('_id createdAt').lean();
    const ids = newUsers.map((u) => u._id);
    const [focused, decks, quizzes, totalUsers] = await Promise.all([
      FocusSessionModel.distinct('user', { user: { $in: ids }, deletedAt: null }),
      DeckModel.distinct('user', { user: { $in: ids }, deletedAt: null }),
      QuizModel.distinct('user', { user: { $in: ids }, deletedAt: null }),
      UserModel.estimatedDocumentCount(),
    ]);
    const learned = new Set([...decks, ...quizzes].map(String));
    const allUsage = await UsageDayModel.find({ user: { $in: ids } }).select('user day').lean();
    const daysByUser = new Map<string, Set<string>>();
    for (const u of allUsage) (daysByUser.get(String(u.user)) ?? daysByUser.set(String(u.user), new Set()).get(String(u.user))!).add(u.day);
    let returned = 0;
    let day7 = 0;
    let day7Eligible = 0;
    for (const u of newUsers) {
      const created = (u as { createdAt?: Date }).createdAt ?? now;
      const signupDay = dayKey(created, TZ);
      const ds = [...(daysByUser.get(String(u._id)) ?? [])];
      if (ds.some((d) => d > signupDay)) returned++;
      if (now.getTime() - created.getTime() >= 7 * 86_400_000) {
        day7Eligible++;
        const d7 = dayKey(new Date(created.getTime() + 7 * 86_400_000), TZ);
        if (ds.some((d) => d >= d7)) day7++;
      }
    }
    const signups = days30.map((d) => ({ day: d, users: newUsers.filter((u) => dayKey((u as { createdAt?: Date }).createdAt ?? now, TZ) === d).length }));

    // Hoạt động theo ngày (giờ VN): phút tập trung, phiên, lượt ôn thẻ, bài quiz, tin nhắn, lượt hỏi AI
    const byDay = async (model: Model<any>, dateField: string, match: Record<string, unknown> = {}, sumField?: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows = await model.aggregate<{ _id: string; n: number }>([
        { $match: { ...match, [dateField]: { $gte: new Date(now.getTime() - 31 * 86_400_000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: TZ } }, n: sumField ? { $sum: `$${sumField}` } : { $sum: 1 } } },
      ]);
      const m = new Map(rows.map((r) => [r._id, r.n]));
      return days30.map((d) => m.get(d) ?? 0);
    };
    const [focusSec, sessionsN, reviewsN, quizN, msgN, aiN] = await Promise.all([
      byDay(FocusSessionModel, 'startedAt', { deletedAt: null }, 'actualFocusSeconds'),
      byDay(FocusSessionModel, 'startedAt', { deletedAt: null }),
      byDay(ReviewLogModel, 'reviewedAt'),
      byDay(QuizAttemptModel, 'completedAt', { deletedAt: null }),
      byDay(ChatMessageModel, 'createdAt', { deletedAt: null, sender: { $ne: null } }),
      byDay(AIUsageModel, 'createdAt'),
    ]);
    const activity = days30.map((day, i) => ({
      day,
      focusMinutes: Math.round(focusSec[i] / 60),
      sessions: sessionsN[i],
      reviews: reviewsN[i],
      quizzes: quizN[i],
      messages: msgN[i],
      ai: aiN[i],
      dau: dau[i]?.users ?? 0,
      signups: signups[i]?.users ?? 0,
    }));

    // Tổng nội dung trên hệ thống
    const [decksN, cardsN, quizzesN, materialsN, examsN, roomsN, classesN, groupsN, messagesN, publicN] = await Promise.all([
      DeckModel.countDocuments({ deletedAt: null }),
      CardModel.countDocuments({ deletedAt: null }),
      QuizModel.countDocuments({ deletedAt: null }),
      MaterialModel.countDocuments({ deletedAt: null }),
      ExamModel.countDocuments({ deletedAt: null }),
      RoomModel.countDocuments({ deletedAt: null }),
      ClassModel.countDocuments({ deletedAt: null }),
      ChatModel.countDocuments({ deletedAt: null, type: 'group' }),
      ChatMessageModel.countDocuments({ deletedAt: null, sender: { $ne: null } }),
      Promise.all([DeckModel, QuizModel, MaterialModel].map((mm) => (mm as unknown as Model<unknown>).countDocuments({ deletedAt: null, isPublic: true }))).then((x) => x.reduce((a, b) => a + b, 0)),
    ]);
    const sum = (k: 'focusMinutes' | 'sessions' | 'reviews' | 'quizzes' | 'messages' | 'ai', from: number) => activity.slice(from).reduce((a, r) => a + r[k], 0);

    res.json({
      totals: { users: totalUsers, dau: dau[dau.length - 1]?.users ?? 0, wau: uniq(last7), mau: uniq(days30) },
      activity,
      week: {
        focusMinutes: sum('focusMinutes', 23),
        prevFocusMinutes: activity.slice(16, 23).reduce((a, r) => a + r.focusMinutes, 0),
        sessions: sum('sessions', 23),
        reviews: sum('reviews', 23),
        quizzes: sum('quizzes', 23),
        messages: sum('messages', 23),
        ai: sum('ai', 23),
        signups: activity.slice(23).reduce((a, r) => a + r.signups, 0),
      },
      content: { decks: decksN, cards: cardsN, quizzes: quizzesN, materials: materialsN, exams: examsN, rooms: roomsN, classes: classesN, groups: groupsN, messages: messagesN, shared: publicN },
      dau,
      signups,
      features: toList(featureUsers),
      platforms: toList(platformUsers),
      funnel: [
        { step: 'Đăng ký (30 ngày)', users: newUsers.length },
        { step: 'Có phiên tập trung', users: focused.length },
        { step: 'Tạo bộ thẻ / câu hỏi', users: learned.size },
        { step: 'Quay lại ngày khác', users: returned },
        { step: 'Còn dùng sau 7 ngày', users: day7, of: day7Eligible },
      ],
      sentry: sentryEnabled(),
    });
  }),
);

export default router;
