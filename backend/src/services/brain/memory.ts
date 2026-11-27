/**
 * FOCUSLY Brain – DỰ BÁO THẺ SẮP QUÊN (Half-Life Regression – phương pháp Duolingo công bố năm 2016).
 *
 * Mỗi flashcard có một "chu kỳ bán nhớ" h (số ngày để khả năng nhớ giảm còn 50%):
 *     h = 2^(θ · x)          x = [1, √(1 + số lần nhớ đúng), √(1 + số lần quên)]
 *     P(nhớ sau Δ ngày) = 2^(−Δ / h)
 * θ được HỌC từ toàn bộ lịch sử ôn thẻ (ReviewLog) của mọi người dùng bằng gradient descent, cập nhật mỗi 6 giờ.
 * Nhờ đó Brain biết thẻ nào bạn sắp quên – kể cả thẻ chưa đến hạn theo lịch SM-2.
 */
import { Types } from 'mongoose';
import { CardModel, ReviewLogModel } from '../../models/Learn';

const DAY = 86_400_000;
let theta = [0.5, 1.2, -0.6]; // mặc định khi chưa đủ dữ liệu: thẻ mới nhớ ~2 ngày
let trainedAt = 0;
let samples = 0;

const feats = (correct: number, wrong: number) => [1, Math.sqrt(1 + correct), Math.sqrt(1 + wrong)];
const halfLife = (th: number[], x: number[]) => Math.min(365 * 2, Math.max(0.05, Math.pow(2, th.reduce((a, t, i) => a + t * x[i], 0))));
const recall = (h: number, days: number) => Math.pow(2, -days / h);

/** Huấn luyện θ trên các cặp lần ôn liên tiếp của cùng một thẻ */
async function train() {
  if (Date.now() - trainedAt < 6 * 3600_000) return;
  trainedAt = Date.now();
  const logs = await ReviewLogModel.find({ reviewedAt: { $gte: new Date(Date.now() - 365 * DAY) } })
    .select('card grade reviewedAt')
    .sort({ card: 1, reviewedAt: 1 })
    .limit(60_000)
    .lean();
  const pairs: { x: number[]; days: number; y: number }[] = [];
  let prev: { card: string; at: number; correct: number; wrong: number } | null = null;
  for (const l of logs) {
    const card = String(l.card);
    const at = new Date(l.reviewedAt).getTime();
    const ok = (l.grade ?? 0) >= 3;
    if (prev && prev.card === card) {
      const days = (at - prev.at) / DAY;
      if (days > 0.01) pairs.push({ x: feats(prev.correct, prev.wrong), days, y: ok ? 1 : 0 });
      prev = { card, at, correct: prev.correct + (ok ? 1 : 0), wrong: prev.wrong + (ok ? 0 : 1) };
    } else {
      prev = { card, at, correct: ok ? 1 : 0, wrong: ok ? 0 : 1 };
    }
  }
  samples = pairs.length;
  if (pairs.length < 50) return; // quá ít dữ liệu – giữ θ mặc định
  // gradient descent trên sai số bình phương của xác suất nhớ (+ L2 nhỏ)
  const th = [...theta];
  const lr = 0.3;
  for (let epoch = 0; epoch < 200; epoch++) {
    const g = [0, 0, 0];
    for (const p of pairs) {
      const h = halfLife(th, p.x);
      const pr = recall(h, p.days);
      // dp/dθ = p · ln2 · Δ/h · x   (vì h = 2^(θ·x))
      const common = 2 * (pr - p.y) * pr * Math.LN2 * (p.days / h) * Math.LN2;
      for (let i = 0; i < 3; i++) g[i] += common * p.x[i];
    }
    for (let i = 0; i < 3; i++) th[i] -= lr * (g[i] / pairs.length + 0.001 * th[i]);
  }
  if (th.every(Number.isFinite)) theta = th;
}

export interface MemoryForecast {
  trained: boolean;
  samples: number;
  /** thẻ có khả năng nhớ thấp nhất lúc này */
  atRisk: { cardId: string; front: string; deck: string; recallNow: number; recallTomorrow: number; halfLifeDays: number }[];
  /** số thẻ khả năng nhớ < 70% trong 24 giờ tới */
  forgettingSoon: number;
  averageRecall: number | null;
}

export async function memoryForecast(userId: string, limit = 10): Promise<MemoryForecast> {
  await train().catch(() => undefined);
  const stats = await ReviewLogModel.aggregate<{ _id: Types.ObjectId; correct: number; wrong: number; last: Date }>([
    { $match: { user: new Types.ObjectId(userId) } },
    { $group: { _id: '$card', correct: { $sum: { $cond: [{ $gte: ['$grade', 3] }, 1, 0] } }, wrong: { $sum: { $cond: [{ $lt: ['$grade', 3] }, 1, 0] } }, last: { $max: '$reviewedAt' } } },
  ]);
  if (!stats.length) return { trained: samples >= 50, samples, atRisk: [], forgettingSoon: 0, averageRecall: null };
  const cards = await CardModel.find({ _id: { $in: stats.map((s) => s._id) }, user: userId, deletedAt: null, suspended: { $ne: true } })
    .select('front deck')
    .lean();
  const byId = new Map(cards.map((c) => [String(c._id), c]));
  const now = Date.now();
  const rows = stats
    .filter((s) => byId.has(String(s._id)))
    .map((s) => {
      const h = halfLife(theta, feats(s.correct, s.wrong));
      const days = (now - new Date(s.last).getTime()) / DAY;
      const c = byId.get(String(s._id))!;
      return { cardId: String(s._id), front: c.front.slice(0, 160), deck: String(c.deck), recallNow: round(recall(h, days)), recallTomorrow: round(recall(h, days + 1)), halfLifeDays: round(h) };
    });
  rows.sort((a, b) => a.recallNow - b.recallNow);
  return {
    trained: samples >= 50,
    samples,
    atRisk: rows.slice(0, limit),
    forgettingSoon: rows.filter((r) => r.recallTomorrow < 0.7).length,
    averageRecall: round(rows.reduce((a, r) => a + r.recallNow, 0) / rows.length),
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
