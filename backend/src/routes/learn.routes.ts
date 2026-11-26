import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, notFound, parse } from '../utils/http';
import { CardModel, DeckModel, QuizAttemptModel, QuizModel, ReviewLogModel } from '../models/Learn';
import { UserModel } from '../models/User';
import { createEntity, findOwned } from '../services/entities';
import { reviewCard, submitAttempt } from '../services/learn';
import { cardStage } from '../services/srs';
import { dayKey, lastDayKeys, safeTimeZone, wideRange } from '../utils/time';

/**
 * Phase 2 – Active Recall & Quiz, Flashcard, Spaced Repetition, Learning Progress
 */
const router = Router();
router.use(requireAuth);

/* GET /learn/overview — tổng quan ôn tập */
router.get(
  '/overview',
  ah(async (req, res) => {
    const userId = uid(req);
    const now = new Date();
    const [decks, cards, logs, attempts, user] = await Promise.all([
      DeckModel.find({ user: userId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
      CardModel.find({ user: userId, deletedAt: null }).select('deck srs suspended').lean(),
      ReviewLogModel.find({ user: userId, reviewedAt: { $gte: new Date(now.getTime() - 30 * 86_400_000) } }).lean(),
      QuizAttemptModel.find({ user: userId, deletedAt: null }).sort({ completedAt: -1 }).limit(20).populate('quiz', 'title').lean(),
      UserModel.findById(userId).select('profile.timezone').lean(),
    ]);
    const tz = safeTimeZone(user?.profile?.timezone);
    const today = dayKey(now, tz);

    const deckStats = decks.map((d) => {
      const list = cards.filter((c) => String(c.deck) === String(d._id) && !c.suspended);
      const stages = { new: 0, learning: 0, young: 0, mature: 0 };
      list.forEach((c) => stages[cardStage(c.srs ?? {})]++);
      return {
        ...d,
        id: String(d._id),
        _id: undefined,
        total: list.length,
        due: list.filter((c) => c.srs?.due && new Date(c.srs.due) <= now).length,
        ...stages,
      };
    });

    const reviewsToday = logs.filter((l) => dayKey(l.reviewedAt, tz) === today).length;
    const retention = logs.length ? logs.filter((l) => l.grade >= 3).length / logs.length : null;
    const reviewDays = lastDayKeys(14, tz, now).map((k) => ({ date: k, reviews: logs.filter((l) => dayKey(l.reviewedAt, tz) === k).length }));

    res.json({
      dueTotal: deckStats.reduce((a, d) => a + d.due, 0),
      cardTotal: cards.length,
      reviewsToday,
      retention30d: retention,
      reviewDays,
      decks: deckStats,
      recentAttempts: attempts.map((a) => ({ ...a, id: String(a._id), _id: undefined })),
      avgQuizAccuracy: attempts.length ? attempts.reduce((s, a) => s + a.accuracy, 0) / attempts.length : null,
    });
  }),
);

/* GET /learn/due?deck=&limit= — thẻ cần ôn (đến hạn + thẻ mới) */
router.get(
  '/due',
  ah(async (req, res) => {
    const filter: Record<string, unknown> = { user: uid(req), deletedAt: null, suspended: { $ne: true }, 'srs.due': { $lte: new Date() } };
    if (req.query.deck) {
      const deck = await findOwned(DeckModel, uid(req), String(req.query.deck));
      if (!deck) throw notFound('Bộ thẻ không tồn tại');
      filter.deck = deck._id;
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await CardModel.find(filter).sort({ 'srs.due': 1 }).limit(limit);
    res.json({ items });
  }),
);

/* POST /learn/cards/:id/review { grade 0..5, clientId?, at? } */
router.post(
  '/cards/:id/review',
  ah(async (req, res) => {
    res.json({ item: await reviewCard(uid(req), req.params.id, req.body) });
  }),
);

/* POST /learn/quizzes/:id/attempts { answers:[{qid, answer}], durationSeconds, session? } */
router.post(
  '/quizzes/:id/attempts',
  ah(async (req, res) => {
    res.status(201).json({ item: await submitAttempt(uid(req), req.params.id, req.body) });
  }),
);

/* GET /learn/attempts?quiz= */
router.get(
  '/attempts',
  ah(async (req, res) => {
    const filter: Record<string, unknown> = { user: uid(req), deletedAt: null };
    if (req.query.quiz && Types.ObjectId.isValid(String(req.query.quiz))) filter.quiz = String(req.query.quiz);
    const items = await QuizAttemptModel.find(filter).sort({ completedAt: -1 }).limit(100).populate('quiz', 'title');
    res.json({ items });
  }),
);

/* GET /learn/mistakes?days=30 — câu trả lời sai gần đây (Review Mistakes) */
router.get(
  '/mistakes',
  ah(async (req, res) => {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const attempts = await QuizAttemptModel.find({ user: uid(req), deletedAt: null, completedAt: { $gte: new Date(Date.now() - days * 86_400_000) } })
      .sort({ completedAt: -1 })
      .populate('quiz', 'title subject')
      .lean();
    // chỉ lấy kết quả MỚI NHẤT của mỗi câu: nếu lần gần nhất đã đúng thì không còn là "câu sai"
    const latest = new Map<string, Record<string, unknown>>();
    for (const a of attempts) {
      for (const ans of a.answers ?? []) {
        const key = `${String((a.quiz as { _id?: unknown })?._id ?? a.quiz)}:${ans.qid}`;
        if (latest.has(key)) continue;
        latest.set(key, {
          key,
          quizId: String((a.quiz as { _id?: unknown })?._id ?? a.quiz),
          quizTitle: (a.quiz as { title?: string })?.title ?? '',
          qid: ans.qid,
          prompt: ans.prompt,
          yourAnswer: ans.answer,
          correctAnswer: ans.correctAnswer,
          explanation: ans.explanation,
          correct: ans.correct,
          at: a.completedAt,
        });
      }
    }
    res.json({ items: [...latest.values()].filter((m) => !m.correct) });
  }),
);

/* POST /learn/mistakes/to-cards { deck?, items:[{prompt, correctAnswer, explanation}] } */
router.post(
  '/mistakes/to-cards',
  ah(async (req, res) => {
    const data = parse(
      z.object({
        deck: z.string().optional(),
        items: z.array(z.object({ prompt: z.string().min(1), correctAnswer: z.string().min(1), explanation: z.string().optional() })).min(1).max(100),
      }),
      req.body,
    );
    let deckId = data.deck;
    if (!deckId) {
      const existing = await DeckModel.findOne({ user: uid(req), title: 'Ôn câu sai', deletedAt: null });
      deckId = existing?.id ?? (await createEntity('decks', uid(req), { title: 'Ôn câu sai', description: 'Tự tạo từ các câu trả lời sai', color: '#ef4444' })).id;
    }
    const cards = [];
    for (const it of data.items) {
      cards.push(
        await createEntity('cards', uid(req), {
          deck: deckId,
          front: it.prompt,
          back: it.explanation ? `${it.correctAnswer}\n\n${it.explanation}` : it.correctAnswer,
          source: 'quiz_mistake',
        }),
      );
    }
    res.status(201).json({ deck: deckId, created: cards.length });
  }),
);

/* GET /learn/progress — mức độ ghi nhớ & kết quả kiểm tra theo thời gian */
router.get(
  '/progress',
  ah(async (req, res) => {
    const userId = uid(req);
    const user = await UserModel.findById(userId).select('profile.timezone').lean();
    const tz = safeTimeZone(user?.profile?.timezone);
    const r = wideRange(30);
    const [logs, attempts, quizzes] = await Promise.all([
      ReviewLogModel.find({ user: userId, reviewedAt: { $gte: r.from } }).lean(),
      QuizAttemptModel.find({ user: userId, deletedAt: null, completedAt: { $gte: r.from } }).lean(),
      QuizModel.find({ user: userId, deletedAt: null }).select('title subject').lean(),
    ]);
    const days = lastDayKeys(30, tz).map((k) => {
      const l = logs.filter((x) => dayKey(x.reviewedAt, tz) === k);
      const a = attempts.filter((x) => dayKey(x.completedAt, tz) === k);
      return {
        date: k,
        reviews: l.length,
        retention: l.length ? l.filter((x) => x.grade >= 3).length / l.length : null,
        quizAccuracy: a.length ? a.reduce((s, x) => s + x.accuracy, 0) / a.length : null,
      };
    });
    const perQuiz = quizzes.map((q) => {
      const list = attempts.filter((a) => String(a.quiz) === String(q._id)).sort((a, b) => +a.completedAt - +b.completedAt);
      return {
        quizId: String(q._id),
        title: q.title,
        attempts: list.length,
        first: list[0]?.accuracy ?? null,
        last: list[list.length - 1]?.accuracy ?? null,
        best: list.length ? Math.max(...list.map((a) => a.accuracy)) : null,
      };
    });
    res.json({ days, perQuiz });
  }),
);

export default router;
