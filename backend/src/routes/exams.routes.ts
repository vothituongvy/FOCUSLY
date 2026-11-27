import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, notFound, parse } from '../utils/http';
import { ExamModel } from '../models/Social';
import { MaterialModel } from '../models/Learn';
import { SubjectModel, TaskModel } from '../models/Learning';
import { FocusSessionModel } from '../models/FocusSession';
import { UserModel } from '../models/User';
import { completeJson, llmDown } from '../services/ai';
import * as brain from '../services/brain';
import { keyphrases } from '../services/brain/text';
import { buildExamPlan, daysBetween } from '../services/social/logic';
import { notifyChange } from '../services/realtime';
import { dayKey, safeTimeZone, zonedDate } from '../utils/time';

/**
 * Kế hoạch đếm ngược tới ngày thi: chia chủ đề ngược về từng ngày,
 * tự điều chỉnh theo số phút đã học thật của môn và các thẻ sắp quên.
 */
const router = Router();
router.use(requireAuth);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const topicIn = z.object({ _id: z.string().optional(), id: z.string().optional(), title: z.string().trim().min(1).max(200), minutes: z.number().int().min(10).max(600).default(45), done: z.boolean().default(false) });
const examIn = z.object({
  title: z.string().trim().min(1).max(150),
  subject: z.string().nullable().optional(),
  deck: z.string().nullable().optional(),
  date: ymd,
  dailyCapMinutes: z.number().int().min(15).max(600).default(90),
  topics: z.array(topicIn).max(80).default([]),
});

async function tzOf(userId: string) {
  const u = await UserModel.findById(userId).select('profile.timezone profile.preferredStudyTimes').lean();
  return { tz: safeTimeZone(u?.profile?.timezone), studyAt: u?.profile?.preferredStudyTimes?.[0]?.start ?? '19:00' };
}

async function planFor(exam: InstanceType<typeof ExamModel>, userId: string) {
  const { tz } = await tzOf(userId);
  const now = new Date();
  const today = dayKey(now, tz);
  // phút đã học thật cho môn này kể từ khi lập kế hoạch
  let credit = 0;
  let todayMinutes = 0;
  if (exam.subject) {
    const ss = await FocusSessionModel.find({ user: userId, subject: exam.subject, deletedAt: null, startedAt: { $gte: (exam as { createdAt?: Date }).createdAt ?? now } })
      .select('actualFocusSeconds startedAt')
      .lean();
    credit = Math.round(ss.reduce((a, s) => a + (s.actualFocusSeconds ?? 0), 0) / 60);
    todayMinutes = Math.round(ss.filter((s) => dayKey(s.startedAt, tz) === today).reduce((a, s) => a + (s.actualFocusSeconds ?? 0), 0) / 60);
  }
  let forgetting = 0;
  if (exam.deck) {
    const mem = await brain.memoryForecast(userId, 2000).catch(() => null);
    forgetting = mem?.atRisk.filter((c) => c.deck === String(exam.deck) && c.recallTomorrow < 0.7).length ?? 0;
  }
  const plan = buildExamPlan({
    today,
    examDate: exam.date,
    dailyCap: exam.dailyCapMinutes,
    topics: exam.topics.map((t) => ({ id: String(t._id), title: t.title ?? '', minutes: t.minutes ?? 45, done: !!t.done })),
    forgettingCards: forgetting,
    creditMinutes: credit,
  });
  const todayPlan = plan.days[0]?.date === today ? plan.days[0].minutes : 0;
  return { ...plan, today, studiedMinutes: credit, todayMinutes, todayLeft: Math.max(0, todayPlan - todayMinutes), forgettingCards: forgetting };
}

const view = async (e: InstanceType<typeof ExamModel>, userId: string) => {
  const subject = e.subject ? await SubjectModel.findById(e.subject).select('name color').lean() : null;
  return { ...e.toJSON(), subjectName: subject?.name ?? null, plan: await planFor(e, userId) };
};

router.get(
  '/',
  ah(async (req, res) => {
    const userId = uid(req);
    const exams = await ExamModel.find({ user: userId, deletedAt: null }).sort({ date: 1 });
    const { tz } = await tzOf(userId);
    const today = dayKey(new Date(), tz);
    res.json({
      items: await Promise.all(
        exams.map(async (e) => {
          const p = await planFor(e, userId);
          return { ...e.toJSON(), daysLeft: daysBetween(today, e.date), progress: p.progress, overloaded: p.overloaded, todayLeft: p.todayLeft, perDay: p.perDay };
        }),
      ),
    });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const userId = uid(req);
    const data = parse(examIn, req.body);
    const e = await ExamModel.create({ ...data, user: userId, topics: data.topics.map(({ title, minutes, done }) => ({ title, minutes, done })) });
    res.status(201).json({ item: await view(e, userId) });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const userId = uid(req);
    const e = await ExamModel.findOne({ _id: req.params.id, user: userId, deletedAt: null });
    if (!e) throw notFound();
    res.json({ item: await view(e, userId) });
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const userId = uid(req);
    const data = parse(examIn.partial(), req.body);
    const e = await ExamModel.findOne({ _id: req.params.id, user: userId, deletedAt: null });
    if (!e) throw notFound();
    const { topics, ...rest } = data;
    e.set(rest);
    if (topics) e.set('topics', topics.map((t) => ({ ...(t._id || t.id ? { _id: t._id ?? t.id } : {}), title: t.title, minutes: t.minutes, done: t.done })));
    await e.save();
    res.json({ item: await view(e, userId) });
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    await ExamModel.updateOne({ _id: req.params.id, user: uid(req) }, { deletedAt: new Date() });
    res.json({ ok: true });
  }),
);

