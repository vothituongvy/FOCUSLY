import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, HttpError, notFound, parse } from '../utils/http';
import { ConversationModel } from '../models/AI';
import { MaterialModel, RecallModel } from '../models/Learn';
import { FocusSessionModel } from '../models/FocusSession';
import { SubjectModel, TaskModel } from '../models/Learning';
import { findOwned } from '../services/entities';
import { aiEnabled, complete, completeJson, relevantChunks, TRANSLATE_LIMIT_PER_HOUR, TUTOR_SYSTEM, usedLastHour } from '../services/ai';
import { computeInsights } from '../services/analytics';
import { CardModel } from '../models/Learn';
import { UserModel } from '../models/User';
import { dayKey, safeTimeZone } from '../utils/time';
import * as brain from '../services/brain';
import { extractText } from '../services/textExtract';
import { parseCards, parseQuiz } from '../services/importParse';

/**
 * PHASE 3 – AI Learning Assistant
 * AI chỉ đưa ra gợi ý: quiz/flashcard/kế hoạch sinh ra là BẢN NHÁP, người học xem – sửa – chọn lưu.
 */
const router = Router();
router.use(requireAuth);

async function loadMaterialText(userId: string, materialId?: string | null) {
  if (!materialId) return null;
  const m = await findOwned(MaterialModel, userId, materialId);
  if (!m || m.deletedAt) throw notFound('Tài liệu không tồn tại');
  const full = await MaterialModel.findById(m._id).select('+textContent');
  const text = full?.textContent || '';
  if (!text) throw badRequest('Tài liệu chưa có nội dung văn bản (ảnh/PDF scan chưa hỗ trợ trích chữ)');
  return { material: m, text };
}

async function sourceText(userId: string, materialId?: string | null, topic?: string, query = '') {
  if (materialId) {
    const r = await loadMaterialText(userId, materialId);
    return { label: `tài liệu "${r!.material.title}"`, content: relevantChunks(r!.text, query || r!.material.title, 14_000), material: r!.material };
  }
  if (topic && brain.useBrain()) {
    const t = await brain.topicText(userId, topic);
    if (!t.text) throw badRequest(`Không tìm thấy nội dung về “${topic}” trong tài liệu của bạn lẫn trên Wikipedia. Thử gõ đúng tên khái niệm (VD: “Quang hợp”), hoặc dùng “Tạo từ file”.`);
    return { label: `chủ đề "${topic}"`, content: t.text, material: null };
  }
  if (topic) return { label: `chủ đề "${topic}"`, content: `Chủ đề: ${topic}`, material: null };
  throw badRequest('Cần materialId hoặc topic');
}

/* GET /ai/status */
router.get(
  '/status',
  ah(async (req, res) => {
    res.json({
      enabled: aiEnabled(),
      provider: brain.useBrain() ? 'brain' : 'claude',
      knowledge: await brain.knowledgeStats().catch(() => null),
      model: brain.useBrain() ? 'FOCUSLY Brain' : env.ai.model,
      usedLastHour: await usedLastHour(uid(req)),
      limitPerHour: env.ai.maxRequestsPerHour,
      translateUsedLastHour: await usedLastHour(uid(req), 'translate'),
      translateLimitPerHour: TRANSLATE_LIMIT_PER_HOUR,
    });
  }),
);

/* ---------------- AI Chat ---------------- */
router.get(
  '/conversations',
  ah(async (req, res) => {
    const items = await ConversationModel.find({ user: uid(req), deletedAt: null }).sort({ updatedAt: -1 }).limit(50).select('-messages');
    res.json({ items });
  }),
);

router.get(
  '/conversations/:id',
  ah(async (req, res) => {
    const c = await ConversationModel.findOne({ _id: req.params.id, user: uid(req), deletedAt: null });
    if (!c) throw notFound();
    res.json({ item: c });
  }),
);

router.delete(
  '/conversations/:id',
  ah(async (req, res) => {
    await ConversationModel.updateOne({ _id: req.params.id, user: uid(req) }, { deletedAt: new Date() });
    res.json({ ok: true });
  }),
);

