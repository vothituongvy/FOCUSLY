import { Schema, model, InferSchemaType } from 'mongoose';
import { jsonOptions, syncFields, syncable } from './common';

export const DISTRACTION_REASONS = [
  'social_media', // Mạng xã hội
  'notification', // Thông báo
  'message', // Tin nhắn
  'too_difficult', // Nội dung học quá khó
  'tired', // Mệt mỏi, buồn ngủ
  'other_task', // Muốn làm việc khác
  'environment', // Môi trường xung quanh
  'left_app', // Rời app/tab (tự động phát hiện)
  'blocked_site', // Cố mở trang bị chặn / chuyển tab trong phiên nghiêm ngặt (extension ghi nhận)
  'other',
] as const;

export const DISTRACTION_CATEGORIES = ['digital', 'internal', 'external'] as const;

/** Phân loại mặc định theo nguyên nhân */
export const DEFAULT_CATEGORY: Record<(typeof DISTRACTION_REASONS)[number], (typeof DISTRACTION_CATEGORIES)[number]> = {
  social_media: 'digital',
  notification: 'digital',
  message: 'digital',
  left_app: 'digital',
  blocked_site: 'digital',
  too_difficult: 'internal',
  tired: 'internal',
  other_task: 'internal',
  environment: 'external',
  other: 'internal',
};

const distractionSchema = new Schema(
  {
    ...syncFields,
    session: { type: Schema.Types.ObjectId, ref: 'FocusSession', default: null, index: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    task: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    reason: { type: String, enum: DISTRACTION_REASONS, required: true },
    category: { type: String, enum: DISTRACTION_CATEGORIES, required: true },
    note: { type: String, default: '', maxlength: 1000 },
    occurredAt: { type: Date, default: Date.now },
    minuteIntoSession: { type: Number, default: null }, // phút thứ mấy của phiên (theo thời gian focus)
    durationSeconds: { type: Number, default: null }, // thời gian bị gián đoạn (nếu biết)
    source: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    device: { type: String, enum: ['web', 'android', 'ios', 'unknown'], default: 'web' },
  },
  jsonOptions,
);
syncable(distractionSchema);
distractionSchema.index({ user: 1, occurredAt: -1 });

export type Distraction = InferSchemaType<typeof distractionSchema>;
export const DistractionModel = model('Distraction', distractionSchema);
