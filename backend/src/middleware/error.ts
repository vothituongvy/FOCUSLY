import { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { HttpError } from '../utils/http';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Không có route ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: 'BAD_ID', message: `Giá trị không hợp lệ cho ${err.path}` } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại', details: err.keyValue } });
  }
  if (err instanceof MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD', message: err.message } });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } });
};