router.post(
  '/chat',
  ah(async (req, res) => {
    const data = parse(
      z.object({
        conversationId: z.string().optional(),
        message: z.string().trim().min(1).max(4000),
        materialId: z.string().nullable().optional(),
        subjectId: z.string().nullable().optional(),
      }),
      req.body,
    );
    const userId = uid(req);
    let conv = data.conversationId ? await ConversationModel.findOne({ _id: data.conversationId, user: userId, deletedAt: null }) : null;
    if (!conv) {
      conv = await ConversationModel.create({
        user: userId,
        title: data.message.slice(0, 60),
        material: data.materialId ?? null,
        subject: data.subjectId ?? null,
      });
    }
    const materialId = data.materialId ?? (conv.material ? String(conv.material) : null);
    let reply: string;
    if (brain.useBrain()) {
      reply = await brain.answer(userId, data.message, materialId);
    } else {
      let system = TUTOR_SYSTEM;
      if (materialId) {
        const src = await loadMaterialText(userId, materialId);
        system += `\n\nTÀI LIỆU THAM KHẢO – "${src!.material.title}":\n${relevantChunks(src!.text, data.message, 12_000)}`;
      } else if (conv.subject) {
        const s = await SubjectModel.findById(conv.subject).select('name');
        if (s) system += `\n\nNgười học đang học môn: ${s.name}.`;
      }
      const history = (conv.messages as unknown as { role: 'user' | 'assistant'; content: string }[]).slice(-20).map((m) => ({ role: m.role, content: m.content }));
      reply = await complete({
        userId,
        feature: 'chat',
        system,
        messages: [...history, { role: 'user', content: data.message }],
        maxTokens: 1800,
      });
    }
    conv.messages.push({ role: 'user', content: data.message, at: new Date() }, { role: 'assistant', content: reply, at: new Date() });
    await conv.save();
    res.json({ conversationId: conv.id, reply, item: conv });
  }),
);

/* ---------------- Document Summary ---------------- */
router.post(
  '/summarize',
  ah(async (req, res) => {
    const data = parse(z.object({ materialId: z.string(), length: z.enum(['short', 'detailed']).default('short') }), req.body);
    const src = await loadMaterialText(uid(req), data.materialId);
    if (brain.useBrain()) {
      const summary = brain.makeSummary(src!.text, src!.material.title, data.length === 'detailed');
      src!.material.aiSummary = summary;
      src!.material.aiSummaryAt = new Date();
      await src!.material.save();
      return res.json({ summary, item: src!.material });
    }
    const summary = await complete({
      userId: uid(req),
      feature: 'summary',
      system: TUTOR_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Tóm tắt tài liệu "${src!.material.title}" ${data.length === 'short' ? 'ngắn gọn (tối đa ~200 từ)' : 'chi tiết theo từng phần'} bằng Markdown:
1. Ý chính (gạch đầu dòng)
2. Khái niệm quan trọng (thuật ngữ: giải thích 1 câu)
3. Phần dễ nhầm / khó hiểu cần chú ý
4. 3 câu hỏi tự kiểm tra

NỘI DUNG:
${relevantChunks(src!.text, src!.material.title, 16_000)}`,
        },
      ],
      maxTokens: data.length === 'short' ? 900 : 2200,
    });
    src!.material.aiSummary = summary;
    src!.material.aiSummaryAt = new Date();
    await src!.material.save();
    res.json({ summary, item: src!.material });
  }),
);

/* ---------------- Explain Concepts ---------------- */
router.post(
  '/explain',
  ah(async (req, res) => {
    const data = parse(
      z.object({
        concept: z.string().trim().min(1).max(500),
        context: z.string().max(4000).optional(),
        level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
        materialId: z.string().optional(),
      }),
      req.body,
    );
    if (brain.useBrain()) {
      // Người dùng gõ cả câu hỏi ("Tài liệu này nói về gì?") thay vì tên khái niệm -> chuyển sang trợ lý hỏi đáp
      const isQuestion = data.concept.split(/\s+/).length > 5 || /[?？]$|\b(gì|sao|thế nào|như nào|tại sao|vì sao|what|how|why)\b/iu.test(data.concept);
      if (isQuestion) return res.json({ explanation: await brain.answer(uid(req), data.concept, data.materialId ?? null) });
      let text = data.context ?? '';
      if (data.materialId) text += '\n' + ((await loadMaterialText(uid(req), data.materialId))?.text ?? '');
      else text += '\n' + (await brain.topicText(uid(req), data.concept)).text;
      // không thấy câu định nghĩa -> tìm đoạn liên quan trong tài liệu, rồi tới Wikipedia
      const explanation = brain.explainFromText(data.concept, text) ?? (await brain.answer(uid(req), data.concept, data.materialId ?? null));
      return res.json({ explanation });
    }
    let ctx = data.context ?? '';
    if (data.materialId) {
      const src = await loadMaterialText(uid(req), data.materialId);
      ctx += `\n\nTrích tài liệu:\n${relevantChunks(src!.text, data.concept, 6000)}`;
    }
    const levelText = { beginner: 'người mới bắt đầu, dùng ví dụ đời thường', intermediate: 'người đã có nền tảng', advanced: 'người học nâng cao, đi sâu bản chất' }[data.level];
    const explanation = await complete({
      userId: uid(req),
      feature: 'explain',
      system: TUTOR_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Giải thích "${data.concept}" cho ${levelText}. Cấu trúc: định nghĩa ngắn → ví dụ → lỗi thường gặp → 1 câu hỏi kiểm tra nhanh (kèm đáp án ẩn ở cuối).${ctx ? `\n\nNgữ cảnh:\n${ctx}` : ''}`,
        },
      ],
      maxTokens: 1500,
    });
    res.json({ explanation });
  }),
);

