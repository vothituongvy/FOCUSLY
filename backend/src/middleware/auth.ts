import { Request, RequestHandler } from 'express';
import { unauthorized } from '../utils/http';
import { verifyAccessToken, verifyExtensionToken } from '../services/tokens';

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** Bắt buộc access token hợp lệ */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.authSessionId = payload.sid;
    req.platform = payload.plt;
    next();
  } catch {
    next(unauthorized('Access token không hợp lệ hoặc đã hết hạn'));
  }
};

/** Chấp nhận access token HOẶC extension token (chỉ đọc trạng thái Shield) */
export const requireAuthOrExtension: RequestHandler = (req, res, next) => {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    return next();
  } catch {
    try {
      const ext = verifyExtensionToken(token);
      req.userId = ext.sub;
      req.platform = 'extension';
      return next();
    } catch {
      return next(unauthorized());
    }
  }
};

export function uid(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}
