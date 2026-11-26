import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Ngôn ngữ giao diện của người dùng cho từng request (header `X-Lang: vi | en`).
 * Dùng để AI trả lời đúng ngôn ngữ người học đang dùng.
 */
export type Lang = 'vi' | 'en';
const store = new AsyncLocalStorage<Lang>();

export function langMiddleware(req: Request, _res: Response, next: NextFunction) {
  const h = String(req.headers['x-lang'] ?? '').toLowerCase();
  store.run(h.startsWith('en') ? 'en' : 'vi', next);
}

export const currentLang = (): Lang => store.getStore() ?? 'vi';
