import { Router } from 'express';
import { requireAuth, uid } from '../middleware/auth';
import { ah, forbidden } from '../utils/http';
import { UsageDayModel } from '../models/Social';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { DeckModel, QuizModel } from '../models/Learn';
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

    res.json({
      totals: { users: totalUsers, dau: dau[dau.length - 1]?.users ?? 0, wau: uniq(last7), mau: uniq(days30) },
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