/* ---------------- Quiz Generation (bản nháp) ---------------- */
const QTYPES = ['mcq', 'multi', 'true_false', 'short'] as const;
type QType = (typeof QTYPES)[number];
const genQuestion = z.object({
  type: z.enum(QTYPES),
  prompt: z.string().min(1),
  options: z.array(z.string()).default([]),
  correctIndex: z.number().int().nullable().optional(),
  correctIndexes: z.array(z.number().int()).default([]),
  correctBoolean: z.boolean().nullable().optional(),
  acceptedAnswers: z.array(z.string()).default([]),
  explanation: z.string().default(''),
});

/** AI soạn câu hỏi từ một nguồn (chủ đề, tài liệu, file) rồi loại câu lỗi */
async function aiQuiz(userId: string, src: { label: string; content: string }, count: number, types: readonly QType[], difficulty: string) {
  if (brain.useBrain()) {
    const out = brain.makeQuiz(src.content, count, types, src.label.replace(/^(tài liệu|chủ đề)\s+/, '').replace(/["“”]/g, ''));
    if (!out.questions.length) throw badRequest('Nội dung quá ngắn để soạn câu hỏi. Hãy dùng tài liệu dài hơn (ít nhất vài đoạn văn).');
    return out;
  }
  const out = await completeJson({
    userId,
    feature: 'quiz_generation',
    system: TUTOR_SYSTEM,
    schema: z.object({ title: z.string(), questions: z.array(genQuestion).min(1) }),
    maxTokens: 4000,
    messages: [
      {
        role: 'user',
        content: `Tạo ${count} câu hỏi kiểm tra (độ khó: ${difficulty}) về ${src.label}, chỉ dùng các loại: ${types.join(', ')}.
Định dạng JSON: {"title": string, "questions": [{"type":"mcq"|"multi"|"true_false"|"short","prompt":string,"options":[4 lựa chọn nếu mcq/multi],"correctIndex":số (mcq – đúng 1 đáp án),"correctIndexes":[các số] (multi – từ 2 đáp án đúng trở lên, ghi rõ "chọn tất cả đáp án đúng" trong prompt),"correctBoolean":bool (true_false),"acceptedAnswers":[các đáp án chấp nhận ngắn gọn] (short),"explanation":string}]}
Câu hỏi phải kiểm tra HIỂU BÀI (không chỉ học thuộc), đáp án nhiễu hợp lý.

${src.content}`,
      },
    ],
  });
  const questions = out.questions
    .filter((q) => types.includes(q.type))
    .map((q) => (q.type === 'multi' ? { ...q, correctIndexes: [...new Set(q.correctIndexes)].filter((i) => i >= 0 && i < q.options.length).sort((x, y) => x - y) } : q))
    .filter((q) =>
      q.type === 'mcq'
        ? q.options.length >= 2 && q.correctIndex != null && q.correctIndex < q.options.length
        : q.type === 'multi'
          ? q.options.length >= 2 && q.correctIndexes.length > 0
          : q.type === 'true_false'
            ? q.correctBoolean != null
            : q.acceptedAnswers.length > 0,
    );
  return { title: out.title, questions };
}

const cardsSchema = z.object({ title: z.string(), cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1), hint: z.string().optional() })).min(1) });

