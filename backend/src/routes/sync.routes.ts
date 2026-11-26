import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, HttpError, parse } from '../utils/http';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { SyncMutationModel } from '../models/SyncMutation';
import { createEntity, deleteEntity, ENTITIES, isEntityName, updateEntity } from '../services/entities';
import { runSessionAction, SessionAction } from '../services/sessions';
import { reviewCard, submitAttempt } from '../services/learn';
import { QuizAttemptModel } from '../models/Learn';

const router = Router();
router.use(requireAuth);

const PULL_LIMIT = 2000;

/**
 * GET /sync/pull?since=ISO
 * Trả về mọi bản ghi thay đổi (kể cả đã xoá mềm) kể từ `since`.
 * Client lưu `serverTime` để dùng cho lần pull tiếp theo.
 */
router.get(
  '/pull',
  ah(async (req, res) => {
    const userId = uid(req);
    const serverTime = new Date();
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
    const sinceValid = isNaN(+since) ? new Date(0) : since;
    const filter = { user: userId, updatedAt: { $gt: sinceValid } };

    const entries = await Promise.all(
      Object.entries(ENTITIES).map(async ([name, def]) => {
        const items = await def.model.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT);
        return [name, items] as const;
      }),
    );
    const sessions = await FocusSessionModel.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT);
    const quizAttempts = await QuizAttemptModel.find(filter).sort({ updatedAt: 1 }).limit(PULL_LIMIT);
    const user = await UserModel.findOne({ _id: userId, updatedAt: { $gt: sinceValid } });

    const changes = Object.fromEntries([...entries, ['sessions', sessions], ['quizAttempts', quizAttempts]]);
    const hasMore = Object.values(changes).some((list) => (list as unknown[]).length >= PULL_LIMIT);
    res.json({ serverTime: serverTime.toISOString(), since: sinceValid.toISOString(), changes, user, hasMore });
  }),
);

const mutationSchema = z.object({
  mutationId: z.string().min(1).max(100),
  entity: z.string(),
  op: z.string(), // create | update | delete  (hoặc hành động phiên: start, pause, resume, break, end, heartbeat, summary, app-leave)
  id: z.string().optional(), // id server hoặc clientId
  clientId: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  baseUpdatedAt: z.coerce.date().optional(),
  clientUpdatedAt: z.coerce.date().optional(),
});

const pushSchema = z.object({ mutations: z.array(mutationSchema).max(500) });

type MutationResult = {
  mutationId: string;
  status: 'ok' | 'conflict' | 'error';
  entity: string;
  item?: unknown;
  error?: { code: string; message: string };
};

/**
 * POST /sync/push — áp dụng hàng đợi thay đổi offline theo đúng thứ tự.
 * - Idempotent theo mutationId (gửi lại không bị áp dụng 2 lần)
 * - Xung đột: nếu bản server mới hơn thay đổi của client -> giữ bản server, trả status "conflict"
 */
router.post(
  '/push',
  ah(async (req, res) => {
    const userId = uid(req);
    const { mutations } = parse(pushSchema, req.body);
    const results: MutationResult[] = [];

    for (const m of mutations) {
      const done = await SyncMutationModel.findOne({ user: userId, mutationId: m.mutationId }).lean();
      if (done) {
        results.push(done.result as MutationResult);
        continue;
      }
      let result: MutationResult;
      try {
        if (m.entity === 'sessions') {
          const session = await runSessionAction(userId, m.op as SessionAction, m.id, m.data ?? {}, m.clientId);
          result = { mutationId: m.mutationId, entity: m.entity, status: 'ok', item: session };
        } else if (m.entity === 'cards' && m.op === 'review') {
          // Ôn flashcard offline: mutationId làm khoá chống trùng
          const card = await reviewCard(userId, m.id ?? '', { ...(m.data ?? {}), clientId: m.mutationId });
          result = { mutationId: m.mutationId, entity: m.entity, status: 'ok', item: card.toJSON() };
        } else if (m.entity === 'quizAttempts' && m.op === 'create') {
          const data = (m.data ?? {}) as { quiz?: string };
          const attempt = await submitAttempt(userId, String(data.quiz ?? ''), { ...data, clientId: m.clientId ?? m.mutationId });
          result = { mutationId: m.mutationId, entity: m.entity, status: 'ok', item: attempt.toJSON() };
        } else if (isEntityName(m.entity)) {
          if (m.op === 'create') {
            const doc = await createEntity(m.entity, userId, m.data ?? {}, m.clientId ?? m.id);
            result = { mutationId: m.mutationId, entity: m.entity, status: 'ok', item: doc.toJSON() };
          } else if (m.op === 'update') {
            const r = await updateEntity(m.entity, userId, m.id ?? '', m.data ?? {}, {
              baseUpdatedAt: m.baseUpdatedAt,
              clientUpdatedAt: m.clientUpdatedAt,
            });
            result = { mutationId: m.mutationId, entity: m.entity, status: r.conflict ? 'conflict' : 'ok', item: r.doc.toJSON() };
          } else if (m.op === 'delete') {
            const doc = await deleteEntity(m.entity, userId, m.id ?? '');
            result = { mutationId: m.mutationId, entity: m.entity, status: 'ok', item: doc.toJSON() };
          } else {
            throw new HttpError(400, `op không hợp lệ: ${m.op}`, 'BAD_OP');
          }
        } else {
          throw new HttpError(400, `entity không hợp lệ: ${m.entity}`, 'BAD_ENTITY');
        }
      } catch (e) {
        const err = e instanceof HttpError ? e : null;
        if (!err) console.error('[sync] mutation lỗi', m, e);
        // Phiên đã kết thúc ở thiết bị khác => coi là xung đột, trả bản server
        const details = err?.details as { session?: unknown } | undefined;
        result = {
          mutationId: m.mutationId,
          entity: m.entity,
          status: err?.status === 409 ? 'conflict' : 'error',
          item: details?.session,
          error: { code: err?.code ?? 'INTERNAL', message: err?.message ?? 'Lỗi máy chủ' },
        };
        // Lỗi 5xx: không lưu để client thử lại
        if (!err || err.status >= 500) {
          results.push(result);
          continue;
        }
      }
      await SyncMutationModel.create({ user: userId, mutationId: m.mutationId, result }).catch(() => undefined);
      results.push(result);
    }

    res.json({ results, serverTime: new Date().toISOString() });
  }),
);

export default router;
