import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, forbidden, notFound, parse } from '../utils/http';
import { AssignmentModel, ClassModel } from '../models/Social';
import { CardModel, DeckModel, QuizAttemptModel, QuizModel } from '../models/Learn';
import { UserModel } from '../models/User';
import { notify } from '../services/notifications';
import { copyDeck, copyQuiz } from '../services/social/copy';
import { publicUser, weekKeys, weekMinutes } from '../services/social/friends';
import { shortCode } from '../services/social/logic';
import { safeTimeZone } from '../utils/time';

/**
 * Lớp học: giáo viên tạo lớp, học sinh vào bằng mã; giáo viên giao bộ thẻ / bài kiểm tra và xem tiến độ cả lớp.
 * Khi học sinh bấm "Làm bài", bộ thẻ/câu hỏi được sao chép vào tài khoản của em (sourceRef = assign:<id>).
 */
const router = Router();
router.use(requireAuth);

async function loadClass(id: string, userId: string) {
  const c = await ClassModel.findOne({ _id: id, deletedAt: null });
  if (!c) throw notFound('Lớp không tồn tại');
  const isTeacher = String(c.owner) === userId;
  if (!isTeacher && !c.members.some((m) => String(m.user) === userId)) throw forbidden('Bạn không ở trong lớp này');
  return { c, isTeacher };
}

/** Tiến độ một học sinh với một bài: quiz = điểm cao nhất; deck = % thẻ đã học */
async function progressOf(userId: string, a: InstanceType<typeof AssignmentModel>) {
  const ref = `assign:${a.id}`;
  if (a.kind === 'quiz') {
    const copy = await QuizModel.findOne({ user: userId, sourceRef: ref, deletedAt: null }).select('_id').lean();
    if (!copy) return { started: false, percent: 0, done: false, detail: '' };
    const attempts = await QuizAttemptModel.find({ user: userId, quiz: copy._id, deletedAt: null }).select('accuracy completedAt').lean();
    const best = Math.max(0, ...attempts.map((t) => t.accuracy ?? 0));
    return { started: true, percent: Math.round(best * 100), done: attempts.length > 0, detail: attempts.length ? `${attempts.length} lần · cao nhất ${Math.round(best * 100)}%` : 'Chưa làm', copyId: String(copy._id) };
  }
  const copy = await DeckModel.findOne({ user: userId, sourceRef: ref, deletedAt: null }).select('_id').lean();
  if (!copy) return { started: false, percent: 0, done: false, detail: '' };
  const [total, learned] = await Promise.all([
    CardModel.countDocuments({ deck: copy._id, deletedAt: null }),
    CardModel.countDocuments({ deck: copy._id, deletedAt: null, 'srs.repetitions': { $gt: 0 } }),
  ]);
  const percent = total ? Math.round((learned / total) * 100) : 0;
  return { started: true, percent, done: percent >= 100, detail: `${learned}/${total} thẻ đã học`, copyId: String(copy._id) };
}

router.get(
  '/',
  ah(async (req, res) => {
    const me = uid(req);
    const classes = await ClassModel.find({ deletedAt: null, $or: [{ owner: me }, { 'members.user': me }] }).sort({ updatedAt: -1 }).lean();
    res.json({
      items: await Promise.all(
        classes.map(async (c) => ({
          id: String(c._id),
          name: c.name,
          description: c.description,
          code: String(c.owner) === me ? c.code : undefined,
          isTeacher: String(c.owner) === me,
          members: c.members.length,
          assignments: await AssignmentModel.countDocuments({ class: c._id, deletedAt: null }),
        })),
      ),
    });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const me = uid(req);
    const data = parse(z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).default('') }), req.body);
    for (let i = 0; i < 6; i++) {
      try {
        const c = await ClassModel.create({ ...data, owner: me, code: shortCode(6) });
        return res.status(201).json({ item: { id: c.id, name: c.name, code: c.code } });
      } catch {
        /* trùng mã */
      }
    }
    throw badRequest('Không tạo được lớp, thử lại');
  }),
);

