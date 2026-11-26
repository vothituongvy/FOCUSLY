import { Schema, model } from 'mongoose';
import { jsonOptions } from './common';

export const NOTIFICATION_TYPES = ['study_reminder', 'task_reminder', 'break_reminder', 'daily_summary', 'review_due', 'system'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} }, // { link, taskId, sessionId... }
    readAt: { type: Date, default: null },
    /** Khoá chống gửi trùng, vd "task:<id>:deadline" */
    dedupeKey: { type: String, default: null },
    pushedAt: { type: Date, default: null },
  },
  jsonOptions,
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // giữ 90 ngày
export const NotificationModel = model('Notification', notificationSchema);

/** FCM device token của Mobile */
const pushTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  jsonOptions,
);
export const PushTokenModel = model('PushToken', pushTokenSchema);