async function aiCards(userId: string, src: { label: string; content: string }, count: number) {
  if (brain.useBrain()) {
    const out = brain.makeFlashcards(src.content, count, src.label.replace(/^(tài liệu|chủ đề)\s+/, '').replace(/["“”]/g, ''));
    if (!out.cards.length) throw badRequest('Nội dung quá ngắn để tạo flashcard. Hãy dùng tài liệu dài hơn (ít nhất vài đoạn văn).');
    return out;
  }
  const out = await completeJson({
    userId,
    feature: 'flashcard_generation',
    system: TUTOR_SYSTEM,
    schema: cardsSchema,
    maxTokens: 3500,
    messages: [
      {
        role: 'user',
        content: `Tạo ${count} flashcard về ${src.label}. Mỗi thẻ: mặt trước là câu hỏi/khái niệm ngắn, mặt sau là câu trả lời súc tích (≤ 40 từ), tuân theo nguyên tắc "một ý mỗi thẻ".
JSON: {"title": string, "cards": [{"front": string, "back": string, "hint": string}]}

${src.content}`,
      },
    ],
  });
  return { title: out.title, cards: out.cards.slice(0, count) };
}

router.post(
  '/generate/quiz',
  ah(async (req, res) => {
    const data = parse(
      z.object({
        materialId: z.string().optional(),
        topic: z.string().max(300).optional(),
        sessionId: z.string().optional(),
        count: z.number().int().min(3).max(25).default(10),
        types: z.array(z.enum(QTYPES)).min(1).default(['mcq', 'multi', 'true_false', 'short']),
        difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
      }),
      req.body,
    );
    let topic = data.topic;
    // Sau phiên học: tạo câu hỏi theo mục tiêu phiên / nhiệm vụ
    if (!topic && !data.materialId && data.sessionId) {
      const s = await findOwned(FocusSessionModel, uid(req), data.sessionId);
      const task = s?.task ? await TaskModel.findById(s.task).select('title expectedOutcome description') : null;
      topic = [s?.goal, task?.title, task?.expectedOutcome, task?.description].filter(Boolean).join(' – ');
    }
    const src = await sourceText(uid(req), data.materialId, topic);
    const out = await aiQuiz(uid(req), src, data.count, data.types, data.difficulty);
    res.json({
      draft: { title: out.title, source: 'ai', material: src.material?.id ?? null, subject: src.material?.subject ?? null, questions: out.questions },
      note: 'Đây là bản nháp do AI tạo – hãy kiểm tra, sửa hoặc xoá câu chưa phù hợp trước khi lưu.',
    });
  }),
);

/* ---------------- Flashcard Generation (bản nháp) ---------------- */
router.post(
  '/generate/flashcards',
  ah(async (req, res) => {
    const data = parse(z.object({ materialId: z.string().optional(), topic: z.string().max(300).optional(), count: z.number().int().min(3).max(40).default(15) }), req.body);
    const src = await sourceText(uid(req), data.materialId, data.topic);
    const out = await aiCards(uid(req), src, data.count);
    res.json({
      draft: { title: out.title, material: src.material?.id ?? null, subject: src.material?.subject ?? null, cards: out.cards },
      note: 'Bản nháp do AI tạo – chọn các thẻ muốn giữ rồi lưu.',
    });
  }),
);

/* ---------------- Tạo câu hỏi / flashcard TỪ FILE ----------------
 * POST /ai/import (multipart: file, target=quiz|flashcards, count?, mode=auto|parse|ai)
 * - File đã soạn sẵn (Câu 1 / A. B. C. / Đáp án: ..., bảng thuật ngữ – định nghĩa, Excel...) -> nhập thẳng, không tốn lượt AI
 * - File là tài liệu học (bài giảng, giáo trình) -> AI đọc nội dung và soạn
 * Trả về BẢN NHÁP giống /generate/* để người học xem lại trước khi lưu.
 */
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(pdf|docx|xlsx|txt|md|csv|tsv)$/i.test(file.originalname) || /pdf|wordprocessingml|spreadsheetml|^text\//.test(file.mimetype)) cb(null, true);
    else cb(badRequest('Chỉ hỗ trợ PDF, Word (.docx), Excel (.xlsx), TXT, CSV'));
  },
});

