import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { jsonOptions } from './common';

const timeRangeSchema = new Schema(
  {
    start: { type: String, required: true }, // "HH:mm"
    end: { type: String, required: true },
  },
  { _id: false },
);

const focusScheduleSchema = new Schema(
  {
    days: { type: [Number], default: [1, 2, 3, 4, 5] }, // 0 = Chủ nhật
    start: { type: String, required: true },
    end: { type: String, required: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: true },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    /** mã kết bạn / mời bạn (6 ký tự) */
    friendCode: { type: String, index: true, sparse: true, unique: true },
    avatarPublicId: { type: String, default: null, select: false },
    profile: {
      learningGoal: { type: String, default: '' },
      interestedSubjects: { type: [String], default: [] },
      preferredStudyTimes: { type: [timeRangeSchema], default: [] },
      dailyTargetMinutes: { type: Number, default: 120, min: 0, max: 1440 },
      timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
      language: { type: String, enum: ['vi', 'en'], default: 'vi' },
      defaultPomodoro: {
        focusMinutes: { type: Number, default: 25 },
        breakMinutes: { type: Number, default: 5 },
        longBreakMinutes: { type: Number, default: 15 },
        cyclesBeforeLongBreak: { type: Number, default: 4 },
      },
    },
    shield: {
      blockList: {
        type: [String],
        default: ['facebook.com', 'youtube.com', 'tiktok.com', 'instagram.com'],
      },
      autoEnableOnSession: { type: Boolean, default: true },
      /** Trang được phép mở trong phiên nghiêm ngặt (ngoài FOCUSLY) */
      allowList: { type: [String], default: ['wikipedia.org', 'translate.google.com', 'dictionary.cambridge.org', 'docs.google.com'] },
      strictByDefault: { type: Boolean, default: false },
      hideDistractions: { type: Boolean, default: true },
      schedule: { type: [focusScheduleSchema], default: [] },
    },
    /** Phase 2 – cài đặt thông báo */
    notificationSettings: {
      studyReminder: { type: Boolean, default: true }, // nhắc theo khung giờ học mong muốn
      taskReminder: { type: Boolean, default: true },
      taskReminderMinutes: { type: Number, default: 60, min: 5, max: 1440 },
      breakReminder: { type: Boolean, default: true },
      dailySummary: { type: Boolean, default: true },
      dailySummaryTime: { type: String, default: '21:30' },
      reviewReminder: { type: Boolean, default: true }, // flashcard đến hạn ôn
      weeklyReport: { type: Boolean, default: true }, // báo cáo tuần tối Chủ nhật (thông báo)
      weeklyEmail: { type: Boolean, default: true }, // gửi kèm email
      push: { type: Boolean, default: true },
      quietStart: { type: String, default: '23:00' },
      quietEnd: { type: String, default: '06:30' },
    },
    passwordChangedAt: { type: Date, default: null },
    resetPasswordTokenHash: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  jsonOptions,
);

userSchema.set('toJSON', {
  ...jsonOptions.toJSON,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    delete ret.passwordHash;
    delete ret.avatarPublicId;
    delete ret.resetPasswordTokenHash;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
