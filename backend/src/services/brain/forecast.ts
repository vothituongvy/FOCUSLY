/**
 * FOCUSLY Brain – MODEL DỰ BÁO TẬP TRUNG (học riêng cho từng người dùng).
 *
 * Bài toán: với một phiên học bắt đầu lúc giờ h, ngày thứ d, dài m phút, xác suất phiên đó "tốt" là bao nhiêu?
 * Phiên "tốt" = hoàn thành, tập trung thực tế ≥ 60% thời lượng dự kiến và ≤ 3 lần phân tâm/giờ.
 *
 * Mô hình: hồi quy logistic (logistic regression) với đặc trưng giờ dạng sin/cos (giờ 23 và 0 gần nhau),
 * cuối tuần, độ dài phiên, chế độ nghiêm ngặt / Focus Shield. Huấn luyện bằng gradient descent + L2,
 * chạy trong vài mili-giây trên chính máy chủ – không cần GPU hay dịch vụ ngoài.
 * Khi còn ít dữ liệu, kết quả được "kéo" về mức trung bình (Bayes) để không phán đoán vội.
 */
import { FocusSessionModel } from '../../models/FocusSession';
import { UserModel } from '../../models/User';
import { hourIn, safeTimeZone, weekdayIn } from '../../utils/time';

export interface Sample {
  hour: number;
  weekday: number;
  minutes: number;
  strict: boolean;
  shield: boolean;
  good: boolean;
}

const MIN_SAMPLES = 6;

function features(hour: number, weekday: number, minutes: number, strict: boolean, shield: boolean): number[] {
  const a = (2 * Math.PI * hour) / 24;
  const m = Math.min(minutes || 25, 180) / 60;
  return [1, Math.sin(a), Math.cos(a), Math.sin(2 * a), Math.cos(2 * a), weekday === 0 || weekday === 6 ? 1 : 0, m, m * m, strict ? 1 : 0, shield ? 1 : 0];
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function train(samples: Sample[], { iters = 600, lr = 0.15, l2 = 0.02 } = {}): number[] {
  const X = samples.map((s) => features(s.hour, s.weekday, s.minutes, s.strict, s.shield));
  const y = samples.map((s) => (s.good ? 1 : 0));
  const w = new Array(X[0]?.length ?? 10).fill(0);
  const n = X.length || 1;
  for (let it = 0; it < iters; it++) {
    const g = new Array(w.length).fill(0);
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(X[i].reduce((a, x, j) => a + x * w[j], 0));
      for (let j = 0; j < w.length; j++) g[j] += (p - y[i]) * X[i][j];
    }
    for (let j = 0; j < w.length; j++) w[j] -= lr * (g[j] / n + (j ? l2 * w[j] : 0));
  }
  return w;
}

export const predictWith = (w: number[], hour: number, weekday: number, minutes: number, strict = false, shield = true) =>
  sigmoid(features(hour, weekday, minutes, strict, shield).reduce((a, x, j) => a + x * (w[j] ?? 0), 0));

/** Phiên học -> mẫu huấn luyện */
export function toSample(s: {
  startedAt: Date;
  plannedMinutes?: number | null;
  actualFocusSeconds?: number | null;
  distractionCount?: number | null;
  status: string;
  strict?: boolean | null;
  shieldEnabled?: boolean | null;
}, tz: string): Sample {
  const planned = s.plannedMinutes || 0;
  const focusMin = (s.actualFocusSeconds ?? 0) / 60;
  const perHour = focusMin > 0 ? (s.distractionCount ?? 0) / (focusMin / 60) : 99;
  const enough = planned ? focusMin >= planned * 0.6 : focusMin >= 20;
  return {
    hour: hourIn(new Date(s.startedAt), tz),
    weekday: weekdayIn(new Date(s.startedAt), tz),
    minutes: planned || Math.max(10, Math.round(focusMin)),
    strict: Boolean(s.strict),
    shield: Boolean(s.shieldEnabled),
    good: s.status === 'completed' && enough && perHour <= 3,
  };
}

export interface Forecast {
  trained: boolean;
  samples: number;
  /** số phiên của cộng đồng dùng làm nền cho dự báo */
  communitySamples: number;
  successRate: number | null;
  /** độ tin cậy 0..1 – tăng dần theo số phiên đã học */
  confidence: number;
  typicalMinutes: number;
  suggestedMinutes: number;
  byHour: { hour: number; probability: number; sessions: number }[];
  bestHours: { hour: number; probability: number }[];
  now: { hour: number; probability: number; level: 'high' | 'medium' | 'low' };
  tips: string[];
}

const cache = new Map<string, { at: number; value: Forecast }>();

/* ---------- Model CỘNG ĐỒNG: học từ phiên học của mọi người dùng (chỉ dùng con số giờ/độ dài/kết quả) ----------
 * Dùng làm "điểm xuất phát" cho người mới: chưa đủ phiên riêng thì dự báo theo xu hướng chung,
 * càng học nhiều thì model riêng của bạn càng chiếm phần lớn. Train lại mỗi 6 giờ.
 */
let community: { at: number; w: number[] | null; samples: number } = { at: 0, w: null, samples: 0 };