router.post(
  '/import',
  importUpload.single('file'),
  ah(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Chọn một file');
    const data = parse(
      z.object({
        target: z.enum(['quiz', 'flashcards']),
        mode: z.enum(['auto', 'parse', 'ai']).default('auto'),
        count: z.coerce.number().int().min(3).max(40).optional(),
      }),
      req.body,
    );
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const title = name.replace(/\.[^.]+$/, '');
    const { text } = await extractText(file.buffer, file.mimetype, name);
    if (!text.trim()) throw badRequest('Không đọc được chữ trong file (PDF dạng ảnh scan chưa hỗ trợ). Hãy thử file Word, Excel hoặc TXT.');

    if (data.mode !== 'ai') {
      if (data.target === 'quiz') {
        const questions = parseQuiz(text);
        if (questions.length) return res.json({ mode: 'parsed', draft: { title, source: 'manual', material: null, subject: null, questions } });
      } else {
        const cards = parseCards(text);
        if (cards.length) return res.json({ mode: 'parsed', draft: { title, material: null, subject: null, cards } });
      }
      if (data.mode === 'parse') throw badRequest('Không nhận ra câu hỏi/thẻ soạn sẵn trong file. Xem mẫu định dạng hoặc chọn "AI tạo từ nội dung".');
    }

    const src = { label: `tài liệu "${title}"`, content: relevantChunks(text, title, 14_000) };
    if (data.target === 'quiz') {
      const out = await aiQuiz(uid(req), src, data.count ?? 10, QTYPES, 'medium');
      return res.json({ mode: 'ai', draft: { title: out.title || title, source: 'ai', material: null, subject: null, questions: out.questions } });
    }
    const out = await aiCards(uid(req), src, data.count ?? 15);
    res.json({ mode: 'ai', draft: { title: out.title || title, material: null, subject: null, cards: out.cards } });
  }),
);

/* ---------------- Dịch Anh ⇄ Việt (dùng ngay trong phiên học, khỏi mở tab khác) ---------------- */
const translateSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  to: z.enum(['auto', 'vi', 'en']).default('auto'),
});
const translateResult = z.object({
  from: z.enum(['vi', 'en', 'other']),
  to: z.enum(['vi', 'en']),
  translation: z.string(),
  // Chỉ có khi tra một từ/cụm từ ngắn
  phonetic: z.string().optional().nullable(),
  partOfSpeech: z.string().optional().nullable(),
  alternatives: z.array(z.string()).max(4).default([]),
  example: z.object({ source: z.string(), target: z.string() }).optional().nullable(),
});

router.post(
  '/translate',
  ah(async (req, res) => {
    const { text, to } = parse(translateSchema, req.body);
    const short = text.split(/\s+/).length <= 4;
    if (brain.useBrain()) {
      try {
        return res.json({ ...(await brain.translateFree(text, to)), short });
      } catch {
        throw new HttpError(503, 'Dịch vụ dịch miễn phí đang bận, thử lại sau ít phút.', 'TRANSLATE_BUSY');
      }
    }
    const result = await completeJson({
      userId: uid(req),
      feature: 'translate',
      maxTokens: short ? 500 : 1500,
      temperature: 0.2,
      schema: translateResult,
      system: `You are a precise English–Vietnamese translator for students.
Detect the source language. Translate English → Vietnamese and Vietnamese → English${to === 'auto' ? '' : `; the target language is forced to "${to}"`}. Other languages → Vietnamese.
Keep meaning, tone and formatting (line breaks, lists, formulas). Do not add explanations to the translation itself.
Return JSON: {"from":"vi|en|other","to":"vi|en","translation":"...","phonetic":null,"partOfSpeech":null,"alternatives":[],"example":null}.
If the input is a single word or short phrase (≤ 4 words), also fill: "phonetic" (IPA, English words only), "partOfSpeech" (in Vietnamese, e.g. "danh từ"), up to 3 "alternatives" (other common meanings in the target language), and one short "example" {"source","target"} sentence pair. Otherwise leave them null/empty.`,
      messages: [{ role: 'user', content: text }],
    });
    res.json({ ...result, short });
  }),
);

