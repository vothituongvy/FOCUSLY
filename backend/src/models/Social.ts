import { Schema, model } from 'mongoose';
import { jsonOptions } from './common';

/* ================= Streak, thẻ đóng băng, nhiệm vụ ngày ================= */
const gamifySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    /** số thẻ đóng băng đang có (tối đa 2) – mỗi 7 ngày liên tiếp được tặng 1 thẻ */
    freezes: { type: Number, default: 1 },
    /** ngày đã dùng thẻ đóng băng (YYYY-MM-DD) – được tính như ngày có học */
    frozenDays: { type: [String], default: [] },
    /** mốc chuỗi đã nhận thưởng gần nhất */
    lastRewardStreak: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    /** nhiệm vụ đã hoàn thành theo ngày: { "2026-11-27": ["focus","cards"] } */
    questsDone: { type: Schema.Types.Mixed, default: {} },
  },
  jsonOptions,
);
export const GamifyModel = model('Gamify', gamifySchema);

/* ================= Bạn bè & bạn đồng hành ================= */
// Mỗi quan hệ lưu 2 bản ghi (user -> friend) để truy vấn nhanh theo user
const friendSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    friend: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['outgoing', 'incoming', 'accepted'], required: true },
    /** user chọn friend làm "bạn đồng hành": friend nhận thông báo khi user bỏ phiên */
    buddy: { type: Boolean, default: false },
  },
  jsonOptions,
);
friendSchema.index({ user: 1, friend: 1 }, { unique: true });
export const FriendModel = model('Friend', friendSchema);

/* ================= Phòng học chung ================= */
const roomSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: {
      type: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, joinedAt: Date, lastSeen: Date }, { _id: false })],
      default: [],
    },
    focusMinutes: { type: Number, default: 25, min: 5, max: 120 },
    breakMinutes: { type: Number, default: 5, min: 1, max: 60 },
    /** null = đang dừng; có giá trị = đồng hồ chạy (focus -> break -> focus…) tính từ mốc này */
    runningSince: { type: Date, default: null },
    messages: {
      type: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, name: String, text: String, at: Date }, { _id: false })],
      default: [],
    },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
roomSchema.index({ 'members.user': 1 });
export const RoomModel = model('StudyRoom', roomSchema);

/* ================= Kế hoạch ngày thi ================= */
const examSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', default: null },
    date: { type: String, required: true }, // YYYY-MM-DD
    dailyCapMinutes: { type: Number, default: 90, min: 15, max: 600 },
    topics: {
      type: [new Schema({ title: { type: String, maxlength: 200 }, minutes: { type: Number, default: 45 }, done: { type: Boolean, default: false } }, { _id: true })],
      default: [],
    },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
export const ExamModel = model('Exam', examSchema);

/* ================= Lớp học ================= */
const classSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    code: { type: String, required: true, unique: true },
    members: { type: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, joinedAt: Date }, { _id: false })], default: [] },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
classSchema.index({ 'members.user': 1 });
export const ClassModel = model('ClassRoom', classSchema);

const assignmentSchema = new Schema(
  {
    class: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true, index: true },
    kind: { type: String, enum: ['deck', 'quiz'], required: true },
    source: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    note: { type: String, default: '', maxlength: 500 },
    dueAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
export const AssignmentModel = model('Assignment', assignmentSchema);

/* ================= Số liệu sử dụng (ẩn danh theo ngày) ================= */
const usageDaySchema = new Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD (giờ VN)
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    features: { type: [String], default: [] },
    platforms: { type: [String], default: [] },
  },
  { versionKey: false },
);
usageDaySchema.index({ day: 1, user: 1 }, { unique: true });
export const UsageDayModel = model('UsageDay', usageDaySchema);

/* ================= Tin nhắn: 1-1 và nhóm ================= */
const chatMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    /** đã đọc tới lúc nào (dùng tính chưa đọc + "Đã xem") */
    lastReadAt: { type: Date, default: Date.now },
    /** tắt thông báo cuộc trò chuyện này */
    muted: { type: Boolean, default: false },
    /** chủ nhóm / quản trị */
    admin: { type: Boolean, default: false },
  },
  { _id: false },
);
const chatSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, default: '', maxlength: 80 },
    /** "idA:idB" (sắp xếp) – mỗi cặp bạn chỉ có 1 cuộc trò chuyện riêng */
    directKey: { type: String, default: undefined },
    members: { type: [chatMemberSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastMessage: {
      text: { type: String, default: '' },
      sender: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
chatSchema.index({ 'members.user': 1, 'lastMessage.at': -1 });
chatSchema.index({ directKey: 1 }, { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } });
export const ChatModel = model('Chat', chatSchema);

const chatMessageSchema = new Schema(
  {
    chat: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = tin hệ thống
    text: { type: String, required: true, maxlength: 2000 },
    /** id do máy gửi sinh ra – gửi lại khi mạng chập chờn không bị trùng */
    clientId: { type: String, default: undefined },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
chatMessageSchema.index({ chat: 1, createdAt: -1 });
chatMessageSchema.index({ chat: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
export const ChatMessageModel = model('ChatMessage', chatMessageSchema);

/* ================= Góp ý & báo lỗi từ người dùng ================= */
export const FEEDBACK_STATUSES = ['new', 'in_progress', 'fixed', 'wontfix'] as const;
const feedbackSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['bug', 'idea', 'other'], default: 'bug' },
    message: { type: String, required: true, maxlength: 4000 },
    /** trang / màn hình đang dùng khi gửi */
    page: { type: String, default: '', maxlength: 200 },
    platform: { type: String, default: 'web', maxlength: 20 },
    appVersion: { type: String, default: '', maxlength: 30 },
    device: { type: String, default: '', maxlength: 200 },
    status: { type: String, enum: FEEDBACK_STATUSES, default: 'new', index: true },
    /** trả lời của admin (người dùng xem được) */
    reply: { type: String, default: '', maxlength: 2000 },
    /** ghi chú nội bộ của admin */
    adminNote: { type: String, default: '', maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
  },
  jsonOptions,
);
feedbackSchema.index({ status: 1, createdAt: -1 });
export const FeedbackModel = model('Feedback', feedbackSchema);

/* ================= Giá trị hệ thống (VD: bản app đã báo gần nhất) ================= */
const appMetaSchema = new Schema({ key: { type: String, required: true, unique: true }, value: { type: Schema.Types.Mixed } }, { timestamps: true, versionKey: false });
export const AppMetaModel = model('AppMeta', appMetaSchema);
