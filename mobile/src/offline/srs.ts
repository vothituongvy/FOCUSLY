/**
 * Spaced Repetition – thuật toán SM-2 (SuperMemo 2) rút gọn.
 * grade: 0..5  (giao diện: Again=1, Hard=3, Good=4, Easy=5)
 */
export interface SrsState {
  ease: number;
  interval: number; // ngày
  repetitions: number;
  lapses: number;
  due: Date;
  lastReviewedAt: Date | null;
}

export const GRADE = { again: 1, hard: 3, good: 4, easy: 5 } as const;
const MIN_EASE = 1.3;
const RELEARN_MINUTES = 10;

/** Trạng thái đầu vào: chấp nhận ngày dạng Date hoặc chuỗi ISO (dữ liệu từ API/SQLite) */
export type SrsInput = { ease?: number; interval?: number; repetitions?: number; lapses?: number; due?: Date | string; lastReviewedAt?: Date | string | null };

export function review(prev: SrsInput, grade: number, now = new Date()): SrsState {
  const q = Math.max(0, Math.min(5, Math.round(grade)));
  let ease = prev.ease ?? 2.5;
  let interval = prev.interval ?? 0;
  let repetitions = prev.repetitions ?? 0;
  let lapses = prev.lapses ?? 0;

  ease = Math.max(MIN_EASE, ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

  if (q < 3) {
    // Quên: học lại sau 10 phút, đặt lại chuỗi
    repetitions = 0;
    interval = 0;
    lapses += 1;
    return { ease, interval, repetitions, lapses, due: new Date(now.getTime() + RELEARN_MINUTES * 60_000), lastReviewedAt: now };
  }

  repetitions += 1;
  if (repetitions === 1) interval = q === 5 ? 3 : 1;
  else if (repetitions === 2) interval = q === 5 ? 8 : 6;
  else interval = Math.round(interval * ease * (q === 3 ? 0.85 : q === 5 ? 1.3 : 1));
  interval = Math.max(1, Math.min(interval, 3650));

  return { ease, interval, repetitions, lapses, due: new Date(now.getTime() + interval * 86_400_000), lastReviewedAt: now };
}

/** Mức ghi nhớ ước lượng của 1 thẻ: new | learning | young | mature */
export function cardStage(s: SrsInput): 'new' | 'learning' | 'young' | 'mature' {
  if (!s.lastReviewedAt) return 'new';
  if ((s.repetitions ?? 0) === 0) return 'learning';
  return (s.interval ?? 0) >= 21 ? 'mature' : 'young';
}
