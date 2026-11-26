import { z } from 'zod';
import { FocusSessionDoc, FocusSessionModel } from '../models/FocusSession';
import { SubjectModel, TaskModel } from '../models/Learning';
import { DistractionModel } from '../models/Distraction';
import { UserModel } from '../models/User';
import { badRequest, conflict, notFound, parse } from '../utils/http';
import { emitToUser, notifyChange } from './realtime';
import { findOwned, updateEntity } from './entities';

/** Sau bao lâu không có heartbeat thì coi như app đã đóng / mất mạng */
export const STALE_HEARTBEAT_MS = 3 * 60 * 1000;
/** Phiên bị bỏ quá lâu sẽ tự kết thúc */
export const ABANDON_AFTER_MS = 12 * 60 * 60 * 1000;
const OPEN_STATUSES = ['active', 'paused', 'on_break'] as const;

type Seg = { type: 'focus' | 'break'; startedAt: Date; endedAt?: Date | null; endReason?: string | null };

function segs(s: { segments: unknown }): Seg[] {
  return s.segments as unknown as Seg[];
}

function sumSeconds(s: { segments: unknown }, type: 'focus' | 'break', at: Date): number {
  let ms = 0;
  for (const seg of segs(s)) {
    if (seg.type !== type) continue;
    const end = seg.endedAt ?? at;
    ms += Math.max(0, end.getTime() - seg.startedAt.getTime());
  }
  return Math.round(ms / 1000);
}

/** Thời gian tập trung thực tế (giây) tính theo thời gian server */
export function computeFocusSeconds(s: { segments: unknown }, at = new Date()): number {
  return sumSeconds(s, 'focus', at);
}

export function computeBreakSeconds(s: { segments: unknown }, at = new Date()): number {
  return sumSeconds(s, 'break', at);
}

function lastSeg(s: FocusSessionDoc): Seg | undefined {
  const list = segs(s);
  return list[list.length - 1];
}

/** Dữ liệu trả cho client: kèm số giây tính tới hiện tại + giờ server để client tự đếm */
export function viewSession(s: FocusSessionDoc) {
  const now = new Date();
  const current = lastSeg(s);
  return {
    ...s.toJSON(),
    focusSecondsNow: computeFocusSeconds(s, now),
    breakSecondsNow: computeBreakSeconds(s, now),
    currentSegment: current && !current.endedAt ? current : null,
    serverTime: now.toISOString(),
  };
}

function broadcast(userId: string, s: FocusSessionDoc) {
  const v = viewSession(s);
  emitToUser(userId, 'session:updated', v);
  notifyChange(userId, 'sessions', 'update', s.toJSON());
  return v;
}

/** Chuẩn hoá thời điểm sự kiện client gửi (hỗ trợ gửi lại khi offline) */
function clampAt(s: FocusSessionDoc | null, at?: Date): Date {
  const now = new Date();
  let t = at ?? now;
  if (t.getTime() > now.getTime()) t = now;
  if (s) {
    const last = lastSeg(s);
    const floor = last ? (last.endedAt ?? last.startedAt) : s.startedAt;
    if (t < floor) t = new Date(floor);
  }
  return t;
}

function closeOpenSegment(s: FocusSessionDoc, at: Date, reason: Seg['endReason']) {
  const last = lastSeg(s);
  if (last && !last.endedAt) {
    last.endedAt = at;
    last.endReason = reason;
    s.markModified('segments');
  }
}

function recalc(s: FocusSessionDoc, at = new Date()) {
  s.actualFocusSeconds = computeFocusSeconds(s, at);
  s.breakSeconds = computeBreakSeconds(s, at);
}

/**
 * Nếu server đã tự tạm dừng phiên (do mất heartbeat) nhưng thiết bị gửi lên sự kiện
 * xảy ra SAU thời điểm đó (thiết bị chỉ mất mạng, vẫn đang học) => mở lại segment.
 */
function undoAutoPauseIfNeeded(s: FocusSessionDoc, at: Date) {
  const last = lastSeg(s);
  if (s.status === 'paused' && s.autoPausedAt && last?.endReason === 'auto_pause' && last.endedAt && at > last.endedAt) {
    last.endedAt = null;
    last.endReason = null;
    s.status = 'active';
    s.autoPausedAt = null;
    s.markModified('segments');
  }
}

