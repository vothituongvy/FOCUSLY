import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, notFound, parse } from '../utils/http';
import { MaterialModel } from '../models/Learn';
import { findOwned } from '../services/entities';
import { storeMaterialFile } from '../services/storage';
import { extractText, materialTypeFromMime } from '../services/textExtract';
import { notifyChange } from '../services/realtime';
import { SubjectModel } from '../models/Learning';

/**
 * Phase 2 – Learning Materials (các route riêng; CRUD chung ở crudRouter('materials'))
 * Mount TRƯỚC crudRouter để "/upload", "/search"... không bị hiểu là ":id".
 */
const router = Router();
router.use(requireAuth);

const ALLOWED = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype) || /\.(md|txt)$/i.test(file.originalname)) cb(null, true);
    else cb(badRequest('Định dạng chưa hỗ trợ (PDF, ảnh, TXT/MD, DOCX)'));
  },
});

/* POST /materials/upload  (multipart: file, title?, subject?, category?, description?) */
router.post(
  '/upload',
  upload.single('file'),
  ah(async (req, res) => {
    const file = req.file;
    if (!file) throw badRequest('Thiếu file (field "file")');
    const meta = parse(
      z.object({
        title: z.string().trim().max(200).optional(),
        subject: z.string().optional(),
        category: z.string().trim().max(60).optional(),
        description: z.string().max(2000).optional(),
      }),
      req.body,
    );
    // multer đọc tên file theo latin1 – chuyển về UTF-8 để giữ tiếng Việt
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    let subjectId = null;
    if (meta.subject) {
      const s = await findOwned(SubjectModel, uid(req), meta.subject);
      subjectId = s?._id ?? null;
    }
    const [stored, extracted] = await Promise.all([
      storeMaterialFile(file.buffer, file.mimetype, uid(req), originalName),
      extractText(file.buffer, file.mimetype, originalName),
    ]);
    const doc = await MaterialModel.create({
      user: uid(req),
      subject: subjectId,
      title: meta.title || originalName.replace(/\.[^.]+$/, ''),
      description: meta.description ?? '',
      category: meta.category || 'Khác',
      type: materialTypeFromMime(file.mimetype, originalName),
      url: stored.url,
      storageId: stored.publicId,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      originalName,
      textContent: extracted.text,
      hasText: extracted.text.length > 0,
      progress: { page: 0, totalPages: extracted.pages, percent: 0 },
    });
    notifyChange(uid(req), 'materials', 'create', doc.toJSON());
    res.status(201).json({ item: doc, extractedChars: extracted.text.length });
  }),
);

/* GET /materials/search?q= — tìm cả trong nội dung tài liệu (full-text) */
router.get(
  '/search',
  ah(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ items: [] });
    const docs = await MaterialModel.find(
      { user: uid(req), deletedAt: null, $text: { $search: q } },
      { score: { $meta: 'textScore' } },
    )
      .select('+textContent')
      .sort({ score: { $meta: 'textScore' } })
      .limit(30);
    const needle = q.toLowerCase().split(/\s+/)[0];
    const items = docs.map((d) => {
      const text = d.textContent ?? '';
      const i = text.toLowerCase().indexOf(needle);
      const snippet = i >= 0 ? `…${text.slice(Math.max(0, i - 80), i + 160).replace(/\s+/g, ' ')}…` : '';
      const json = d.toJSON() as Record<string, unknown>;
      delete json.textContent;
      return { ...json, snippet };
    });
    res.json({ items });
  }),
);

/* GET /materials/categories */
router.get(
  '/categories',
  ah(async (req, res) => {
    const cats = await MaterialModel.distinct('category', { user: uid(req), deletedAt: null });
    res.json({ items: cats.filter(Boolean).sort() });
  }),
);

/* GET /materials/:id/text?offset=0&limit=20000 — đọc nội dung văn bản */
router.get(
  '/:id/text',
  ah(async (req, res) => {
    const d = await findOwned(MaterialModel, uid(req), req.params.id);
    if (!d || d.deletedAt) throw notFound('Tài liệu không tồn tại');
    const full = await MaterialModel.findById(d._id).select('+textContent');
    const text = full?.textContent ?? '';
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(100_000, Number(req.query.limit) || 20_000);
    res.json({ text: text.slice(offset, offset + limit), offset, total: text.length });
  }),
);

/* POST /materials/:id/open — đánh dấu "đã xem gần đây" */
router.post(
  '/:id/open',
  ah(async (req, res) => {
    const d = await findOwned(MaterialModel, uid(req), req.params.id);
    if (!d || d.deletedAt) throw notFound('Tài liệu không tồn tại');
    d.lastOpenedAt = new Date();
    await d.save();
    res.json({ item: d });
  }),
);

export default router;
