import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../config/env';
import { UserModel } from '../models/User';
import { AuthSessionModel } from '../models/AuthSession';
import { ah, badRequest, conflict, parse, unauthorized } from '../utils/http';
import { issueTokens, randomToken, revokeRefreshToken, rotateRefreshToken, sha256 } from '../services/tokens';
import { resetPasswordEmail, sendMail } from '../services/mail';
import { requireAuth, uid } from '../middleware/auth';

const router = Router();
const googleClient = new OAuth2Client();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });

const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128)
  .regex(/[A-Za-z]/, 'Mật khẩu cần có chữ')
  .regex(/[0-9]/, 'Mật khẩu cần có số');

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  timezone: z.string().optional(),
  language: z.enum(['vi', 'en']).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/* POST /auth/register */
router.post(
  '/register',
  authLimiter,
  ah(async (req, res) => {
    const data = parse(registerSchema, req.body);
    if (await UserModel.exists({ email: data.email })) throw conflict('Email đã được sử dụng');
    const user = await UserModel.create({
      email: data.email,
      name: data.name,
      passwordHash: await bcrypt.hash(data.password, 12),
      profile: {
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.language ? { language: data.language } : {}),
      },
    });
    const tokens = await issueTokens(user.id, req);
    res.status(201).json({ user, ...tokens });
  }),
);

/* POST /auth/login */
router.post(
  '/login',
  authLimiter,
  ah(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await UserModel.findOne({ email }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('Email hoặc mật khẩu không đúng');
    }
    const tokens = await issueTokens(user.id, req);
    res.json({ user: user.toJSON(), ...tokens });
  }),
);

/* POST /auth/google  { idToken } — dùng chung cho Web (GIS) và Mobile (Google Sign-In) */
router.post(
  '/google',
  authLimiter,
  ah(async (req, res) => {
    const { idToken } = parse(z.object({ idToken: z.string().min(10) }), req.body);
    if (env.googleClientIds.length === 0) throw badRequest('Server chưa cấu hình GOOGLE_CLIENT_IDS');
    const ticket = await googleClient
      .verifyIdToken({ idToken, audience: env.googleClientIds })
      .catch(() => {
        throw unauthorized('Google token không hợp lệ');
      });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) throw unauthorized('Email Google chưa được xác minh');

    let user = await UserModel.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email.toLowerCase() }] });
    if (!user) {
      user = await UserModel.create({
        email: payload.email.toLowerCase(),
        name: payload.name ?? payload.email.split('@')[0],
        googleId: payload.sub,
        avatarUrl: payload.picture ?? null,
      });
    } else if (!user.googleId) {
      user.googleId = payload.sub; // liên kết tài khoản email sẵn có
      if (!user.avatarUrl && payload.picture) user.avatarUrl = payload.picture;
      await user.save();
    }
    const tokens = await issueTokens(user.id, req);
    res.json({ user, ...tokens });
  }),
);

/* POST /auth/refresh { refreshToken } */
router.post(
  '/refresh',
  ah(async (req, res) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    const { userId: _u, ...tokens } = await rotateRefreshToken(refreshToken);
    res.json(tokens);
  }),
);

/* POST /auth/logout { refreshToken } */
router.post(
  '/logout',
  ah(async (req, res) => {
    const body = z.object({ refreshToken: z.string().optional() }).safeParse(req.body);
    if (body.success && body.data.refreshToken) await revokeRefreshToken(body.data.refreshToken);
    res.json({ ok: true });
  }),
);

/* POST /auth/forgot-password { email } — luôn trả ok để không lộ email tồn tại hay không */
router.post(
  '/forgot-password',
  authLimiter,
  ah(async (req, res) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
    const user = await UserModel.findOne({ email });
    if (user) {
      const token = randomToken(32);
      await UserModel.updateOne(
        { _id: user._id },
        { resetPasswordTokenHash: sha256(token), resetPasswordExpires: new Date(Date.now() + 30 * 60 * 1000) },
      );
      const link = `${env.webUrl}/reset-password?token=${token}`;
      await sendMail(user.email, 'FOCUSLY – Đặt lại mật khẩu', resetPasswordEmail(user.name, link));
    }
    res.json({ ok: true, message: 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi.' });
  }),
);

/* POST /auth/reset-password { token, password } */
router.post(
  '/reset-password',
  authLimiter,
  ah(async (req, res) => {
    const { token, password } = parse(z.object({ token: z.string().min(10), password: passwordSchema }), req.body);
    const user = await UserModel.findOne({
      resetPasswordTokenHash: sha256(token),
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) throw badRequest('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn');
    await UserModel.updateOne(
      { _id: user._id },
      {
        passwordHash: await bcrypt.hash(password, 12),
        passwordChangedAt: new Date(),
        $unset: { resetPasswordTokenHash: 1, resetPasswordExpires: 1 },
      },
    );
    // Đăng xuất mọi thiết bị
    await AuthSessionModel.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    res.json({ ok: true });
  }),
);

/* GET /auth/me */
router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await UserModel.findById(uid(req)).select('+passwordHash');
    if (!user) throw unauthorized();
    const hasPassword = Boolean(user.passwordHash);
    res.json({ user: { ...user.toJSON(), hasPassword } });
  }),
);

export default router;
