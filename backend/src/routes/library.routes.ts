import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, forbidden, notFound, parse } from '../utils/http';
import { CardModel, DeckModel, MaterialModel, QuizModel } from '../models/Learn';
import { UserModel } from '../models/User';
import { copyDeck, copyMaterial, copyQuiz } from '../services/social/copy';

/**
 * Thư viện cộng đồng: chia sẻ công khai bộ thẻ / bộ câu hỏi, người khác sao chép về bằng một chạm.
 */
const router = Router();
router.use(requireAuth);

const kindSchema = z.enum(['deck', 'quiz', 'material']);
type Kind = z.infer<typeof kindSchema>;
const modelOf = (k: Kind) => (k === 'deck' ? DeckModel : k === 'quiz' ? QuizModel : MaterialModel) as unknown as typeof DeckModel;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/',
  ah(async (req, res) => {
    const q = parse(z.object({ kind: kindSchema.default('deck'), q: z.string().trim().max(100).optional(), sort: z.enum(['popular', 'new']).default('popular'), page: z.coerce.number().int().min(1).max(100).default(1) }), req.query);
    const filter: Record<string, unknown> = { isPublic: true, deletedAt: null };
    if (q.q) filter.$or = [{ title: new RegExp(esc(q.q), 'i') }, { description: new RegExp(esc(q.q), 'i') }, { authorName: new RegExp(esc(q.q), 'i') }];
    const items = await modelOf(q.kind)
      .find(filter)
      .sort(q.sort === 'popular' ? { copies: -1, publishedAt: -1 } : { publishedAt: -1 })
      .skip((q.page - 1) * 30)
      .limit(30)
      .select('title description authorName copies itemCount publishedAt color user type category sizeBytes')
      .lean();
    const me = uid(req);
    res.json({
      items: items.map((i) => {
        const x = i as unknown as { color?: string; type?: string; category?: string; sizeBytes?: number };
        return { id: String(i._id), title: i.title, description: i.description, authorName: i.authorName, copies: i.copies, itemCount: i.itemCount, publishedAt: i.publishedAt, color: x.color, materialType: x.type, category: x.category, sizeBytes: x.sizeBytes, mine: String(i.user) === me };
      }),
    });
  }),
);

/** Bộ của tôi đang chia sẻ */
router.get(
  '/mine',
  ah(async (req, res) => {
    const me = uid(req);
    const [decks, quizzes, materials] = await Promise.all([
      DeckModel.find({ user: me, isPublic: true, deletedAt: null }).select('title copies itemCount publishedAt').lean(),
      QuizModel.find({ user: me, isPublic: true, deletedAt: null }).select('title copies itemCount publishedAt').lean(),
      MaterialModel.find({ user: me, isPublic: true, deletedAt: null }).select('title copies itemCount publishedAt').lean(),
    ]);
    const map = (k: string) => (i: { _id: unknown; title: string; copies?: number; itemCount?: number; publishedAt?: Date | null }) => ({ kind: k, id: String(i._id), title: i.title, copies: i.copies ?? 0, itemCount: i.itemCount ?? 0, publishedAt: i.publishedAt });
    res.json({ items: [...decks.map(map('deck')), ...quizzes.map(map('quiz')), ...materials.map(map('material'))] });
  }),
);

router.get(
  '/:kind/:id',
  ah(async (req, res) => {
    const kind = parse(kindSchema, req.params.kind);
    const me = uid(req);
    const doc = await modelOf(kind).findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!doc || (!doc.isPublic && String(doc.user) !== me)) throw notFound('Bộ này không còn được chia sẻ');
    const base = { id: String(doc._id), kind, title: doc.title, description: doc.description, authorName: doc.authorName, copies: doc.copies, itemCount: doc.itemCount, isPublic: doc.isPublic, mine: String(doc.user) === me };
    if (kind === 'deck') {
      const cards = await CardModel.find({ deck: doc._id, deletedAt: null }).select('front back').limit(30).lean();
      return res.json({ item: { ...base, preview: cards.map((c) => ({ front: c.front, back: c.back })) } });
    }
    if (kind === 'material') {
      const m = doc as unknown as { type: string; category?: string; sizeBytes?: number; aiSummary?: string; originalName?: string };
      const full = await MaterialModel.findById(doc._id).select('+textContent').lean();
      const text = ((full as { textContent?: string } | null)?.textContent ?? '').trim();
      const excerpt = (m.aiSummary || text).slice(0, 900);
      return res.json({ item: { ...base, materialType: m.type, category: m.category, sizeBytes: m.sizeBytes, originalName: m.originalName, excerpt, preview: [] } });
    }
    const qs = ((doc as unknown as { questions?: { prompt: string; type: string }[] }).questions ?? []).slice(0, 8);
    res.json({ item: { ...base, preview: qs.map((q) => ({ front: q.prompt, back: q.type })) } });
  }),
);

router.post(
  '/:kind/:id/copy',
  ah(async (req, res) => {
    const kind = parse(kindSchema, req.params.kind);
    const me = uid(req);
    const src = await modelOf(kind).findOne({ _id: req.params.id, deletedAt: null, isPublic: true }).select('_id');
    if (!src) throw notFound('Bộ này không còn được chia sẻ');
    const ref = `lib:${req.params.id}`;
    const copy = kind === 'deck' ? await copyDeck(req.params.id, me, ref) : kind === 'quiz' ? await copyQuiz(req.params.id, me, ref) : await copyMaterial(req.params.id, me, ref);
    await modelOf(kind).updateOne({ _id: req.params.id }, { $inc: { copies: 1 } });
    res.status(201).json({ id: copy!.id, kind });
  }),
);

/** Bật / tắt chia sẻ công khai bộ của mình */
router.post(
  '/:kind/:id/publish',
  ah(async (req, res) => {
    const kind = parse(kindSchema, req.params.kind);
    const me = uid(req);
    const { isPublic, description, confirmRights } = parse(z.object({ isPublic: z.boolean(), description: z.string().max(1000).optional(), confirmRights: z.boolean().optional() }), req.body);
    const doc = await modelOf(kind).findOne({ _id: req.params.id, deletedAt: null });
    if (!doc) throw notFound();
    if (String(doc.user) !== me) throw forbidden('Chỉ chủ sở hữu mới chia sẻ được');
    const author = await UserModel.findById(me).select('name').lean();
    let itemCount = 0;
    if (kind === 'material') {
      // tài liệu: chỉ người có quyền chia sẻ (tự soạn / được phép) mới bật công khai
      if (isPublic && !confirmRights) throw forbidden('Hãy xác nhận bạn có quyền chia sẻ tài liệu này (tự soạn hoặc được tác giả cho phép).');
      if (isPublic && (doc as unknown as { sourceRef?: string }).sourceRef?.startsWith('lib:')) throw forbidden('Tài liệu sao chép từ Thư viện không chia sẻ lại được');
      itemCount = (doc as unknown as { progress?: { totalPages?: number } }).progress?.totalPages ?? 0;
    } else {
      itemCount = kind === 'deck' ? await CardModel.countDocuments({ deck: doc._id, deletedAt: null }) : ((doc as unknown as { questions?: unknown[] }).questions?.length ?? 0);
      if (isPublic && itemCount < 3) throw forbidden('Cần ít nhất 3 thẻ/câu hỏi mới chia sẻ được');
    }
    doc.set({ isPublic, itemCount, authorName: author?.name ?? '', ...(description !== undefined ? { description } : {}), ...(isPublic && !doc.publishedAt ? { publishedAt: new Date() } : {}) });
    await doc.save();
    res.json({ ok: true, isPublic, itemCount });
  }),
);

export default router;
