import { NextFunction, Request, Response, RequestHandler } from 'express';
import { z, ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Chưa đăng nhập hoặc phiên đã hết hạn') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'Không có quyền') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Không tìm thấy') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, 'CONFLICT', details);

/** Bọc handler async để lỗi được chuyển tới error middleware */
export const ah =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };

/** Parse & validate dữ liệu bằng zod, ném 400 nếu sai */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Dữ liệu không hợp lệ', result.error.flatten());
  }
  return result.data;
}
