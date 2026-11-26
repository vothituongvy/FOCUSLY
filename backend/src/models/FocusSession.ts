import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { jsonOptions, syncFields, syncable } from './common';

export const SESSION_STATUSES = ['active', 'paused', 'on_break', 'completed', 'abandoned'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/**
 * Một phiên học được lưu dưới dạng các "segment" thời gian thực (theo giờ server).
 * Thời gian tập trung thực tế = tổng độ dài các segment focus, KHÔNG dựa vào đồng hồ UI.
 */
const segmentSchema = new Schema(
  {
    type: { type: String, enum: ['focus', 'break'], required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: ['pause', 'break', 'resume', 'end', 'auto_pause', null],
      default: null,
    },
  },
  { _id: false },
);

const focusSessionSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    task: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    goal: { type: String, default: '', maxlength: 500 }, // mục tiêu phiên học
    mode: { type: String, enum: ['pomodoro', 'custom', 'free'], default: 'pomodoro' },
    plannedMinutes: { type: Number, default: 25, min: 0, max: 600 },
    pomodoro: {
      focusMinutes: { type: Number, default: 25 },
      breakMinutes: { type: Number, default: 5 },
      longBreakMinutes: { type: Number, default: 15 },
      cyclesBeforeLongBreak: { type: Number, default: 4 },
      completedCycles: { type: Number, default: 0 },
    },
    status: { type: String, enum: SESSION_STATUSES, default: 'active', index: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    segments: { type: [segmentSchema], default: [] },
    actualFocusSeconds: { type: Number, default: 0 },
    breakSeconds: { type: Number, default: 0 },
    pauseCount: { type: Number, default: 0 },
    distractionCount: { type: Number, default: 0 },
    appLeaveCount: { type: Number, default: 0 }, // số lần rời app/tab khi đang học
    shieldEnabled: { type: Boolean, default: true },
    /** Phiên nghiêm ngặt: chỉ tính giờ khi ở trong FOCUSLY, khoá tab (extension), ghim màn hình (Android) */
    strict: { type: Boolean, default: false },
    device: { type: String, enum: ['web', 'android', 'ios', 'unknown'], default: 'web' },
    lastHeartbeatAt: { type: Date, default: Date.now },
    autoPausedAt: { type: Date, default: null },
    summary: {
      goalAchieved: { type: Boolean, default: null },
      rating: { type: Number, min: 1, max: 5, default: null },
      note: { type: String, default: '', maxlength: 2000 },
    },
  },
  jsonOptions,
);
syncable(focusSessionSchema);
focusSessionSchema.index({ user: 1, startedAt: -1 });

export type FocusSession = InferSchemaType<typeof focusSessionSchema>;
export type FocusSessionDoc = HydratedDocument<FocusSession>;
export const FocusSessionModel = model('FocusSession', focusSessionSchema);