async function communityModel() {
  if (Date.now() - community.at < 6 * 3600_000) return community;
  const since = new Date(Date.now() - 180 * 86_400_000);
  const rows = await FocusSessionModel.find({ deletedAt: null, startedAt: { $gte: since }, status: { $in: ['completed', 'abandoned'] } })
    .select('user startedAt plannedMinutes actualFocusSeconds distractionCount status strict shieldEnabled')
    .sort({ startedAt: -1 })
    .limit(5000)
    .lean();
  const users = await UserModel.find({ _id: { $in: [...new Set(rows.map((r) => String(r.user)))] } }).select('profile.timezone').lean();
  const tzOf = new Map(users.map((u) => [String(u._id), safeTimeZone(u.profile?.timezone)]));
  const samples = rows.map((r) => toSample(r as never, tzOf.get(String(r.user)) ?? 'Asia/Ho_Chi_Minh'));
  const good = samples.filter((x) => x.good).length;
  const w = samples.length >= 30 && good > 0 && good < samples.length ? train(samples, { iters: 400 }) : null;
  community = { at: Date.now(), w, samples: samples.length };
  return community;
}

export async function forecastFor(userId: string, opts: { minutes?: number; strict?: boolean; fresh?: boolean } = {}): Promise<Forecast> {
  const key = `${userId}:${opts.minutes ?? ''}:${opts.strict ? 1 : 0}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  const user = await UserModel.findById(userId).select('profile').lean();
  const tz = safeTimeZone(user?.profile?.timezone);
  const since = new Date(Date.now() - 120 * 86_400_000);
  const rows = await FocusSessionModel.find({ user: userId, deletedAt: null, startedAt: { $gte: since }, status: { $in: ['completed', 'abandoned'] } })
    .select('startedAt plannedMinutes actualFocusSeconds distractionCount status strict shieldEnabled')
    .sort({ startedAt: -1 })
    .limit(400)
    .lean();
  const samples = rows.map((r) => toSample(r as never, tz));
  const good = samples.filter((s) => s.good).length;
  const rate = samples.length ? good / samples.length : null;

  const sortedMin = samples.map((s) => s.minutes).sort((a, b) => a - b);
  const typical = opts.minutes ?? (sortedMin.length ? sortedMin[Math.floor(sortedMin.length / 2)] : user?.profile?.defaultPomodoro?.focusMinutes ?? 25);
  const trained = samples.length >= MIN_SAMPLES && good > 0 && good < samples.length;
  const w = trained ? train(samples) : null;
  const confidence = Math.min(1, samples.length / 40);
  // xác suất nền khi chưa đủ dữ liệu: model cộng đồng (nếu có) hoặc tỉ lệ thành công của bạn (làm mượt)
  const base = rate == null ? 0.6 : (good + 3) / (samples.length + 5);
  const comm = await communityModel().catch(() => ({ w: null, samples: 0 }));
  const now = new Date();
  const wd = weekdayIn(now, tz);

  const priorAt = (hour: number, weekday: number, minutes: number) =>
    comm.w ? 0.5 * predictWith(comm.w, hour, weekday, minutes, Boolean(opts.strict), true) + 0.5 * base : base;
  const probAt = (hour: number, weekday = wd, minutes = typical) => {
    const prior = priorAt(hour, weekday, minutes);
    const model = w ? predictWith(w, hour, weekday, minutes, Boolean(opts.strict), true) : prior;
    // trộn model riêng với mức nền theo độ tin cậy
    return confidence * model + (1 - confidence) * prior;
  };

  const countByHour = new Array(24).fill(0);
  samples.forEach((s) => countByHour[s.hour]++);
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, probability: round(probAt(h)), sessions: countByHour[h] }));
  // giờ học hợp lý 6h–23h
  const bestHours = byHour
    .filter((x) => x.hour >= 6 && x.hour <= 23)
    .sort((a, b) => b.probability - a.probability || b.sessions - a.sessions)
    .slice(0, 3)
    .map(({ hour, probability }) => ({ hour, probability }));

  // độ dài gợi ý: tối đa hoá "số phút tập trung kỳ vọng" ở giờ tốt nhất, phạt nhẹ phiên quá dài
  const bh = bestHours[0]?.hour ?? 19;
  const lengths = [25, 30, 40, 45, 50, 60, 75, 90];
  const suggestedMinutes = w
    ? lengths.reduce((best, m) => (probAt(bh, wd, m) * Math.pow(m, 0.6) > probAt(bh, wd, best) * Math.pow(best, 0.6) ? m : best), 25)
    : typical <= 30
      ? 25
      : 45;

  const hourNow = hourIn(now, tz);
  const pNow = probAt(hourNow);
  const level: Forecast['now']['level'] = pNow >= 0.7 ? 'high' : pNow >= 0.45 ? 'medium' : 'low';

  const tips: string[] = [];
  if (!trained) tips.push(`Cần thêm ${Math.max(1, MIN_SAMPLES - samples.length)} phiên học nữa để FOCUSLY Brain hiểu thói quen của bạn.`);
  if (bestHours.length && trained) tips.push(`Bạn giữ tập trung tốt nhất khoảng ${bestHours.map((b) => `${b.hour}h`).join(', ')}.`);
  if (trained) tips.push(`Độ dài phiên phù hợp với bạn: khoảng ${suggestedMinutes} phút.`);
  if (level === 'low' && trained) tips.push('Giờ này bạn thường dễ phân tâm – thử bật Phiên nghiêm ngặt hoặc chọn phiên ngắn hơn.');

  const value: Forecast = {
    trained,
    samples: samples.length,
    communitySamples: comm.samples,
    successRate: rate == null ? null : round(rate),
    confidence: round(confidence),
    typicalMinutes: typical,
    suggestedMinutes,
    byHour,
    bestHours,
    now: { hour: hourNow, probability: round(pNow), level },
    tips,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearForecast(userId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${userId}:`)) cache.delete(k);
}

const round = (x: number) => Math.round(x * 100) / 100;