/* ---------------- Phản hồi cho Active Recall ---------------- */
router.post(
  '/recall-feedback',
  ah(async (req, res) => {
    const { recallId } = parse(z.object({ recallId: z.string() }), req.body);
    const recall = await findOwned(RecallModel, uid(req), recallId);
    if (!recall) throw notFound();
    const session = recall.session ? await FocusSessionModel.findById(recall.session).select('goal task') : null;
    if (brain.useBrain()) {
      const task = session?.task ? await TaskModel.findById(session.task).select('title description expectedOutcome') : null;
      const reference = [task?.title, task?.expectedOutcome, task?.description, session?.goal].filter(Boolean).join('. ');
      const feedback = brain.recallFeedback(recall.content, reference, session?.goal ?? '');
      recall.aiFeedback = feedback;
      await recall.save();
      return res.json({ feedback, item: recall });
    }
    const feedback = await complete({
      userId: uid(req),
      feature: 'recall_feedback',
      system: TUTOR_SYSTEM,
      maxTokens: 900,
      messages: [
        {
          role: 'user',
          content: `Người học vừa kết thúc phiên học${session?.goal ? ` với mục tiêu "${session.goal}"` : ''} và tự viết lại những gì nhớ được:
"""${recall.content}"""
Hãy phản hồi ngắn gọn: (1) điểm đã nắm tốt, (2) chỗ sai/thiếu quan trọng, (3) 2 câu hỏi để tự kiểm tra tiếp. Giọng điệu khích lệ.`,
        },
      ],
    });
    recall.aiFeedback = feedback;
    await recall.save();
    res.json({ feedback, item: recall });
  }),
);

