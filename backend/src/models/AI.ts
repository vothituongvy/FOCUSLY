import { Schema, model } from 'mongoose';
import { jsonOptions } from './common';

/* PHASE 3 – AI Learning Assistant */

const messageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    at: { type: Date, default: Date.now },
    /** nguồn câu trả lời: data (số liệu người học) · llm · brain */
    origin: { type: String, default: '' },
    /** đánh giá của người học: 1 = 👍, -1 = 👎 */
    vote: { type: Number, default: 0 },
    /** tệp đính kèm khi người học gửi (chỉ lưu tên + loại để hiển thị) */
    attachments: { type: [new Schema({ name: String, kind: String }, { _id: false })], default: undefined },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: 'Cuộc trò chuyện mới' },
    material: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    messages: { type: [messageSchema], default: [] },
    /** chữ trích từ các file đã đính kèm trong cuộc trò chuyện – để hỏi tiếp về file */
    attachmentsText: { type: String, default: '', select: false },
    deletedAt: { type: Date, default: null },
  },
  jsonOptions,
);
conversationSchema.index({ user: 1, updatedAt: -1 });
export const ConversationModel = model('AIConversation', conversationSchema);

/** Theo dõi lượt dùng AI để giới hạn chi phí */
const usageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    feature: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 60 },
  },
  { versionKey: false },
);
usageSchema.index({ user: 1, createdAt: -1 });
export const AIUsageModel = model('AIUsage', usageSchema);
