/**
 * FOCUSLY Brain – HỌC TỪ ĐÁNH GIÁ 👍/👎.
 *
 * Mỗi câu hỏi / flashcard Brain tạo ra mang "origin" (cách tạo: câu định nghĩa, điền khuyết, đúng/sai…).
 * Người học chấm 👍/👎 (hoặc giữ / bỏ thẻ nháp) -> Brain đếm theo từng cách tạo, cho cả cộng đồng và riêng từng người,
 * rồi ưu tiên những cách được thích, giảm những cách bị chê ở lần tạo sau.
 * Câu trả lời trong Trợ lý AI cũng được chấm để theo dõi chất lượng từng nguồn (dữ liệu, LLM, Brain).
 */
import { Schema, Types, model } from 'mongoose';
import type { Prefs } from './generate';

const feedbackSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['answer', 'question', 'card'], required: true },
    origin: { type: String, required: true, maxlength: 60 },
    vote: { type: Number, enum: [1, -1], required: true },
    text: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true },
);
feedbackSchema.index({ kind: 1, origin: 1, createdAt: -1 });
export const AIFeedbackModel = model('AIFeedback', feedbackSchema);

export async function recordFeedback(userId: string, items: { kind: 'answer' | 'question' | 'card'; origin: string; vote: 1 | -1; text?: string }[]) {
  if (!items.length) return;
  await AIFeedbackModel.insertMany(items.map((i) => ({ user: userId, kind: i.kind, origin: i.origin || 'unknown', vote: i.vote, text: (i.text ?? '').slice(0, 500) })));
  cache.clear();
}

const cache = new Map<string, { at: number; value: Prefs }>();

/**
 * Hệ số ưu tiên cho từng cách tạo: (thích + 2) / (chê + 2).
 * Đánh giá của chính bạn tính đủ; của cộng đồng tính 20% – vừa cá nhân hoá vừa học được từ mọi người.
 */
export async function prefsFor(userId: string, kind: 'question' | 'card'): Promise<Prefs> {
  const key = `${userId}:${kind}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const since = new Date(Date.now() - 180 * 86_400_000);
  const rows = await AIFeedbackModel.aggregate<{ _id: { origin: string; mine: boolean }; likes: number; dislikes: number }>([
    { $match: { kind, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { origin: '$origin', mine: { $eq: ['$user', new Types.ObjectId(userId)] } },
        likes: { $sum: { $cond: [{ $eq: ['$vote', 1] }, 1, 0] } },
        dislikes: { $sum: { $cond: [{ $eq: ['$vote', -1] }, 1, 0] } },
      },
    },
  ]);
  const acc = new Map<string, { l: number; d: number }>();
  for (const r of rows) {
    const w = r._id.mine ? 1 : 0.2;
    const a = acc.get(r._id.origin) ?? { l: 0, d: 0 };
    a.l += r.likes * w;
    a.d += r.dislikes * w;
    acc.set(r._id.origin, a);
  }
  const value: Prefs = {};
  for (const [origin, { l, d }] of acc) value[origin] = (l + 2) / (d + 2);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Thống kê mức hài lòng theo nguồn (hiển thị cho người dùng / quản trị) */
export async function feedbackStats(userId?: string) {
  const match: Record<string, unknown> = { createdAt: { $gte: new Date(Date.now() - 90 * 86_400_000) } };
  if (userId) match.user = new Types.ObjectId(userId);
  const rows = await AIFeedbackModel.aggregate<{ _id: { kind: string; origin: string }; likes: number; total: number }>([
    { $match: match },
    { $group: { _id: { kind: '$kind', origin: '$origin' }, likes: { $sum: { $cond: [{ $eq: ['$vote', 1] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) => ({ kind: r._id.kind, origin: r._id.origin, likes: r.likes, total: r.total, satisfaction: r.total ? r.likes / r.total : null }));
}
