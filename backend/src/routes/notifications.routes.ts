import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, forbidden, notFound, parse } from '../utils/http';
import { NotificationModel, PushTokenModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { emitToUser } from '../services/realtime';
import { notify, pushEnabled, diagnosePush } from '../services/notifications';
import { isAdmin } from './admin.routes';

/** Phase 2 – Notification (in-app + FCM push) */
const router = Router();
router.use(requireAuth);

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

router.get(
  '/',
  ah(async (req, res) => {
    const filter: Record<string, unknown> = { user: uid(req) };
    if (req.query.unread === 'true') filter.readAt = null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [items, unread] = await Promise.all([
      NotificationModel.find(filter).sort({ createdAt: -1 }).limit(limit),
      NotificationModel.countDocuments({ user: uid(req), readAt: null }),
    ]);
    res.json({ items, unread });
  }),
);

router.get(
  '/unread-count',
  ah(async (req, res) => {
    res.json({ unread: await NotificationModel.countDocuments({ user: uid(req), readAt: null }) });
  }),
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    await NotificationModel.updateMany({ user: uid(req), readAt: null }, { readAt: new Date() });
    emitToUser(uid(req), 'notification:read', { all: true });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    const n = await NotificationModel.findOneAndUpdate({ _id: req.params.id, user: uid(req) }, { readAt: new Date() }, { new: true });
    if (!n) throw notFound();
    emitToUser(uid(req), 'notification:read', { id: n.id });
    res.json({ item: n });
  }),
);

router.post(
  '/:id/unread',
  ah(async (req, res) => {
    const n = await NotificationModel.findOneAndUpdate({ _id: req.params.id, user: uid(req) }, { readAt: null }, { new: true });
    if (!n) throw notFound();
    res.json({ item: n });
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    await NotificationModel.deleteOne({ _id: req.params.id, user: uid(req) });
    res.json({ ok: true });
  }),
);

/* ---------- Cài đặt ---------- */
const settingsSchema = z
  .object({
    studyReminder: z.boolean(),
    taskReminder: z.boolean(),
    taskReminderMinutes: z.number().int().min(5).max(1440),
    breakReminder: z.boolean(),
    dailySummary: z.boolean(),
    dailySummaryTime: hm,
    reviewReminder: z.boolean(),
    weeklyReport: z.boolean(),
    weeklyEmail: z.boolean(),
    chatMessages: z.boolean(),
    chatDuringFocus: z.boolean(),
    push: z.boolean(),
    quietStart: hm,
    quietEnd: hm,
  })
  .partial();

router.get(
  '/settings',
  ah(async (req, res) => {
    const u = await UserModel.findById(uid(req)).select('notificationSettings');
    res.json({ settings: u?.notificationSettings, pushAvailable: pushEnabled() });
  }),
);

router.put(
  '/settings',
  ah(async (req, res) => {
    const data = parse(settingsSchema, req.body);
    const $set = Object.fromEntries(Object.entries(data).map(([k, v]) => [`notificationSettings.${k}`, v]));
    const u = await UserModel.findByIdAndUpdate(uid(req), { $set }, { new: true }).select('notificationSettings');
    res.json({ settings: u?.notificationSettings });
  }),
);

/* ---------- FCM token (Mobile) ---------- */
router.post(
  '/push-token',
  ah(async (req, res) => {
    const { token, platform } = parse(z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android', 'ios', 'web']).default('android') }), req.body);
    await PushTokenModel.findOneAndUpdate({ token }, { user: uid(req), platform, lastSeenAt: new Date() }, { upsert: true });
    res.json({ ok: true });
  }),
);

router.delete(
  '/push-token',
  ah(async (req, res) => {
    const { token } = parse(z.object({ token: z.string() }), req.body);
    await PushTokenModel.deleteOne({ token, user: uid(req) });
    res.json({ ok: true });
  }),
);

/* POST /notifications/push-check — chẩn đoán thông báo đẩy tới điện thoại */
router.post(
  '/push-check',
  ah(async (req, res) => {
    if (!(await isAdmin(uid(req)))) throw forbidden('Chỉ quản trị viên mới dùng được công cụ này');
    res.json(await diagnosePush(uid(req)));
  }),
);

/* POST /notifications/test — gửi thử */
router.post(
  '/test',
  ah(async (req, res) => {
    if (!(await isAdmin(uid(req)))) throw forbidden('Chỉ quản trị viên mới gửi được thông báo thử');
    const n = await notify(uid(req), {
      type: 'system',
      title: 'FOCUSLY đã sẵn sàng 🔔',
      body: 'Đây là thông báo thử nghiệm.',
      dedupeKey: `test:${Date.now()}`,
      urgent: true,
    });
    res.json({ item: n, pushAvailable: pushEnabled() });
  }),
);

export default router;
