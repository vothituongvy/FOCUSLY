import { Schema, model, InferSchemaType } from 'mongoose';
import { jsonOptions } from './common';

/** Mỗi lần đăng nhập trên 1 thiết bị = 1 AuthSession (giữ refresh token đã băm). */
const authSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    platform: { type: String, enum: ['web', 'android', 'ios', 'extension', 'unknown'], default: 'unknown' },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  jsonOptions,
);

// MongoDB tự xoá session hết hạn
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export const AuthSessionModel = model('AuthSession', authSessionSchema);
