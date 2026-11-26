import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import { UserModel } from '../models/User';
import { AuthSessionModel } from '../models/AuthSession';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, notFound, parse, unauthorized } from '../utils/http';
import { removeStored, storeAvatar } from '../services/storage';
import { notifyChange } from '../services/realtime';
import { safeTimeZone } from '../utils/time';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(badRequest('Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP'));
  },
});

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Định dạng HH:mm');

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  profile: z
    .object({
      learningGoal: z.string().max(500).optional(),
      interestedSubjects: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
      preferredStudyTimes: z.array(z.object({ start: hm, end: hm })).max(10).optional(),
      dailyTargetMinutes: z.number().int().min(0).max(1440).optional(),
      timezone: z.string().max(60).optional(),
      language: z.enum(['vi', 'en']).optional(),
      defaultPomodoro: z
        .object({
          focusMinutes: z.number().int().min(1).max(180),
          breakMinutes: z.number().int().min(1).max(60),
          longBreakMinutes: z.number().int().min(1).max(90),
          cyclesBeforeLongBreak: z.number().int().min(1).max(12),
        })
        .partial()
        .optional(),
    })
    .optional(),
});

async function publicUser(userId: string) {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user) throw notFound('Không tìm thấy người dùng');
  return { ...user.toJSON(), hasPassword: Boolean(user.passwordHash) };
}

/* GET /users/me */
router.get(
  '/me',
  ah(async (req, res) => {
    res.json({ user: await publicUser(uid(req)) });
  }),
);

/* PATCH /users/me — hồ sơ + sở thích học tập */
router.patch(
  '/me',
  ah(async (req, res) => {
    const data = parse(profileSchema, req.body);
    const $set: Record<string, unknown> = {};
    if (data.name) $set.name = data.name;
    if (data.profile) {
      for (const [k, v] of Object.entries(data.profile)) {
        if (v === undefined) continue;
        if (k === 'timezone') $set['profile.timezone'] = safeTimeZone(v as string);
        else if (k === 'defaultPomodoro') {
          for (const [pk, pv] of Object.entries(v as object)) $set[`profile.defaultPomodoro.${pk}`] = pv;
        } else $set[`profile.${k}`] = v;
      }
    }
    await UserModel.updateOne({ _id: uid(req) }, { $set });
    const user = await publicUser(uid(req));
    notifyChange(uid(req), 'user', 'update', user);
    res.json({ user });
  }),
);

/* POST /users/me/avatar (multipart field "avatar") */
router.post(
  '/me/avatar',
  upload.single('avatar'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Thiếu file ảnh (field "avatar")');
    const current = await UserModel.findById(uid(req)).select('+avatarPublicId');
    if (!current) throw notFound();
    const stored = await storeAvatar(req.file.buffer, req.file.mimetype, uid(req));
    await removeStored(current.avatarPublicId);
    await UserModel.updateOne({ _id: uid(req) }, { avatarUrl: stored.url, avatarPublicId: stored.publicId });
    const user = await publicUser(uid(req));
    notifyChange(uid(req), 'user', 'update', user);
    res.json({ user });
  }),
);

/* DELETE /users/me/avatar */
router.delete(
  '/me/avatar',
  ah(async (req, res) => {
    const current = await UserModel.findById(uid(req)).select('+avatarPublicId');
    await removeStored(current?.avatarPublicId);
    await UserModel.updateOne({ _id: uid(req) }, { avatarUrl: null, avatarPublicId: null });
    res.json({ user: await publicUser(uid(req)) });
  }),
);

/* POST /users/me/change-password { currentPassword?, newPassword } */
router.post(
  '/me/change-password',
  ah(async (req, res) => {
    const data = parse(
      z.object({
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/[0-9]/),
        logoutOtherDevices: z.boolean().default(true),
      }),
      req.body,
    );
    const user = await UserModel.findById(uid(req)).select('+passwordHash');
    if (!user) throw notFound();
    // Tài khoản Google chưa có mật khẩu được đặt mật khẩu lần đầu
    if (user.passwordHash) {
      if (!data.currentPassword || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
        throw unauthorized('Mật khẩu hiện tại không đúng');
      }
    }
    user.passwordHash = await bcrypt.hash(data.newPassword, 12);
    user.passwordChangedAt = new Date();
    await user.save();
    if (data.logoutOtherDevices) {
      await AuthSessionModel.updateMany(
        { user: user._id, _id: { $ne: req.authSessionId }, revokedAt: null },
        { revokedAt: new Date() },
      );
    }
    res.json({ ok: true });
  }),
);

/* GET /users/me/sessions — danh sách phiên đăng nhập */
router.get(
  '/me/sessions',
  ah(async (req, res) => {
    const sessions = await AuthSessionModel.find({
      user: uid(req),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ lastUsedAt: -1 });
    res.json({
      sessions: sessions.map((s) => ({ ...s.toJSON(), current: s.id === req.authSessionId })),
    });
  }),
);

/* DELETE /users/me/sessions/:id — đăng xuất 1 thiết bị */
router.delete(
  '/me/sessions/:id',
  ah(async (req, res) => {
    await AuthSessionModel.updateOne({ _id: req.params.id, user: uid(req) }, { revokedAt: new Date() });
    res.json({ ok: true });
  }),
);

/* DELETE /users/me/sessions — đăng xuất tất cả thiết bị khác */
router.delete(
  '/me/sessions',
  ah(async (req, res) => {
    const r = await AuthSessionModel.updateMany(
      { user: uid(req), _id: { $ne: req.authSessionId }, revokedAt: null },
      { revokedAt: new Date() },
    );
    res.json({ ok: true, revoked: r.modifiedCount });
  }),
);

export default router;
