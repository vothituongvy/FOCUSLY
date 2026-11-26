import { Router } from 'express';
import { requireAuth, uid } from '../middleware/auth';
import { ah, notFound } from '../utils/http';
import { FocusSessionModel } from '../models/FocusSession';
import { findOwned } from '../services/entities';
import {
  endSession,
  getActiveSession,
  heartbeat,
  pauseSession,
  recordAppLeave,
  resumeSession,
  startBreak,
  startSession,
  updateSummary,
  viewSession,
} from '../services/sessions';

const router = Router();
router.use(requireAuth);

const at = (body: unknown) => {
  const v = (body as { at?: string } | undefined)?.at;
  return v ? new Date(v) : undefined;
};

/* GET /sessions/active — phiên đang mở (khôi phục khi mở lại app / đổi thiết bị) */
router.get(
  '/active',
  ah(async (req, res) => {
    const s = await getActiveSession(uid(req));
    res.json({ session: s ? viewSession(s) : null, serverTime: new Date().toISOString() });
  }),
);

/* GET /sessions — lịch sử phiên học */
router.get(
  '/',
  ah(async (req, res) => {
    const filter: Record<string, unknown> = { user: uid(req), deletedAt: null };
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.subject) filter.subject = String(req.query.subject);
    if (req.query.task) filter.task = String(req.query.task);
    if (req.query.from || req.query.to) {
      const r: Record<string, Date> = {};
      if (req.query.from) r.$gte = new Date(String(req.query.from));
      if (req.query.to) r.$lt = new Date(String(req.query.to));
      filter.startedAt = r;
    }
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const [items, total] = await Promise.all([
      FocusSessionModel.find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('subject', 'name color icon')
        .populate('task', 'title'),
      FocusSessionModel.countDocuments(filter),
    ]);
    res.json({ items, total });
  }),
);

/* GET /sessions/:id */
router.get(
  '/:id',
  ah(async (req, res) => {
    const s = await findOwned(FocusSessionModel, uid(req), req.params.id);
    if (!s) throw notFound('Phiên học không tồn tại');
    res.json({ session: viewSession(s) });
  }),
);

/* POST /sessions — bắt đầu phiên */
router.post(
  '/',
  ah(async (req, res) => {
    const { clientId, ...body } = req.body ?? {};
    const session = await startSession(uid(req), body, typeof clientId === 'string' ? clientId : undefined);
    res.status(201).json({ session });
  }),
);

router.post('/:id/pause', ah(async (req, res) => res.json({ session: await pauseSession(uid(req), req.params.id, at(req.body)) })));
router.post('/:id/resume', ah(async (req, res) => res.json({ session: await resumeSession(uid(req), req.params.id, at(req.body)) })));
router.post('/:id/break', ah(async (req, res) => res.json({ session: await startBreak(uid(req), req.params.id, at(req.body)) })));
router.post('/:id/end', ah(async (req, res) => res.json({ session: await endSession(uid(req), req.params.id, req.body) })));
router.post('/:id/heartbeat', ah(async (req, res) => res.json({ session: await heartbeat(uid(req), req.params.id, at(req.body)) })));
router.post('/:id/app-leave', ah(async (req, res) => res.json({ session: await recordAppLeave(uid(req), req.params.id, req.body) })));
router.patch('/:id/summary', ah(async (req, res) => res.json({ session: await updateSummary(uid(req), req.params.id, req.body) })));

export default router;
