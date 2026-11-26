import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAuthOrExtension, uid } from '../middleware/auth';
import { ah, notFound, parse } from '../utils/http';
import { UserModel } from '../models/User';
import { getActiveSession } from '../services/sessions';
import { signExtensionToken } from '../services/tokens';
import { emitToUser } from '../services/realtime';
import { isWithinSchedule, safeTimeZone } from '../utils/time';

const router = Router();

/** "https://www.youtube.com/watch?v=1" -> "youtube.com" */
export function normalizeDomain(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  v = v.split(/[/?#:]/)[0];
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return null;
  return v;
}

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const shieldSchema = z.object({
  blockList: z.array(z.string()).max(200).optional(),
  allowList: z.array(z.string()).max(200).optional(),
  strictByDefault: z.boolean().optional(),
  autoEnableOnSession: z.boolean().optional(),
  hideDistractions: z.boolean().optional(),
  schedule: z
    .array(
      z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1),
        start: hm,
        end: hm,
        enabled: z.boolean().default(true),
      }),
    )
    .max(20)
    .optional(),
});

async function computeState(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw notFound();
  const tz = safeTimeZone(user.profile?.timezone);
  const session = await getActiveSession(userId);
  const sessionActive = Boolean(session && session.shieldEnabled && session.status === 'active');
  const scheduleActive = isWithinSchedule(new Date(), tz, (user.shield?.schedule ?? []) as never);
  return {
    active: sessionActive || scheduleActive,
    reason: sessionActive ? 'session' : scheduleActive ? 'schedule' : null,
    blockList: user.shield?.blockList ?? [],
    allowList: user.shield?.allowList ?? [],
    strict: Boolean(sessionActive && session?.strict),
    hideDistractions: user.shield?.hideDistractions ?? true,
    session: session
      ? {
          id: session.id,
          status: session.status,
          goal: session.goal,
          device: session.device,
          shieldEnabled: session.shieldEnabled,
          strict: session.strict,
          startedAt: session.startedAt,
        }
      : null,
    serverTime: new Date().toISOString(),
  };
}

/* GET /shield — cấu hình Focus Shield */
router.get(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const user = await UserModel.findById(uid(req));
    if (!user) throw notFound();
    res.json({ shield: user.shield });
  }),
);

/* PUT /shield */
router.put(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const data = parse(shieldSchema, req.body);
    const $set: Record<string, unknown> = {};
    if (data.blockList) {
      const domains = [...new Set(data.blockList.map(normalizeDomain).filter((d): d is string => Boolean(d)))];
      $set['shield.blockList'] = domains;
    }
    if (data.allowList) {
      $set['shield.allowList'] = [...new Set(data.allowList.map(normalizeDomain).filter((d): d is string => Boolean(d)))];
    }
    if (data.strictByDefault !== undefined) $set['shield.strictByDefault'] = data.strictByDefault;
    if (data.autoEnableOnSession !== undefined) $set['shield.autoEnableOnSession'] = data.autoEnableOnSession;
    if (data.hideDistractions !== undefined) $set['shield.hideDistractions'] = data.hideDistractions;
    if (data.schedule) $set['shield.schedule'] = data.schedule;
    const user = await UserModel.findByIdAndUpdate(uid(req), { $set }, { new: true });
    if (!user) throw notFound();
    emitToUser(uid(req), 'shield:updated', await computeState(uid(req)));
    res.json({ shield: user.shield });
  }),
);

/* GET /shield/state — trạng thái hiện tại (Web, Mobile, Chrome Extension) */
router.get(
  '/state',
  requireAuthOrExtension,
  ah(async (req, res) => {
    res.json(await computeState(uid(req)));
  }),
);

/* POST /shield/extension-token — token chỉ-đọc để kết nối Chrome Extension */
router.post(
  '/extension-token',
  requireAuth,
  ah(async (req, res) => {
    res.json({ token: signExtensionToken(uid(req)), scope: 'shield:read', expiresIn: '90d' });
  }),
);

export default router;
