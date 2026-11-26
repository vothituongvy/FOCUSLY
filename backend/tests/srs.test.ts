import { describe, expect, it } from 'vitest';
import { cardStage, GRADE, review } from '../src/services/srs';

const now = new Date('2026-11-25T00:00:00Z');
const days = (d: Date) => Math.round((d.getTime() - now.getTime()) / 86_400_000);

describe('SM-2 spaced repetition', () => {
  it('thẻ mới trả lời Good: 1 ngày → 6 ngày → tăng theo ease', () => {
    let s = review({}, GRADE.good, now);
    expect(s.interval).toBe(1);
    expect(days(s.due)).toBe(1);
    s = review(s, GRADE.good, now);
    expect(s.interval).toBe(6);
    s = review(s, GRADE.good, now);
    expect(s.interval).toBeGreaterThanOrEqual(14);
    expect(cardStage(s)).toBe('young');
  });

  it('Again: đặt lại chuỗi, ôn lại sau 10 phút, tăng lapses, giảm ease', () => {
    const s = review({ ease: 2.5, interval: 30, repetitions: 5, lapses: 0, lastReviewedAt: now }, GRADE.again, now);
    expect(s.repetitions).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.due.getTime() - now.getTime()).toBe(10 * 60_000);
    expect(s.ease).toBeLessThan(2.5);
    expect(cardStage(s)).toBe('learning');
  });

  it('ease không nhỏ hơn 1.3', () => {
    let s = review({ ease: 1.3 }, 0, now);
    s = review(s, 0, now);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('Easy cho khoảng cách dài hơn Good', () => {
    const base = { ease: 2.5, interval: 10, repetitions: 3, lapses: 0, lastReviewedAt: now };
    expect(review(base, GRADE.easy, now).interval).toBeGreaterThan(review(base, GRADE.good, now).interval);
  });
});
