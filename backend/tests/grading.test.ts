import { describe, expect, it } from 'vitest';
import { gradeQuestion, gradeShort, normalizeAnswer } from '../src/services/learn';

describe('Chấm câu hỏi', () => {
  it('chuẩn hoá tiếng Việt', () => {
    expect(normalizeAnswer('  Đúng RỒI!! ')).toBe('dung roi');
  });

  it('short answer: không phân biệt dấu, hoa thường, lỗi gõ nhỏ', () => {
    expect(gradeShort('dependency array', ['Dependency Array'])).toBe(true);
    expect(gradeShort('dependancy array', ['dependency array'])).toBe(true);
    expect(gradeShort('mảng phụ thuộc', ['mang phu thuoc'])).toBe(true);
    expect(gradeShort('useState', ['useEffect'])).toBe(false);
    expect(gradeShort('', ['x'])).toBe(false);
  });

  it('mcq & true/false', () => {
    const mcq = { qid: 'a', type: 'mcq' as const, prompt: 'p', options: ['A', 'B', 'C'], correctIndex: 1, acceptedAnswers: [] };
    expect(gradeQuestion(mcq, 1).correct).toBe(true);
    expect(gradeQuestion(mcq, '1').correct).toBe(true);
    expect(gradeQuestion(mcq, 0)).toEqual({ correct: false, correctAnswer: 'B' });
    const tf = { qid: 'b', type: 'true_false' as const, prompt: 'p', options: [], correctBoolean: false, acceptedAnswers: [] };
    expect(gradeQuestion(tf, false).correct).toBe(true);
    expect(gradeQuestion(tf, 'true').correct).toBe(false);
  });
});
