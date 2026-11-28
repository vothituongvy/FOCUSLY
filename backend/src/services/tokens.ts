import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Request } from 'express';
import { env } from '../config/env';
import { AuthSessionModel } from '../models/AuthSession';
import { HttpError, unauthorized } from '../utils/http';
import { UserModel } from '../models/User';

export interface AccessPayload {
  sub: string; // user id
  sid: string; // auth session id
  plt: string; // platform
  typ: 'access';
}

export interface ExtensionPayload {
  sub: string;
  typ: 'extension';
  scope: 'shield:read';
}

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export function signAccessToken(userId: string, sessionId: string, platform: string): string {
  const payload: AccessPayload = { sub: userId, sid: sessionId, plt: platform, typ: 'access' };
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: env.accessTokenTtl } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  const p = jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
  if (p.typ !== 'access') throw new Error('wrong token type');
  return p;
}

/** Token giới hạn quyền cho Chrome Extension: chỉ đọc trạng thái Focus Shield */
export function signExtensionToken(userId: string): string {
  const payload: ExtensionPayload = { sub: userId, typ: 'extension', scope: 'shield:read' };
  return jwt.sign(payload, env.jwtExtensionSecret, { expiresIn: '90d' });
}

export function verifyExtensionToken(token: string): ExtensionPayload {
  const p = jwt.verify(token, env.jwtExtensionSecret) as ExtensionPayload;
  if (p.typ !== 'extension') throw new Error('wrong token type');
  return p;
}

function detectPlatform(req: Request): 'web' | 'android' | 'ios' | 'unknown' {
  const h = String(req.headers['x-client-platform'] ?? '').toLowerCase();
  if (h === 'web' || h === 'android' || h === 'ios') return h;
  return 'unknown';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/** Tạo AuthSession mới + cặp token */
/** Tài khoản bị quản trị viên khoá thì không cấp / làm mới phiên */
async function assertActive(userId: string) {
  const u = await UserModel.findById(userId).select('disabledAt disabledReason').lean();
  if (u?.disabledAt) throw new HttpError(403, `Tài khoản đã bị khoá${u.disabledReason ? `: ${u.disabledReason}` : ''}. Liên hệ hỗ trợ nếu đây là nhầm lẫn.`, 'ACCOUNT_DISABLED');
}

export async function issueTokens(userId: string, req: Request): Promise<TokenPair> {
  await assertActive(userId);
  const refreshToken = randomToken();
  const platform = detectPlatform(req);
  const session = await AuthSessionModel.create({
    user: userId,
    tokenHash: sha256(refreshToken),
    platform,
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    ip: req.ip ?? '',
    expiresAt: new Date(Date.now() + env.refreshTokenDays * 86_400_000),
  });
  return {
    accessToken: signAccessToken(userId, session.id, platform),
    refreshToken,
    expiresIn: env.accessTokenTtl,
  };
}

/** Xoay vòng refresh token (rotation): token cũ hết hiệu lực ngay */
export async function rotateRefreshToken(refreshToken: string): Promise<TokenPair & { userId: string }> {
  const session = await AuthSessionModel.findOne({ tokenHash: sha256(refreshToken) }).select('+tokenHash');
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw unauthorized('Refresh token không hợp lệ');
  }
  await assertActive(String(session.user));
  const next = randomToken();
  session.tokenHash = sha256(next);
  session.lastUsedAt = new Date();
  session.expiresAt = new Date(Date.now() + env.refreshTokenDays * 86_400_000);
  await session.save();
  const userId = String(session.user);
  return {
    userId,
    accessToken: signAccessToken(userId, session.id, session.platform ?? 'unknown'),
    refreshToken: next,
    expiresIn: env.accessTokenTtl,
  };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await AuthSessionModel.updateOne({ tokenHash: sha256(refreshToken) }, { revokedAt: new Date() });
}