router.post(
  '/join',
  ah(async (req, res) => {
    const me = uid(req);
    const { code } = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
    const c = await ClassModel.findOne({ code: code.toUpperCase(), deletedAt: null });
    if (!c) throw notFound('Mã lớp không đúng');
    if (String(c.owner) === me) return res.json({ id: c.id });
    if (!c.members.some((m) => String(m.user) === me)) {
      if (c.members.length >= 200) throw badRequest('Lớp đã đủ 200 học sinh');
      c.members.push({ user: me as never, joinedAt: new Date() });
      await c.save();
      const u = await UserModel.findById(me).select('name').lean();
      await notify(String(c.owner), { type: 'class', title: `${u?.name ?? 'Một học sinh'} đã vào lớp “${c.name}”`, data: { link: `/classes/${c.id}` } });
    }
    res.json({ id: c.id });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const me = uid(req);
    const { c, isTeacher } = await loadClass(req.params.id, me);
    const assignments = await AssignmentModel.find({ class: c._id, deletedAt: null }).sort({ createdAt: -1 });
    const teacher = await UserModel.findById(c.owner).select('name avatarUrl').lean();
    const base = { id: c.id, name: c.name, description: c.description, isTeacher, teacher: teacher ? publicUser(teacher) : null, code: isTeacher ? c.code : undefined };
    if (!isTeacher) {
      return res.json({
        item: {
          ...base,
          members: c.members.length,
          assignments: await Promise.all(assignments.map(async (a) => ({ ...a.toJSON(), progress: await progressOf(me, a) }))),
        },
      });
    }
    // Giáo viên: bảng tiến độ học sinh × bài
    const users = await UserModel.find({ _id: { $in: c.members.map((m) => m.user) } }).select('name avatarUrl profile.timezone').lean();
    const now = new Date();
    const students = await Promise.all(
      users.map(async (u) => {
        const tz = safeTimeZone(u.profile?.timezone);
        const progress = await Promise.all(assignments.map((a) => progressOf(String(u._id), a)));
        return { ...publicUser(u), weekMinutes: await weekMinutes(String(u._id), weekKeys(tz, now), tz, now), progress };
      }),
    );
    res.json({ item: { ...base, assignments: assignments.map((a) => a.toJSON()), students } });
  }),
);

router.put(
  '/:id',
  ah(async (req, res) => {
    const { c, isTeacher } = await loadClass(req.params.id, uid(req));
    if (!isTeacher) throw forbidden();
    c.set(parse(z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500) }).partial(), req.body));
    await c.save();
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id',
  ah(async (req, res) => {
    const me = uid(req);
    const { c, isTeacher } = await loadClass(req.params.id, me);
    if (isTeacher) c.deletedAt = new Date();
    else c.members = c.members.filter((m) => String(m.user) !== me) as never; // học sinh rời lớp
    await c.save();
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id/members/:userId',
  ah(async (req, res) => {
    const { c, isTeacher } = await loadClass(req.params.id, uid(req));
    if (!isTeacher) throw forbidden();
    c.members = c.members.filter((m) => String(m.user) !== req.params.userId) as never;
    await c.save();
    res.json({ ok: true });
  }),
);

/** Giáo viên giao bài: một bộ thẻ hoặc bộ câu hỏi của chính giáo viên */
router.post(
  '/:id/assignments',
  ah(async (req, res) => {
    const me = uid(req);
    const { c, isTeacher } = await loadClass(req.params.id, me);
    if (!isTeacher) throw forbidden('Chỉ giáo viên mới giao bài được');
    const data = parse(z.object({ kind: z.enum(['deck', 'quiz']), source: z.string(), note: z.string().max(500).default(''), dueAt: z.string().datetime().nullable().optional() }), req.body);
    const src = data.kind === 'deck' ? await DeckModel.findOne({ _id: data.source, user: me, deletedAt: null }).select('title') : await QuizModel.findOne({ _id: data.source, user: me, deletedAt: null }).select('title');
    if (!src) throw notFound('Không tìm thấy bộ này trong tài khoản của bạn');
    const a = await AssignmentModel.create({ class: c._id, kind: data.kind, source: data.source, title: src.title, note: data.note, dueAt: data.dueAt ? new Date(data.dueAt) : null });
    for (const m of c.members) {
      await notify(String(m.user), {
        type: 'class',
        title: `Bài mới trong lớp “${c.name}”: ${src.title}`,
        body: data.dueAt ? `Hạn: ${new Date(data.dueAt).toLocaleDateString('vi-VN')}` : 'Mở lớp để bắt đầu.',
        data: { link: `/classes/${c.id}` },
        dedupeKey: `assign:${a.id}:${m.user}`,
      }).catch(() => undefined);
    }
    res.status(201).json({ item: a.toJSON() });
  }),
);

router.delete(
  '/:id/assignments/:aid',
  ah(async (req, res) => {
    const { c, isTeacher } = await loadClass(req.params.id, uid(req));
    if (!isTeacher) throw forbidden();
    await AssignmentModel.updateOne({ _id: req.params.aid, class: c._id }, { deletedAt: new Date() });
    res.json({ ok: true });
  }),
);

/** Học sinh bắt đầu bài: sao chép bộ thẻ/câu hỏi về tài khoản (chỉ 1 lần) */
router.post(
  '/:id/assignments/:aid/start',
  ah(async (req, res) => {
    const me = uid(req);
    const { c } = await loadClass(req.params.id, me);
    const a = await AssignmentModel.findOne({ _id: req.params.aid, class: c._id, deletedAt: null });
    if (!a) throw notFound('Bài không còn');
    const ref = `assign:${a.id}`;
    const Model = (a.kind === 'deck' ? DeckModel : QuizModel) as typeof DeckModel;
    const existing = await Model.findOne({ user: me, sourceRef: ref, deletedAt: null }).select('_id');
    if (existing) return res.json({ kind: a.kind, id: String(existing._id) });
    const copy = a.kind === 'deck' ? await copyDeck(String(a.source), me, ref) : await copyQuiz(String(a.source), me, ref);
    if (!copy) throw notFound('Giáo viên đã xoá bộ này');
    res.status(201).json({ kind: a.kind, id: copy.id });
  }),
);

export default router;
