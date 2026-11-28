import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, forbidden, notFound, parse } from '../utils/http';
import { UsageDayModel } from '../models/Social';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { CardModel, DeckModel, MaterialModel, QuizAttemptModel, QuizModel, ReviewLogModel } from '../models/Learn';
import { AIUsageModel } from '../models/AI';
import { ChatMessageModel, ChatModel, ClassModel, ExamModel, FEEDBACK_STATUSES, FeedbackModel, RoomModel } from '../models/Social';
import { AuthSessionModel } from '../models/AuthSession';
import { notify } from '../services/notifications';
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

/** id các tài khoản quản trị (để gửi thông báo cho admin) */
export async function adminIds(): Promise<string[]> {
  if (!ADMINS.length) return [];
  return (await UserModel.find({ email: { $in: ADMINS } }).select('_id').lean()).map((u) => String(u._id));
}

/** Chặn mọi route quản trị nếu không phải admin */
const requireAdmin: RequestHandler = (req, _res, next) => {
  isAdmin(uid(req))
    .then((ok) => next(ok ? undefined : forbidden('Chỉ quản trị viên mới dùng được chức năng này')))
    .catch(next);
};

router.get(
  '/me',
  ah(async (req, res) => {
    res.json({ admin: await isAdmin(uid(req)) });
  }),
);

router.get(
  '/metrics',
  requireAdmin,
  ah(async (req, res) => {
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


/* ======================= Quản lý (chỉ admin) ======================= */
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tóm tắt nhanh cho màn hình quản trị trên app */
router.get(
  '/summary',
  requireAdmin,
  ah(async (_req, res) => {
    const day = dayKey(new Date(), 'Asia/Ho_Chi_Minh');
    const [users, dau, newFeedback, open, disabled] = await Promise.all([
      UserModel.estimatedDocumentCount(),
      UsageDayModel.countDocuments({ day }),
      FeedbackModel.countDocuments({ status: 'new' }),
      FeedbackModel.countDocuments({ status: { $in: ['new', 'in_progress'] } }),
      UserModel.countDocuments({ disabledAt: { $ne: null } }),
    ]);
    res.json({ users, dau, newFeedback, openFeedback: open, disabledUsers: disabled });
  }),
);

/* ---------- Góp ý & báo lỗi ---------- */
router.get(
  '/feedback',
  requireAdmin,
  ah(async (req, res) => {
    const q = parse(z.object({ status: z.enum([...FEEDBACK_STATUSES, 'open', 'all']).default('open'), type: z.enum(['bug', 'idea', 'other', 'all']).default('all') }), req.query);
    const filter: Record<string, unknown> = {};
    if (q.status === 'open') filter.status = { $in: ['new', 'in_progress'] };
    else if (q.status !== 'all') filter.status = q.status;
    if (q.type !== 'all') filter.type = q.type;
    const items = await FeedbackModel.find(filter).sort({ createdAt: -1 }).limit(200).populate('user', 'name email avatarUrl').lean();
    const counts = await FeedbackModel.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    res.json({
      items: items.map((f) => ({ ...f, id: String(f._id), _id: undefined, user: f.user ? { id: String((f.user as { _id: unknown })._id), name: (f.user as { name?: string }).name, email: (f.user as { email?: string }).email } : null })),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  }),
);

router.patch(
  '/feedback/:id',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(
      z.object({
        status: z.enum(FEEDBACK_STATUSES).optional(),
        reply: z.string().max(2000).optional(),
        adminNote: z.string().max(2000).optional(),
        /** gửi thông báo cho người gửi góp ý */
        notifyUser: z.boolean().default(false),
      }),
      req.body,
    );
    const f = await FeedbackModel.findById(req.params.id);
    if (!f) throw notFound();
    if (data.status) {
      f.status = data.status;
      f.resolvedAt = data.status === 'fixed' || data.status === 'wontfix' ? new Date() : null;
    }
    if (data.reply !== undefined) f.reply = data.reply;
    if (data.adminNote !== undefined) f.adminNote = data.adminNote;
    if (data.notifyUser) {
      const title =
        f.status === 'fixed'
          ? '✅ Lỗi bạn báo đã được sửa'
          : f.status === 'in_progress'
            ? '🛠 Góp ý của bạn đang được xử lý'
            : f.status === 'wontfix'
              ? 'Phản hồi về góp ý của bạn'
              : 'FOCUSLY đã nhận góp ý của bạn';
      await notify(String(f.user), {
        type: 'system',
        title,
        body: f.reply || `“${f.message.slice(0, 100)}”`,
        data: { link: '/feedback' },
        dedupeKey: `fbn:${f.id}:${f.status}:${Date.now()}`,
      });
      f.notifiedAt = new Date();
    }
    await f.save();
    res.json({ item: f.toJSON() });
  }),
);

/* ---------- Người dùng ---------- */
router.get(
  '/users',
  requireAdmin,
  ah(async (req, res) => {
    const q = parse(z.object({ q: z.string().trim().max(100).optional(), status: z.enum(['all', 'disabled']).default('all'), page: z.coerce.number().int().min(1).max(500).default(1) }), req.query);
    const filter: Record<string, unknown> = {};
    if (q.q) filter.$or = [{ name: new RegExp(esc(q.q), 'i') }, { email: new RegExp(esc(q.q), 'i') }];
    if (q.status === 'disabled') filter.disabledAt = { $ne: null };
    const [items, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * 30).limit(30).select('name email avatarUrl createdAt disabledAt disabledReason googleId').lean(),
      UserModel.countDocuments(filter),
    ]);
    const ids = items.map((u) => u._id);
    const last = await UsageDayModel.aggregate<{ _id: unknown; day: string }>([{ $match: { user: { $in: ids } } }, { $group: { _id: '$user', day: { $max: '$day' } } }]);
    const lastBy = new Map(last.map((l) => [String(l._id), l.day]));
    res.json({
      total,
      items: items.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        createdAt: (u as { createdAt?: Date }).createdAt,
        lastActive: lastBy.get(String(u._id)) ?? null,
        disabled: Boolean(u.disabledAt),
        disabledReason: u.disabledReason,
        google: Boolean(u.googleId),
        admin: ADMINS.includes(u.email.toLowerCase()),
      })),
    });
  }),
);