/**
 * Khôi phục phiên: nếu app bị đóng / mất mạng quá lâu, tự tạm dừng tại lần heartbeat cuối,
 * để thời gian "chết" không bị tính vào thời gian tập trung.
 */
export async function reconcile(s: FocusSessionDoc): Promise<FocusSessionDoc> {
  const now = Date.now();
  const hb = (s.lastHeartbeatAt ?? s.startedAt).getTime();
  let changed = false;

  if (OPEN_STATUSES.includes(s.status as (typeof OPEN_STATUSES)[number]) && now - hb > ABANDON_AFTER_MS) {
    closeOpenSegment(s, new Date(hb), 'end');
    s.status = s.actualFocusSeconds > 60 || computeFocusSeconds(s) > 60 ? 'completed' : 'abandoned';
    s.endedAt = new Date(hb);
    recalc(s, new Date(hb));
    changed = true;
    if (s.task && s.status === 'completed') {
      await TaskModel.updateOne({ _id: s.task }, { $inc: { actualFocusSeconds: s.actualFocusSeconds } });
    }
  } else if (s.status === 'active' && now - hb > STALE_HEARTBEAT_MS) {
    closeOpenSegment(s, new Date(hb), 'auto_pause');
    s.status = 'paused';
    s.autoPausedAt = new Date();
    recalc(s, new Date(hb));
    changed = true;
  }
  if (changed) {
    await s.save();
    broadcast(String(s.user), s);
  }
  return s;
}

export async function getActiveSession(userId: string): Promise<FocusSessionDoc | null> {
  const s = await FocusSessionModel.findOne({ user: userId, status: { $in: OPEN_STATUSES }, deletedAt: null }).sort({
    startedAt: -1,
  });
  if (!s) return null;
  await reconcile(s);
  return OPEN_STATUSES.includes(s.status as (typeof OPEN_STATUSES)[number]) ? s : null;
}

/* ---------------- Actions ---------------- */

export const startSchema = z.object({
  subject: z.string().nullable().optional(),
  task: z.string().nullable().optional(),
  goal: z.string().max(500).optional(),
  mode: z.enum(['pomodoro', 'custom', 'free']).default('pomodoro'),
  plannedMinutes: z.number().int().min(0).max(600).optional(),
  pomodoro: z
    .object({
      focusMinutes: z.number().int().min(1).max(180),
      breakMinutes: z.number().int().min(1).max(60),
      longBreakMinutes: z.number().int().min(1).max(90),
      cyclesBeforeLongBreak: z.number().int().min(1).max(12),
    })
    .partial()
    .optional(),
  shieldEnabled: z.boolean().optional(),
  device: z.enum(['web', 'android', 'ios', 'unknown']).default('web'),
  at: z.coerce.date().optional(),
  /** kết thúc phiên đang mở (trên thiết bị khác) rồi bắt đầu phiên mới */
  takeover: z.boolean().optional(),
});

export async function startSession(userId: string, body: unknown, clientId?: string) {
  if (clientId) {
    const existing = await FocusSessionModel.findOne({ user: userId, clientId });
    if (existing) return viewSession(existing);
  }
  const data = parse(startSchema, body);

  const active = await getActiveSession(userId);
  if (active) {
    if (!data.takeover) throw conflict('Bạn đang có một phiên học chưa kết thúc', { session: viewSession(active) });
    await endSession(userId, active.id, { abandon: active.actualFocusSeconds < 60 });
  }

  const user = await UserModel.findById(userId);
  if (!user) throw notFound();

  let subjectId = null;
  let taskId = null;
  if (data.task) {
    const task = await findOwned(TaskModel, userId, data.task);
    if (!task || task.deletedAt) throw badRequest('Nhiệm vụ không tồn tại');
    taskId = task._id;
    subjectId = task.subject ?? null;
    if (task.status === 'todo') {
      task.status = 'in_progress';
      await task.save();
      notifyChange(userId, 'tasks', 'update', task.toJSON());
    }
  }
  if (data.subject) {
    const subject = await findOwned(SubjectModel, userId, data.subject);
    if (!subject || subject.deletedAt) throw badRequest('Môn học không tồn tại');
    subjectId = subject._id;
  }

  const pomodoro = { ...user.profile?.defaultPomodoro, ...data.pomodoro, completedCycles: 0 };
  const at = clampAt(null, data.at);
  const plannedMinutes =
    data.plannedMinutes ?? (data.mode === 'pomodoro' ? (pomodoro.focusMinutes ?? 25) * (pomodoro.cyclesBeforeLongBreak ?? 4) : 0);

  const s = await FocusSessionModel.create({
    user: userId,
    clientId,
    subject: subjectId,
    task: taskId,
    goal: data.goal ?? '',
    mode: data.mode,
    plannedMinutes,
    pomodoro,
    status: 'active',
    startedAt: at,
    segments: [{ type: 'focus', startedAt: at }],
    shieldEnabled: data.shieldEnabled ?? user.shield?.autoEnableOnSession ?? true,
    device: data.device,
    lastHeartbeatAt: new Date(),
  });
  emitToUser(userId, 'session:started', viewSession(s));
  return broadcast(userId, s);
}