/* ---------------- Study Recommendations + Learning Plan Suggestion ---------------- */
router.post(
  '/recommendations',
  ah(async (req, res) => {
    const userId = uid(req);
    const { insights, analytics } = await computeInsights(userId);
    const [tasks, subjects] = await Promise.all([
      TaskModel.find({ user: userId, deletedAt: null, status: { $in: ['todo', 'in_progress'] } })
        .sort({ deadline: 1 })
        .limit(30)
        .select('title subject deadline estimatedMinutes priority')
        .lean(),
      SubjectModel.find({ user: userId, deletedAt: null }).select('name').lean(),
    ]);
    const subjName = new Map(subjects.map((s) => [String(s._id), s.name]));
    const today = new Date().toISOString().slice(0, 10);
    if (brain.useBrain()) {
      const input = await coachInput(userId, insights, analytics, tasks.map((t) => ({ ...t, subjectName: t.subject ? subjName.get(String(t.subject)) ?? null : null })));
      const out = brain.recommendations(input);
      return res.json({ ...out, ruleInsights: insights, note: 'Gợi ý từ FOCUSLY Brain – chọn mục muốn thêm vào kế hoạch.' });
    }
    const ctx = {
      today,
      dailyTargetMinutes: analytics.dailyTargetMinutes,
      last30Days: analytics.metrics,
      bestFocusTimes: analytics.bestFocusTimes.map((b) => `${b.hour}:00`),
      subjects: analytics.bySubject.map((s) => ({ name: s.name, focusMinutes: s.focusMinutes, quizAccuracy: s.quizAccuracy, tasksDone: s.tasksDone, tasksTotal: s.tasksTotal })),
      openTasks: tasks.map((t) => ({ id: String(t._id), title: t.title, subject: t.subject ? subjName.get(String(t.subject)) : null, deadline: t.deadline, estimatedMinutes: t.estimatedMinutes, priority: t.priority })),
      ruleInsights: insights.map((i) => i.title),
    };
    const out = await completeJson({
      userId,
      feature: 'recommendations',
      system: TUTOR_SYSTEM + '\nBạn là chuyên gia phương pháp học tập, đưa gợi ý thực tế, cụ thể, dựa trên dữ liệu.',
      schema: z.object({
        summary: z.string(),
        recommendations: z.array(z.object({ title: z.string(), reason: z.string() })).max(6),
        plan: z
          .array(
            z.object({
              date: z.string(),
              title: z.string(),
              subject: z.string().nullable().optional(),
              estimatedMinutes: z.number().int().min(5).max(240),
              taskId: z.string().nullable().optional(),
              timeOfDay: z.string().optional(),
            }),
          )
          .max(21),
      }),
      maxTokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Dựa trên dữ liệu học tập (JSON) dưới đây:
1. "summary": nhận xét tổng quan 2-3 câu.
2. "recommendations": tối đa 5 đề xuất cải thiện phương pháp học (title + reason dựa trên số liệu).
3. "plan": kế hoạch 7 ngày tới (từ ${today}), mỗi ngày 1-3 mục, tổng thời lượng mỗi ngày gần với mục tiêu ngày, ưu tiên nhiệm vụ gần deadline và môn yếu, xếp vào khung giờ hiệu quả. Nếu mục gắn với nhiệm vụ có sẵn thì điền taskId.
JSON: {"summary": string, "recommendations":[{"title","reason"}], "plan":[{"date":"YYYY-MM-DD","title","subject","estimatedMinutes","taskId","timeOfDay":"HH:mm"}]}

DỮ LIỆU:
${JSON.stringify(ctx)}`,
        },
      ],
    });
    // map tên môn -> id để client có thể tạo task
    const byName = new Map(subjects.map((s) => [s.name.toLowerCase(), String(s._id)]));
    const plan = out.plan.map((p) => ({ ...p, subjectId: p.subject ? (byName.get(p.subject.toLowerCase()) ?? null) : null }));
    res.json({ ...out, plan, ruleInsights: insights, note: 'Gợi ý từ AI – bạn có thể chọn mục muốn thêm vào kế hoạch.' });
  }),
);

/* ---------------- Performance Insights (diễn giải số liệu) ---------------- */
router.post(
  '/performance',
  ah(async (req, res) => {
    const { range } = parse(z.object({ range: z.enum(['week', 'month']).default('week') }), req.body ?? {});
    const { insights, analytics } = await computeInsights(uid(req));
    if (brain.useBrain()) {
      const input = await coachInput(uid(req), insights, analytics, []);
      return res.json({ analysis: brain.performanceReport(input, range) });
    }
    const text = await complete({
      userId: uid(req),
      feature: 'performance',
      system: TUTOR_SYSTEM,
      maxTokens: 1200,
      messages: [
        {
          role: 'user',
          content: `Phân tích kết quả học tập ${range === 'week' ? 'tuần' : 'tháng'} này bằng Markdown: điểm mạnh, điểm cần cải thiện, 3 hành động cụ thể cho tuần tới. Phân biệt rõ thời gian dự kiến, thời gian tập trung thực tế, số lần phân tâm, tỷ lệ hoàn thành và độ chính xác kiểm tra.
Dữ liệu: ${JSON.stringify({ metrics: analytics.metrics, previous: analytics.previous, bySubject: analytics.bySubject, bestFocusTimes: analytics.bestFocusTimes, insights: insights.map((i) => i.title) })}`,
        },
      ],
    });
    res.json({ analysis: text });
  }),
);

/** Gom dữ liệu cho huấn luyện viên FOCUSLY Brain */
async function coachInput(
  userId: string,
  insights: Awaited<ReturnType<typeof computeInsights>>['insights'],
  analytics: Awaited<ReturnType<typeof computeInsights>>['analytics'],
  tasks: { _id: unknown; title: string; subject?: unknown; subjectName?: string | null; deadline?: Date | null; estimatedMinutes?: number; priority?: string }[],
): Promise<brain.CoachInput> {
  const user = await UserModel.findById(userId).select('profile').lean();
  const tz = safeTimeZone(user?.profile?.timezone);
  const [forecast, dueCards] = await Promise.all([
    brain.forecastFor(userId),
    CardModel.countDocuments({ user: userId, deletedAt: null, suspended: { $ne: true }, 'srs.due': { $lte: new Date() } }),
  ]);
  return {
    today: dayKey(new Date(), tz),
    dailyTargetMinutes: analytics.dailyTargetMinutes,
    metrics: analytics.metrics,
    previous: analytics.previous,
    bySubject: analytics.bySubject,
    insights,
    forecast,
    dueCards,
    tasks: tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      subjectId: t.subject ? String(t.subject) : null,
      subject: t.subjectName ?? null,
      deadline: t.deadline ?? null,
      estimatedMinutes: t.estimatedMinutes ?? 30,
      priority: t.priority ?? 'medium',
    })),
  };
}

/* ---------------- Model dự báo tập trung (FOCUSLY Brain) ----------------
 * GET /ai/forecast?minutes=45&strict=1
 * Khả năng giữ tập trung theo từng giờ, khung giờ tốt nhất, độ dài phiên gợi ý – học từ lịch sử phiên của chính người dùng.
 */
router.get(
  '/forecast',
  ah(async (req, res) => {
    const q = parse(z.object({ minutes: z.coerce.number().int().min(5).max(240).optional(), strict: z.enum(['0', '1']).optional(), fresh: z.enum(['0', '1']).optional() }), req.query);
    res.json(await brain.forecastFor(uid(req), { minutes: q.minutes, strict: q.strict === '1', fresh: q.fresh === '1' }));
  }),
);

export default router;
