import { z } from 'zod';
import { CardModel, QuizAttemptModel, QuizModel, ReviewLogModel } from '../models/Learn';
import { FocusSessionModel } from '../models/FocusSession';
import { badRequest, notFound, parse } from '../utils/http';
import { notifyChange } from './realtime';
import { findOwned } from './entities';
import { review } from './srs';

/* ---------------- Flashcard review (SM-2) ---------------- */

export const reviewSchema = z.object({
  grade: z.number().int().min(0).max(5),
  at: z.coerce.date().optional(),
  clientId: z.string().max(80).optional(), // chống ghi trùng khi gửi lại từ offline
});

export async function reviewCard(userId: string, cardId: string, body: unknown) {
  const data = parse(reviewSchema, body);
  const card = await findOwned(CardModel, userId, cardId);
  if (!card || card.deletedAt) throw notFound('Thẻ không tồn tại');
  if (data.clientId && (await ReviewLogModel.exists({ user: userId, clientId: data.clientId }))) return card;

  const now = data.at && data.at < new Date() ? data.at : new Date();
  const before = card.srs?.interval ?? 0;
  const next = review(card.srs ?? {}, data.grade, now);
  card.set('srs', next);
  await card.save();
  await ReviewLogModel.create({
    user: userId,
    card: card._id,
    deck: card.deck,
    grade: data.grade,
    intervalBefore: before,
    intervalAfter: next.interval,
    easeAfter: next.ease,
    reviewedAt: now,
    clientId: data.clientId,
  });
  notifyChange(userId, 'cards', 'update', card.toJSON());
  return card;
}

/* ---------------- Quiz grading ---------------- */

/** Chuẩn hoá câu trả lời: bỏ dấu tiếng Việt, ký tự đặc biệt, khoảng trắng thừa */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function gradeShort(answer: string, accepted: string[]): boolean {
  const a = normalizeAnswer(answer);
  if (!a) return false;
  return accepted.some((acc) => {
    const n = normalizeAnswer(acc);
    if (!n) return false;
    if (a === n) return true;
    // chấp nhận lỗi gõ nhỏ với đáp án dài
    if (n.length >= 6 && levenshtein(a, n) <= Math.floor(n.length / 8) + 1) return true;
    // câu trả lời chứa đầy đủ cụm đáp án
    return n.length >= 4 && a.includes(n);
  });
}

type Q = {
  qid: string;
  type: 'mcq' | 'multi' | 'true_false' | 'short';
  prompt: string;
  options: string[];
  correctIndex?: number | null;
  correctIndexes?: number[];
  correctBoolean?: boolean | null;
  acceptedAnswers: string[];
  explanation?: string;
};

export function gradeQuestion(q: Q, answer: unknown): { correct: boolean; correctAnswer: string } {
  if (q.type === 'mcq') {
    const idx = typeof answer === 'number' ? answer : Number(answer);
    return { correct: idx === q.correctIndex, correctAnswer: q.options[q.correctIndex ?? 0] ?? '' };
  }
  if (q.type === 'multi') {
    // Đúng khi chọn ĐỦ và CHỈ các đáp án đúng
    const picked = new Set((Array.isArray(answer) ? answer : []).map(Number));
    const right = new Set(q.correctIndexes ?? []);
    const correct = picked.size === right.size && [...right].every((i) => picked.has(i));
    return { correct, correctAnswer: [...right].sort((a, b) => a - b).map((i) => q.options[i]).filter(Boolean).join('; ') };
  }
  if (q.type === 'true_false') {
    const v = typeof answer === 'boolean' ? answer : answer === 'true';
    return { correct: v === q.correctBoolean, correctAnswer: q.correctBoolean ? 'Đúng' : 'Sai' };
  }
  return { correct: gradeShort(String(answer ?? ''), q.acceptedAnswers), correctAnswer: q.acceptedAnswers[0] ?? '' };
}

export const attemptSchema = z.object({
  quiz: z.string().optional(),
  answers: z.array(z.object({ qid: z.string(), answer: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.number())]) })).max(100),
  durationSeconds: z.number().min(0).max(86400).optional(),
  session: z.string().nullable().optional(),
  startedAt: z.coerce.date().optional(),
  clientId: z.string().max(80).optional(),
});

export async function submitAttempt(userId: string, quizId: string, body: unknown) {
  const data = parse(attemptSchema, body);
  const quiz = await findOwned(QuizModel, userId, quizId);
  if (!quiz || quiz.deletedAt) throw notFound('Bộ câu hỏi không tồn tại');
  if (data.clientId) {
    const existing = await QuizAttemptModel.findOne({ user: userId, clientId: data.clientId });
    if (existing) return existing;
  }
  const questions = quiz.questions as unknown as Q[];
  if (!questions.length) throw badRequest('Bộ câu hỏi chưa có câu nào');
  const byId = new Map(data.answers.map((a) => [a.qid, a.answer]));

  const graded = questions.map((q) => {
    const answer = byId.get(q.qid) ?? null;
    const r = gradeQuestion(q, answer);
    return { qid: q.qid, answer, correct: r.correct, prompt: q.prompt, correctAnswer: r.correctAnswer, explanation: q.explanation ?? '' };
  });
  const score = graded.filter((g) => g.correct).length;

  let sessionId = null;
  if (data.session) {
    const s = await findOwned(FocusSessionModel, userId, data.session);
    sessionId = s?._id ?? null;
  }
  const attempt = await QuizAttemptModel.create({
    user: userId,
    clientId: data.clientId,
    quiz: quiz._id,
    subject: quiz.subject,
    session: sessionId,
    answers: graded,
    score,
    total: questions.length,
    accuracy: score / questions.length,
    durationSeconds: data.durationSeconds ?? 0,
    startedAt: data.startedAt ?? new Date(),
    completedAt: new Date(),
  });
  notifyChange(userId, 'quizAttempts', 'create', attempt.toJSON());
  return attempt;
}