async function loadOpen(userId: string, id: string): Promise<FocusSessionDoc> {
  const s = (await findOwned(FocusSessionModel, userId, id)) as FocusSessionDoc | null;
  if (!s || s.deletedAt) throw notFound('Phiên học không tồn tại');
  return s;
}

function assertOpen(s: FocusSessionDoc) {
  if (!OPEN_STATUSES.includes(s.status as (typeof OPEN_STATUSES)[number])) {
    throw conflict('Phiên học đã kết thúc', { session: viewSession(s) });
  }
}

export async function pauseSession(userId: string, id: string, atIn?: Date) {
  const s = await loadOpen(userId, id);
  assertOpen(s);
  const at = clampAt(s, atIn);
  undoAutoPauseIfNeeded(s, at);
  if (s.status === 'active') {
    closeOpenSegment(s, at, 'pause');
    s.status = 'paused';
    s.pauseCount += 1;
  }
  s.lastHeartbeatAt = new Date();
  recalc(s);
  await s.save();
  return broadcast(userId, s);
}

export async function resumeSession(userId: string, id: string, atIn?: Date) {
  const s = await loadOpen(userId, id);
  assertOpen(s);
  const at = clampAt(s, atIn);
  if (s.status === 'paused' || s.status === 'on_break') {
    closeOpenSegment(s, at, 'resume');
    segs(s).push({ type: 'focus', startedAt: at, endedAt: null });
    s.markModified('segments');
    s.status = 'active';
    s.autoPausedAt = null;
  }
  s.lastHeartbeatAt = new Date();
  recalc(s);
  await s.save();
  return broadcast(userId, s);
}

export async function startBreak(userId: string, id: string, atIn?: Date) {
  const s = await loadOpen(userId, id);
  assertOpen(s);
  const at = clampAt(s, atIn);
  undoAutoPauseIfNeeded(s, at);
  if (s.status === 'active' || s.status === 'paused') {
    if (s.status === 'active' && s.mode === 'pomodoro') s.pomodoro!.completedCycles = (s.pomodoro!.completedCycles ?? 0) + 1;
    closeOpenSegment(s, at, 'break');
    segs(s).push({ type: 'break', startedAt: at, endedAt: null });
    s.markModified('segments');
    s.status = 'on_break';
  }
  s.lastHeartbeatAt = new Date();
  recalc(s);
  await s.save();
  return broadcast(userId, s);
}

export const endSchema = z.object({
  at: z.coerce.date().optional(),
  abandon: z.boolean().optional(),
  goalAchieved: z.boolean().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(2000).optional(),
  markTaskDone: z.boolean().optional(),
});

