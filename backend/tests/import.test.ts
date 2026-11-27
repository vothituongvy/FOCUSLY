import { describe, expect, it } from 'vitest';
import { parseCards, parseQuiz } from '../src/services/importParse';

describe('nhập flashcard soạn sẵn', () => {
  it('bản xuất Quizlet (TAB giữa thuật ngữ và định nghĩa)', () => {
    const cards = parseCards('apple\tquả táo\nbook\tquyển sách\nhouse\tngôi nhà');
    expect(cards.length).toBe(3);
    expect(cards[0].front).toBe('apple');
    expect(cards[0].back).toBe('quả táo');
  });
  it('dấu gạch ngang', () => {
    expect(parseCards('cat - con mèo\ndog - con chó\nbird - con chim').length).toBe(3);
  });
});

describe('nhập câu hỏi soạn sẵn', () => {
  it('trắc nghiệm nhiều đáp án đúng', () => {
    const qs = parseQuiz('Câu 1: Số nào là số nguyên tố?\nA. 2\nB. 4\nC. 5\nĐáp án: A, C');
    expect(qs.length).toBe(1);
    expect(qs[0].type).toBe('multi');
    expect(qs[0].correctIndexes).toEqual([0, 2]);
  });
  it('một đáp án đúng', () => {
    const qs = parseQuiz('Câu 1: Thủ đô Việt Nam?\nA. Hà Nội\nB. Huế\nĐáp án: A');
    expect(qs[0].type).toBe('mcq');
    expect(qs[0].correctIndex).toBe(0);
  });
});
