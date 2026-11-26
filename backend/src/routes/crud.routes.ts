import { Router, Request } from 'express';
import { Types } from 'mongoose';
import { requireAuth, uid } from '../middleware/auth';
import { ah, notFound } from '../utils/http';
import { createEntity, deleteEntity, ENTITIES, EntityName, findOwned, updateEntity } from '../services/entities';

/* eslint-disable @typescript-eslint/no-explicit-any */

const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
const oid = (v: unknown) => {
  const s = str(v);
  return s && Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : undefined;
};
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bộ lọc danh sách cho từng loại dữ liệu */
const FILTERS: Record<EntityName, (req: Request) => { filter: Record<string, any>; sort: Record<string, 1 | -1> }> = {
  subjects: (req) => ({
    filter: req.query.archived === 'true' ? {} : { archived: { $ne: true } },
    sort: { createdAt: 1 },
  }),
  courses: (req) => ({
    filter: oid(req.query.subject) ? { subject: oid(req.query.subject) } : {},
    sort: { order: 1, createdAt: 1 },
  }),
  goals: (req) => ({
    filter: {
      ...(oid(req.query.subject) ? { subject: oid(req.query.subject) } : {}),
      ...(str(req.query.status) ? { status: str(req.query.status) } : {}),
    },
    sort: { createdAt: -1 },
  }),
  tasks: (req) => {
    const f: Record<string, any> = {};
    if (oid(req.query.subject)) f.subject = oid(req.query.subject);
    if (oid(req.query.course)) f.course = oid(req.query.course);
    if (oid(req.query.goal)) f.goal = oid(req.query.goal);
    if (str(req.query.status)) f.status = { $in: String(req.query.status).split(',') };
    if (str(req.query.priority)) f.priority = { $in: String(req.query.priority).split(',') };
    if (str(req.query.search)) f.title = { $regex: escapeRegex(String(req.query.search)), $options: 'i' };
    // Calendar / Study plan: lấy task có scheduledDate hoặc deadline trong khoảng [from, to)
    const from = str(req.query.from) ? new Date(String(req.query.from)) : undefined;
    const to = str(req.query.to) ? new Date(String(req.query.to)) : undefined;
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from && !isNaN(+from)) range.$gte = from;
      if (to && !isNaN(+to)) range.$lt = to;
      f.$or = [{ scheduledDate: range }, { deadline: range }];
    }
    const sortKey = str(req.query.sort) ?? 'deadline';
    const sort: Record<string, 1 | -1> =
      sortKey === 'priority' ? { priority: -1, deadline: 1 } : sortKey === 'created' ? { createdAt: -1 } : { deadline: 1, createdAt: -1 };
    return { filter: f, sort };
  },
  distractions: (req) => {
    const f: Record<string, any> = {};
    if (oid(req.query.session)) f.session = oid(req.query.session);
    if (oid(req.query.subject)) f.subject = oid(req.query.subject);
    if (str(req.query.reason)) f.reason = { $in: String(req.query.reason).split(',') };
    const from = str(req.query.from) ? new Date(String(req.query.from)) : undefined;
    const to = str(req.query.to) ? new Date(String(req.query.to)) : undefined;
    if (from || to) {
      f.occurredAt = {};
      if (from) f.occurredAt.$gte = from;
      if (to) f.occurredAt.$lt = to;
    }
    return { filter: f, sort: { occurredAt: -1 } };
  },
  /* ---------- Phase 2 ---------- */
  materials: (req) => {
    const f: Record<string, any> = {};
    if (oid(req.query.subject)) f.subject = oid(req.query.subject);
    if (str(req.query.category)) f.category = str(req.query.category);
    if (str(req.query.type)) f.type = str(req.query.type);
    if (req.query.bookmarked === 'true') f.bookmarked = true;
    if (str(req.query.search)) {
      const rx = { $regex: escapeRegex(String(req.query.search)), $options: 'i' };
      f.$or = [{ title: rx }, { description: rx }, { tags: rx }, { category: rx }];
    }
    const sort: Record<string, 1 | -1> = req.query.sort === 'recent' ? { lastOpenedAt: -1, updatedAt: -1 } : { createdAt: -1 };
    return { filter: f, sort };
  },
  materialNotes: (req) => ({
    filter: {
      ...(oid(req.query.material) ? { material: oid(req.query.material) } : {}),
      ...(str(req.query.kind) ? { kind: str(req.query.kind) } : {}),
    },
    sort: { page: 1, createdAt: 1 },
  }),
  decks: (req) => ({ filter: oid(req.query.subject) ? { subject: oid(req.query.subject) } : {}, sort: { createdAt: -1 } }),
  cards: (req) => ({
    filter: {
      ...(oid(req.query.deck) ? { deck: oid(req.query.deck) } : {}),
      ...(req.query.due === 'true' ? { 'srs.due': { $lte: new Date() }, suspended: { $ne: true } } : {}),
    },
    sort: { createdAt: 1 },
  }),
  quizzes: (req) => ({
    filter: {
      ...(oid(req.query.subject) ? { subject: oid(req.query.subject) } : {}),
      ...(oid(req.query.material) ? { material: oid(req.query.material) } : {}),
    },
    sort: { createdAt: -1 },
  }),
  recalls: (req) => ({ filter: oid(req.query.session) ? { session: oid(req.query.session) } : {}, sort: { createdAt: -1 } }),
  recoveries: (req) => ({ filter: oid(req.query.session) ? { session: oid(req.query.session) } : {}, sort: { startedAt: -1 } }),
};

/** Router CRUD chuẩn: GET list, GET :id, POST, PATCH :id, DELETE :id (xoá mềm) */
export function crudRouter(entity: EntityName): Router {
  const router = Router();
  const def = ENTITIES[entity];
  router.use(requireAuth);

  router.get(
    '/',
    ah(async (req, res) => {
      const { filter, sort } = FILTERS[entity](req);
      const limit = Math.min(Number(req.query.limit) || 500, 1000);
      const skip = Math.max(Number(req.query.skip) || 0, 0);
      const query = { ...filter, user: uid(req), deletedAt: null };
      const [items, total] = await Promise.all([
        def.model.find(query).sort(sort).skip(skip).limit(limit),
        def.model.countDocuments(query),
      ]);
      res.json({ items, total });
    }),
  );

  router.get(
    '/:id',
    ah(async (req, res) => {
      const doc = await findOwned(def.model, uid(req), req.params.id);
      if (!doc || doc.deletedAt) throw notFound(`${def.label} không tồn tại`);
      res.json({ item: doc });
    }),
  );

  router.post(
    '/',
    ah(async (req, res) => {
      const { clientId, ...body } = req.body ?? {};
      const doc = await createEntity(entity, uid(req), body, typeof clientId === 'string' ? clientId : undefined);
      res.status(201).json({ item: doc });
    }),
  );

  router.patch(
    '/:id',
    ah(async (req, res) => {
      const { baseUpdatedAt, ...body } = req.body ?? {};
      const result = await updateEntity(entity, uid(req), req.params.id, body, {
        baseUpdatedAt: baseUpdatedAt ? new Date(baseUpdatedAt) : undefined,
        clientUpdatedAt: new Date(),
      });
      if (result.conflict) {
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'Dữ liệu đã được thay đổi trên thiết bị khác' },
          item: result.doc,
        });
      }
      res.json({ item: result.doc });
    }),
  );

  router.delete(
    '/:id',
    ah(async (req, res) => {
      const doc = await deleteEntity(entity, uid(req), req.params.id);
      res.json({ ok: true, id: doc.id });
    }),
  );

  return router;
}