export async function endSession(userId: string, id: string, body: unknown) {
  const data = parse(endSchema, body ?? {});
  const s = await loadOpen(userId, id);
  if (s.status === 'completed' || s.status === 'abandoned') return viewSession(s); // idempotent
  const at = clampAt(s, data.at);
  undoAutoPauseIfNeeded(s, at);
  closeOpenSegment(s, at, 'end');
  recalc(s, at);
  s.status = data.abandon ? 'abandoned' : 'completed';
  s.endedAt = at;
  s.summary = {
    goalAchieved: data.goalAchieved ?? null,
    rating: data.rating ?? null,
    note: data.note ?? '',
  };
  await s.save();

  if (s.task) {
    await TaskModel.updateOne({ _id: s.task, user: userId }, { $inc: { actualFocusSeconds: s.actualFocusSeconds } });
    if (data.markTaskDone) {
      await updateEntity('tasks', userId, String(s.task), { status: 'done' });
    } else {
      const t = await TaskModel.findById(s.task);
      if (t) notifyChange(userId, 'tasks', 'update', t.toJSON());
    }
  }
  emitToUser(userId, 'session:ended', viewSession(s));
  return broadcast(userId, s);
}

export const summarySchema = z.object({
  goalAchieved: z.boolean().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().max(2000).optional(),
});

export async function updateSummary(userId: string, id: string, body: unknown) {
  const data = parse(summarySchema, body);
  const s = await loadOpen(userId, id);
  s.summary = { ...(s.summary as object), ...data } as typeof s.summary;
  await s.save();
  return broadcast(userId, s);
}

export async function heartbeat(userId: string, id: string, atIn?: Date) {
  const s = await loadOpen(userId, id);
  if (!OPEN_STATUSES.includes(s.status as (typeof OPEN_STATUSES)[number])) return viewSession(s);
  const at = clampAt(s, atIn);
  const wasAutoPaused = Boolean(s.autoPausedAt);
  undoAutoPauseIfNeeded(s, at);
  s.lastHeartbeatAt = new Date();
  recalc(s);
  await s.save();
  return wasAutoPaused && !s.autoPausedAt ? broadcast(userId, s) : viewSession(s);
}

export const appLeaveSchema = z.object({
  leftAt: z.coerce.date(),
  returnedAt: z.coerce.date().optional(),
  device: z.enum(['web', 'android', 'ios', 'unknown']).default('web'),
});

/** Focus Shield: ghi nhận việc rời app/tab khi đang học (tự động vào Distraction Journal) */
export async function recordAppLeave(userId: string, id: string, body: unknown) {
  const data = parse(appLeaveSchema, body);
  const s = await loadOpen(userId, id);
  const returnedAt = data.returnedAt ?? new Date();
  const durationSeconds = Math.max(0, Math.round((returnedAt.getTime() - data.leftAt.getTime()) / 1000));
  s.appLeaveCount += 1;
  await s.save();
  if (durationSeconds >= 10) {
    const d = await DistractionModel.create({
      user: userId,
      session: s._id,
      subject: s.subject,
      task: s.task,
      reason: 'left_app',
      category: 'digital',
      occurredAt: data.leftAt,
      durationSeconds,
      minuteIntoSession: Math.round((computeFocusSeconds(s, data.leftAt) / 60) * 10) / 10,
      source: 'auto',
      device: data.device,
    });
    notifyChange(userId, 'distractions', 'create', d.toJSON());
  }
  return broadcast(userId, s);
}

export type SessionAction = 'start' | 'pause' | 'resume' | 'break' | 'end' | 'heartbeat' | 'summary' | 'app-leave';

/** Dùng cho /sync/push: chạy một hành động phiên học đã được xếp hàng offline */
export async function runSessionAction(
  userId: string,
  action: SessionAction,
  ref: string | undefined,
  payload: Record<string, unknown> = {},
  clientId?: string,
) {
  const at = payload.at ? new Date(String(payload.at)) : undefined;
  if (action === 'start') return startSession(userId, payload, clientId ?? ref);
  if (!ref) throw badRequest('Thiếu id phiên học');
  switch (action) {
    case 'pause':
      return pauseSession(userId, ref, at);
    case 'resume':
      return resumeSession(userId, ref, at);
    case 'break':
      return startBreak(userId, ref, at);
    case 'end':
      return endSession(userId, ref, payload);
    case 'heartbeat':
      return heartbeat(userId, ref, at);
    case 'summary':
      return updateSummary(userId, ref, payload);
    case 'app-leave':
      return recordAppLeave(userId, ref, payload);
    default:
      throw badRequest(`Hành động không hỗ trợ: ${action}`);
  }
}
