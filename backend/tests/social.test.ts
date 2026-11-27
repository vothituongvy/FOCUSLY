import { describe, expect, it } from 'vitest';
import { buildExamPlan, computeStreak, daysToFreeze, freezeReward, levelOf, roomPhase } from '../src/services/social/logic';
import { cleanAnkiField, noteToCard } from '../src/services/anki';
import { zonedDate } from '../src/utils/time';

const days = ['2026-11-27', '2026-11-26', '2026-11-25', '2026-11-24', '2026-11-23', '2026-11-22'];

describe('streak & thẻ đóng băng', () => {
  it('hôm nay chưa học không làm đứt chuỗi', () => {
    const s = computeStreak(days, new Set(['2026-11-26', '2026-11-25']), new Set());
    expect(s.current).toBe(2);
    expect(s.todayDone).toBe(false);
  });
  it('ngày đóng băng được tính như ngày có học', () => {
    const s = computeStreak(days, new Set(['2026-11-27', '2026-11-25', '2026-11-24']), new Set(['2026-11-26']));
    expect(s.current).toBe(4);
  });
  it('dùng thẻ cho ngày lỡ khi đủ thẻ và trước đó có chuỗi', () => {
    expect(daysToFreeze(days, new Set(['2026-11-25', '2026-11-24']), new Set(), 1)).toEqual(['2026-11-26']);
    expect(daysToFreeze(days, new Set(['2026-11-24']), new Set(), 1)).toEqual([]); // lỡ 2 ngày, chỉ có 1 thẻ
    expect(daysToFreeze(days, new Set(['2026-11-24']), new Set(), 2)).toEqual(['2026-11-26', '2026-11-25']);
    expect(daysToFreeze(days, new Set(), new Set(), 2)).toEqual([]); // không có chuỗi để giữ
  });
  it('mỗi 7 ngày được 1 thẻ, tối đa 2', () => {
    expect(freezeReward(7, 0, 0)).toMatchObject({ freezes: 1, lastRewardStreak: 7 });
    expect(freezeReward(21, 0, 1)).toMatchObject({ freezes: 2, lastRewardStreak: 21 });
    expect(freezeReward(3, 14, 1)).toMatchObject({ freezes: 1, lastRewardStreak: 0 });
  });
  it('cấp độ theo XP', () => {
    expect(levelOf(0).level).toBe(1);
    expect(levelOf(50).level).toBe(2);
    expect(levelOf(149).level).toBe(2);
    expect(levelOf(150).level).toBe(3);
  });
});

describe('đồng hồ phòng học chung', () => {
  const start = new Date('2026-11-27T10:00:00Z');
  it('đang dừng', () => expect(roomPhase(null, 25, 5).phase).toBe('idle'));
  it('tập trung rồi nghỉ, lặp vòng', () => {
    expect(roomPhase(start, 25, 5, new Date('2026-11-27T10:10:00Z'))).toMatchObject({ phase: 'focus', remainingSec: 900, round: 1 });
    expect(roomPhase(start, 25, 5, new Date('2026-11-27T10:27:00Z'))).toMatchObject({ phase: 'break', remainingSec: 180, round: 1 });
    expect(roomPhase(start, 25, 5, new Date('2026-11-27T10:31:00Z'))).toMatchObject({ phase: 'focus', round: 2 });
  });
});

describe('kế hoạch ngày thi', () => {
  const topics = [
    { id: 'a', title: 'Chương 1', minutes: 60, done: false },
    { id: 'b', title: 'Chương 2', minutes: 60, done: false },
    { id: 'c', title: 'Chương 3', minutes: 60, done: true },
  ];
  it('chia hết chủ đề chưa xong trước ngày ôn tổng', () => {
    const p = buildExamPlan({ today: '2026-11-27', examDate: '2026-12-01', topics, dailyCap: 90 });
    expect(p.daysLeft).toBe(4);
    const topicMinutes = p.days.flatMap((d) => d.items).filter((i) => i.kind === 'topic').reduce((a, i) => a + i.minutes, 0);
    expect(topicMinutes).toBe(120);
    expect(p.days[p.days.length - 1].date).toBe('2026-11-30');
    expect(p.days[p.days.length - 1].items[0].kind).toBe('mock');
    expect(p.progress).toBeCloseTo(1 / 3);
  });
  it('phút đã học được trừ vào chủ đề', () => {
    const p = buildExamPlan({ today: '2026-11-27', examDate: '2026-12-01', topics, dailyCap: 90, creditMinutes: 90 });
    expect(p.leftMinutes).toBe(30);
  });
  it('báo quá tải khi không kịp', () => {
    const p = buildExamPlan({ today: '2026-11-27', examDate: '2026-11-29', topics, dailyCap: 60 });
    expect(p.overloaded).toBe(true);
  });
  it('thêm thẻ sắp quên vào hôm nay', () => {
    const p = buildExamPlan({ today: '2026-11-27', examDate: '2026-12-05', topics, dailyCap: 90, forgettingCards: 12 });
    expect(p.days[0].items[0].kind).toBe('cards');
  });
});

describe('nhập Anki', () => {
  it('bỏ HTML, âm thanh', () => expect(cleanAnkiField('<b>quả&nbsp;táo</b><br>[sound:a.mp3]')).toBe('quả táo'));
  it('thẻ cloze', () => expect(noteToCard(['Thủ đô VN là {{c1::Hà Nội::thành phố}}', ''])).toEqual({ front: 'Thủ đô VN là [thành phố]', back: 'Thủ đô VN là Hà Nội' }));
  it('bỏ note thiếu mặt sau', () => expect(noteToCard(['x', ''])).toBeNull());
});

describe('giờ địa phương', () => {
  it('19:00 giờ Việt Nam = 12:00 UTC', () => expect(zonedDate('2026-11-29', '19:00', 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-11-29T12:00:00.000Z'));
  it('nửa đêm New York mùa đông', () => expect(zonedDate('2026-12-01', '00:00', 'America/New_York').toISOString()).toBe('2026-12-01T05:00:00.000Z'));
});