/** Gợi ý danh sách chủ đề ôn thi (LLM nếu có, không thì FOCUSLY Brain lấy ý chính từ tài liệu/Wikipedia) */
router.post(
  '/suggest-topics',
  ah(async (req, res) => {
    const userId = uid(req);
    const data = parse(z.object({ title: z.string().trim().min(1).max(150), materialId: z.string().optional(), subject: z.string().optional(), count: z.number().int().min(3).max(20).default(8) }), req.body);
    let text = '';
    if (data.materialId) {
      const m = await MaterialModel.findOne({ _id: data.materialId, user: userId }).select('+textContent title').lean();
      text = (m as { textContent?: string } | null)?.textContent ?? '';
    }
    const subjectName = data.subject ? (await SubjectModel.findById(data.subject).select('name').lean())?.name : '';
    if (!brain.useBrain()) {
      try {
        const out = await completeJson({
          userId,
          feature: 'exam-topics',
          system: 'Bạn là gia sư lập kế hoạch ôn thi cho học sinh/sinh viên Việt Nam.',
          messages: [
            {
              role: 'user',
              content: `Kỳ thi: "${data.title}"${subjectName ? ` – môn ${subjectName}` : ''}. Liệt kê ${data.count} chủ đề cần ôn theo thứ tự nên học (cơ bản trước), mỗi chủ đề kèm số phút ôn ước tính (20–120).
Trả về JSON {"topics":[{"title":"...","minutes":45}]}.${text ? `\n\nNỘI DUNG TÀI LIỆU:\n${text.slice(0, 10000)}` : ''}`,
            },
          ],
          schema: z.object({ topics: z.array(z.object({ title: z.string().min(1).max(200), minutes: z.coerce.number().int().min(10).max(600) })).min(1) }),
          maxTokens: 900,
        });
        return res.json({ topics: out.topics.slice(0, data.count), source: 'llm' });
      } catch (e) {
        if (!llmDown(e)) throw e;
      }
    }
    if (!text) text = (await brain.topicText(userId, subjectName || data.title).catch(() => ({ text: '' }))).text;
    const phrases = text ? keyphrases(text, data.count * 2).map((p) => p.text) : [];
    const uniq = [...new Set(phrases.map((p) => p.charAt(0).toUpperCase() + p.slice(1)))].slice(0, data.count);
    if (!uniq.length) throw badRequest('Chưa gợi ý được chủ đề – hãy chọn một tài liệu hoặc tự nhập danh sách chủ đề.');
    res.json({ topics: uniq.map((t) => ({ title: t, minutes: 45 })), source: 'brain' });
  }),
);

/** Đưa kế hoạch 7 ngày tới vào Lịch học (tạo nhiệm vụ có nhắc giờ; chạy lại sẽ cập nhật, không tạo trùng) */
router.post(
  '/:id/schedule',
  ah(async (req, res) => {
    const userId = uid(req);
    const e = await ExamModel.findOne({ _id: req.params.id, user: userId, deletedAt: null });
    if (!e) throw notFound();
    const { tz, studyAt } = await tzOf(userId);
    const { at } = parse(z.object({ at: z.string().regex(/^\d{2}:\d{2}$/).optional() }), req.body ?? {});
    const plan = await planFor(e, userId);
    let created = 0;
    for (const d of plan.days.slice(0, 7)) {
      const clientId = `exam:${e.id}:${d.date}`;
      const body = {
        title: `Ôn thi ${e.title}: ${d.items.map((i) => i.title).slice(0, 2).join(', ')}`.slice(0, 200),
        description: d.items.map((i) => `• ${i.title} (${i.minutes} phút)`).join('\n'),
        estimatedMinutes: d.minutes,
        subject: e.subject,
        scheduledDate: zonedDate(d.date, '00:00', tz),
        remindAt: zonedDate(d.date, at ?? studyAt, tz),
        priority: daysBetween(plan.today, e.date) <= 3 ? 'high' : 'medium',
      };
      const existing = await TaskModel.findOne({ user: userId, clientId });
      if (existing) {
        if (existing.status === 'done') continue;
        existing.set(body);
        await existing.save();
        notifyChange(userId, 'tasks', 'update', existing.toJSON());
      } else {
        const t = await TaskModel.create({ ...body, user: userId, clientId });
        notifyChange(userId, 'tasks', 'create', t.toJSON());
        created++;
      }
    }
    res.json({ ok: true, created, days: Math.min(7, plan.days.length) });
  }),
);

export default router;