router.get(
  '/users/:id',
  requireAdmin,
  ah(async (req, res) => {
    const u = await UserModel.findById(req.params.id).select('name email avatarUrl createdAt disabledAt disabledReason').lean();
    if (!u) throw notFound();
    const id = u._id;
    const [sessions, focus, decks, quizzes, materials, feedback, days] = await Promise.all([
      FocusSessionModel.countDocuments({ user: id, deletedAt: null }),
      FocusSessionModel.aggregate<{ s: number }>([{ $match: { user: id, deletedAt: null } }, { $group: { _id: null, s: { $sum: '$actualFocusSeconds' } } }]),
      DeckModel.countDocuments({ user: id, deletedAt: null }),
      QuizModel.countDocuments({ user: id, deletedAt: null }),
      MaterialModel.countDocuments({ user: id, deletedAt: null }),
      FeedbackModel.countDocuments({ user: id }),
      UsageDayModel.countDocuments({ user: id }),
    ]);
    res.json({
      item: { id: String(u._id), name: u.name, email: u.email, avatarUrl: u.avatarUrl, createdAt: (u as { createdAt?: Date }).createdAt, disabled: Boolean(u.disabledAt), disabledReason: u.disabledReason },
      stats: { sessions, focusMinutes: Math.round((focus[0]?.s ?? 0) / 60), decks, quizzes, materials, feedback, activeDays: days },
    });
  }),
);

/** Khoá / mở khoá tài khoản */
router.patch(
  '/users/:id',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(z.object({ disabled: z.boolean(), reason: z.string().max(300).default('') }), req.body);
    const u = await UserModel.findById(req.params.id);
    if (!u) throw notFound();
    if (ADMINS.includes(u.email.toLowerCase())) throw badRequest('Không khoá được tài khoản quản trị');
    u.set({ disabledAt: data.disabled ? new Date() : null, disabledReason: data.disabled ? data.reason : '' });
    await u.save();
    // khoá: đăng xuất mọi thiết bị
    if (data.disabled) await AuthSessionModel.updateMany({ user: u._id, revokedAt: null }, { revokedAt: new Date() });
    res.json({ ok: true, disabled: data.disabled });
  }),
);

/* ---------- Kiểm duyệt Thư viện cộng đồng ---------- */
const libModel = (k: string) => (k === 'deck' ? DeckModel : k === 'quiz' ? QuizModel : MaterialModel) as unknown as typeof DeckModel;

router.get(
  '/library',
  requireAdmin,
  ah(async (req, res) => {
    const kind = parse(z.enum(['deck', 'quiz', 'material']).default('deck'), req.query.kind);
    const items = await libModel(kind).find({ isPublic: true, deletedAt: null }).sort({ publishedAt: -1 }).limit(200).select('title description authorName copies itemCount publishedAt user').lean();
    res.json({ items: items.map((i) => ({ id: String(i._id), title: i.title, description: i.description, authorName: i.authorName, copies: i.copies, itemCount: i.itemCount, publishedAt: i.publishedAt, userId: String(i.user) })) });
  }),
);

router.post(
  '/library/:kind/:id/unpublish',
  requireAdmin,
  ah(async (req, res) => {
    const kind = parse(z.enum(['deck', 'quiz', 'material']), req.params.kind);
    const { reason } = parse(z.object({ reason: z.string().max(300).default('') }), req.body ?? {});
    const doc = await libModel(kind).findById(req.params.id);
    if (!doc) throw notFound();
    doc.set({ isPublic: false });
    await doc.save();
    await notify(String(doc.user), {
      type: 'system',
      title: `“${doc.title}” đã bị gỡ khỏi Thư viện cộng đồng`,
      body: reason || 'Nội dung không phù hợp với quy định chia sẻ. Bản của bạn vẫn còn nguyên trong tài khoản.',
      data: { link: '/library' },
    }).catch(() => undefined);
    res.json({ ok: true });
  }),
);

/* ---------- Gửi thông báo tới mọi người ---------- */
router.post(
  '/broadcast',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(
      z.object({
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().max(500).default(''),
        link: z.string().max(200).default(''),
        audience: z.enum(['all', 'active30']).default('all'),
      }),
      req.body,
    );
    let ids: string[];
    if (data.audience === 'active30') {
      const since = lastDayKeys(30, 'Asia/Ho_Chi_Minh')[0];
      ids = (await UsageDayModel.distinct('user', { day: { $gte: since } })).map(String);
    } else {
      ids = (await UserModel.find({ disabledAt: null }).select('_id').lean()).map((u) => String(u._id));
    }
    const key = `bc:${Date.now()}`;
    // gửi dần trong nền để không giữ request lâu
    void (async () => {
      for (const id of ids) await notify(id, { type: 'system', title: data.title, body: data.body, data: data.link ? { link: data.link } : {}, dedupeKey: `${key}:${id}` }).catch(() => undefined);
    })();
    res.json({ ok: true, recipients: ids.length });
  }),
);

export default router;
