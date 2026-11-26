import { describe, expect, it } from 'vitest';
import { dayKey, isWithinSchedule, minutesOfDay } from '../src/utils/time';
import { sanitizeValue } from '../src/middleware/security';
import { normalizeDomain } from '../src/routes/shield.routes';
import { extractJson, relevantChunks } from '../src/services/ai';

describe('Múi giờ & Focus Schedule', () => {
  const tz = 'Asia/Ho_Chi_Minh';
  const d = new Date('2026-11-25T16:30:00Z'); // 23:30 thứ 4 giờ VN
  it('dayKey/minutesOfDay theo múi giờ', () => {
    expect(dayKey(d, tz)).toBe('2026-11-25');
    expect(minutesOfDay(d, tz)).toBe(23 * 60 + 30);
  });
  it('khung giờ qua nửa đêm', () => {
    const sched = [{ days: [3], start: '22:00', end: '01:00' }];
    expect(isWithinSchedule(d, tz, sched)).toBe(true);
    expect(isWithinSchedule(new Date('2026-11-25T17:30:00Z'), tz, sched)).toBe(true); // 00:30 thứ 5
    expect(isWithinSchedule(new Date('2026-11-25T19:00:00Z'), tz, sched)).toBe(false); // 02:00
  });
});

describe('Bảo mật', () => {
  it('loại bỏ toán tử Mongo khỏi input', () => {
    expect(sanitizeValue({ email: { $gt: '' }, 'a.b': 1, ok: [{ $where: 'x', v: 1 }] })).toEqual({ email: {}, ok: [{ v: 1 }] });
  });
  it('chuẩn hoá domain block list', () => {
    expect(normalizeDomain('https://www.YouTube.com/watch?v=1')).toBe('youtube.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });
});

describe('AI helpers', () => {
  it('extractJson bỏ code fence', () => {
    expect(extractJson('Đây:\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });
  it('relevantChunks chọn đoạn chứa từ khoá', () => {
    const text = 'mở đầu '.repeat(500) + ' useEffect cleanup function '.repeat(50) + ' kết '.repeat(3000);
    const out = relevantChunks(text, 'cleanup function là gì', 5000, 2500);
    expect(out.length).toBeLessThanOrEqual(5200);
    expect(out).toContain('cleanup');
  });
});
