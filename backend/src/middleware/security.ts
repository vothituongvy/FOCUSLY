import crypto from 'crypto';
import { RequestHandler } from 'express';

/** Gắn X-Request-Id cho mỗi request (truy vết log) */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && /^[\w-]{6,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  (req as typeof req & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

/**
 * Chống NoSQL injection: loại bỏ key bắt đầu bằng "$" hoặc chứa "." trong body/query
 * (vd: { "email": { "$gt": "" } }). Thay cho express-mongo-sanitize.
 */
function clean(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = clean(v, depth + 1);
  }
  return out;
}

export const sanitizeInput: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  // req.query là getter trong Express 5 – với Express 4 có thể gán lại
  if (req.query && typeof req.query === 'object') {
    for (const k of Object.keys(req.query)) {
      if (k.startsWith('$') || k.includes('.')) delete (req.query as Record<string, unknown>)[k];
      else if (typeof req.query[k] === 'object') (req.query as Record<string, unknown>)[k] = String(req.query[k]);
    }
  }
  next();
};

export { clean as sanitizeValue };
