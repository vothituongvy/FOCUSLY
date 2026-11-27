import { Model, Types } from 'mongoose';
import { z, ZodTypeAny } from 'zod';
import {
  CourseModel,
  GoalModel,
  RECURRENCE_FREQS,
  SubjectModel,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskModel,
} from '../models/Learning';
import { DEFAULT_CATEGORY, DISTRACTION_CATEGORIES, DISTRACTION_REASONS, DistractionModel } from '../models/Distraction';
import { FocusSessionModel } from '../models/FocusSession';
import {
  CardModel,
  DeckModel,
  MATERIAL_TYPES,
  MaterialModel,
  MaterialNoteModel,
  QUESTION_TYPES,
  QuizModel,
  RECOVERY_ACTIONS,
  RecallModel,
  RecoveryModel,
} from '../models/Learn';
import { removeStored } from './storage';
import { badRequest, notFound, parse } from '../utils/http';
import { notifyChange } from './realtime';
import { computeFocusSeconds } from './sessions';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyModel = Model<any>;

export type EntityName =
  | 'subjects'
  | 'courses'
  | 'goals'
  | 'tasks'
  | 'distractions'
  // Phase 2
  | 'materials'
  | 'materialNotes'
  | 'decks'
  | 'cards'
  | 'quizzes'
  | 'recalls'
  | 'recoveries';

const ref = z.string().min(1).max(64).nullable();
const date = z.coerce.date().nullable();

interface EntityDef {
  model: AnyModel;
  label: string;
  create: ZodTypeAny;
  update: ZodTypeAny;
  /** các trường tham chiếu tới model khác (có thể là ObjectId hoặc clientId tạo offline) */
  refs: Record<string, AnyModel>;
  beforeCreate?: (userId: string, data: any) => Promise<void> | void;
  beforeUpdate?: (userId: string, doc: any, data: any) => Promise<void> | void;
  afterCreate?: (userId: string, doc: any) => Promise<void> | void;
  afterUpdate?: (userId: string, doc: any, prev: any) => Promise<void> | void;
  afterDelete?: (userId: string, doc: any) => Promise<void> | void;
}

/* ---------------- Schemas ---------------- */

const subjectCreate = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(8).optional(),
  archived: z.boolean().optional(),
});

const courseCreate = z.object({
  subject: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional(),
  order: z.number().int().optional(),
});

const goalCreate = z.object({
  subject: ref.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: date.optional(),
  status: z.enum(['active', 'achieved', 'abandoned']).optional(),
});

const recurrence = z.object({
  freq: z.enum(RECURRENCE_FREQS),
  interval: z.number().int().min(1).max(365).default(1),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  until: date.default(null),
});

const taskCreate = z.object({
  subject: ref.optional(),
  course: ref.optional(),
  goal: ref.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  expectedOutcome: z.string().max(1000).optional(),
  estimatedMinutes: z.number().int().min(0).max(1440).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  scheduledDate: date.optional(),
  deadline: date.optional(),
  remindAt: date.optional(),
  recurrence: recurrence.optional(),
});

const distractionCreate = z.object({
  session: ref.optional(),
  subject: ref.optional(),
  task: ref.optional(),
  reason: z.enum(DISTRACTION_REASONS),
  category: z.enum(DISTRACTION_CATEGORIES).optional(),
  note: z.string().max(1000).optional(),
  occurredAt: z.coerce.date().optional(),
  minuteIntoSession: z.number().min(0).max(1440).nullable().optional(),
  durationSeconds: z.number().min(0).max(86400).nullable().optional(),
  source: z.enum(['manual', 'auto']).optional(),
  device: z.enum(['web', 'android', 'ios', 'unknown']).optional(),
});

/* ---------------- Phase 2 schemas ---------------- */

const materialCreate = z.object({
  subject: ref.optional(),
  course: ref.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  type: z.enum(MATERIAL_TYPES).default('link'),
  url: z.string().max(2000).optional(),
  textContent: z.string().max(300_000).optional(), // ghi chú dạng văn bản
});
const materialUpdate = materialCreate
  .omit({ type: true })
  .partial()
  .extend({
    bookmarked: z.boolean().optional(),
    lastOpenedAt: z.coerce.date().optional(),
    progress: z
      .object({ page: z.number().int().min(0), totalPages: z.number().int().min(0), percent: z.number().min(0).max(100) })
      .partial()
      .optional(),
  });

const materialNoteCreate = z.object({
  material: z.string().min(1),
  kind: z.enum(['note', 'highlight', 'bookmark']).default('note'),
  page: z.number().int().min(0).nullable().optional(),
  quote: z.string().max(2000).optional(),
  content: z.string().max(5000).optional(),
  color: z.string().max(20).optional(),
});

const deckCreate = z.object({
  subject: ref.optional(),
  material: ref.optional(),
  title: z.string().trim().min(1).max(150),
  description: z.string().max(1000).optional(),
  color: z.string().max(20).optional(),
});

const cardCreate = z.object({
  deck: z.string().min(1),
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
  hint: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  source: z.enum(['manual', 'ai', 'quiz_mistake']).optional(),
  suspended: z.boolean().optional(),
});

const question = z
  .object({
    qid: z.string().max(40).optional(),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1).max(2000),
    options: z.array(z.string().max(500)).max(8).default([]),
    correctIndex: z.number().int().min(0).max(7).nullable().optional(),
    correctIndexes: z.array(z.number().int().min(0).max(7)).max(8).default([]),
    correctBoolean: z.boolean().nullable().optional(),
    acceptedAnswers: z.array(z.string().max(300)).max(10).default([]),
    explanation: z.string().max(2000).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'mcq' && (q.options.length < 2 || q.correctIndex == null || q.correctIndex >= q.options.length)) {
      ctx.addIssue({ code: 'custom', message: 'Câu trắc nghiệm cần ≥2 lựa chọn và đáp án đúng' });
    }
    if (q.type === 'multi' && (q.options.length < 2 || q.correctIndexes.length === 0 || q.correctIndexes.some((i) => i >= q.options.length))) {
      ctx.addIssue({ code: 'custom', message: 'Câu nhiều đáp án cần ≥2 lựa chọn và ít nhất 1 đáp án đúng' });
    }
    if (q.type === 'true_false' && q.correctBoolean == null) ctx.addIssue({ code: 'custom', message: 'Câu đúng/sai cần đáp án' });
    if (q.type === 'short' && q.acceptedAnswers.length === 0) ctx.addIssue({ code: 'custom', message: 'Câu trả lời ngắn cần ít nhất 1 đáp án chấp nhận' });
  });

const quizCreate = z.object({
  subject: ref.optional(),
  material: ref.optional(),
  task: ref.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  questions: z.array(question).max(100).default([]),
  source: z.enum(['manual', 'ai']).optional(),
  timeLimitMinutes: z.number().int().min(0).max(300).optional(),
});

const recallCreate = z.object({
  session: ref.optional(),
  subject: ref.optional(),
  prompt: z.string().max(500).optional(),
  content: z.string().trim().min(1).max(10000),
  selfRating: z.number().int().min(1).max(5).nullable().optional(),
});

const recoveryCreate = z.object({
  session: ref.optional(),
  distraction: ref.optional(),
  trigger: z.enum(['manual', 'distraction', 'app_leave']).optional(),
  action: z.enum(RECOVERY_ACTIONS).optional(),
  outcome: z.enum(['resumed', 'ended', 'break']).optional(),
  durationSeconds: z.number().min(0).max(3600).optional(),
  startedAt: z.coerce.date().optional(),
  device: z.enum(['web', 'android', 'ios', 'unknown']).optional(),
});

const assignQids = (data: any) => {
  if (Array.isArray(data.questions)) {
    data.questions = data.questions.map((q: any, i: number) => ({ ...q, qid: q.qid || `q${i + 1}_${Math.random().toString(36).slice(2, 7)}` }));
  }
};

/* ---------------- Recurring tasks ---------------- */

function addInterval(d: Date, freq: string, interval: number, daysOfWeek: number[]): Date {
  const n = new Date(d);
  if (freq === 'daily') n.setDate(n.getDate() + interval);
  else if (freq === 'monthly') n.setMonth(n.getMonth() + interval);
  else if (freq === 'weekly') {
    if (daysOfWeek.length) {
      // tìm ngày kế tiếp nằm trong daysOfWeek
      for (let i = 1; i <= 7 * interval; i++) {
        const c = new Date(d);
        c.setDate(c.getDate() + i);
        if (daysOfWeek.includes(c.getDay())) return c;
      }
    }
    n.setDate(n.getDate() + 7 * interval);
  }
  return n;
}

/** Khi nhiệm vụ lặp lại được hoàn thành, tự tạo lần kế tiếp */
async function spawnNextOccurrence(userId: string, task: any) {
  const r = task.recurrence;
  if (!r || r.freq === 'none') return;
  const base: Date = task.scheduledDate ?? task.deadline ?? new Date();
  const nextBase = addInterval(base, r.freq, r.interval ?? 1, r.daysOfWeek ?? []);
  if (r.until && nextBase > r.until) return;
  const shift = nextBase.getTime() - base.getTime();
  const parentId = task.recurrenceParent ?? task._id;
  // tránh tạo trùng nếu task được bật/tắt "done" nhiều lần
  const exists = await TaskModel.exists({
    user: userId,
    recurrenceParent: parentId,
    scheduledDate: task.scheduledDate ? new Date(task.scheduledDate.getTime() + shift) : null,
    deadline: task.deadline ? new Date(task.deadline.getTime() + shift) : null,
    deletedAt: null,
  });
  if (exists) return;
  const next = await TaskModel.create({
    user: userId,
    subject: task.subject,
    course: task.course,
    goal: task.goal,
    title: task.title,
    description: task.description,
    expectedOutcome: task.expectedOutcome,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    status: 'todo',
    scheduledDate: task.scheduledDate ? new Date(task.scheduledDate.getTime() + shift) : null,
    deadline: task.deadline ? new Date(task.deadline.getTime() + shift) : null,
    remindAt: task.remindAt ? new Date(task.remindAt.getTime() + shift) : null,
    recurrence: r,
    recurrenceParent: parentId,
  });
  notifyChange(userId, 'tasks', 'create', next.toJSON());
}

/* ---------------- Registry ---------------- */

const BASE_ENTITIES: Partial<Record<EntityName, EntityDef>> = {
  subjects: {
    model: SubjectModel,
    label: 'Môn học',
    create: subjectCreate,
    update: subjectCreate.partial(),
    refs: {},
    afterDelete: async (userId, doc) => {
      const now = new Date();
      await CourseModel.updateMany({ user: userId, subject: doc._id, deletedAt: null }, { deletedAt: now });
      await TaskModel.updateMany({ user: userId, subject: doc._id }, { subject: null, course: null });
      await GoalModel.updateMany({ user: userId, subject: doc._id }, { subject: null });
      notifyChange(userId, 'courses', 'bulk', null);
      notifyChange(userId, 'tasks', 'bulk', null);
      notifyChange(userId, 'goals', 'bulk', null);
    },
  },
  courses: {
    model: CourseModel,
    label: 'Khoá học',
    create: courseCreate,
    update: courseCreate.partial(),
    refs: { subject: SubjectModel },
    afterDelete: async (userId, doc) => {
      await TaskModel.updateMany({ user: userId, course: doc._id }, { course: null });
      notifyChange(userId, 'tasks', 'bulk', null);
    },
  },
  goals: {
    model: GoalModel,
    label: 'Mục tiêu',
    create: goalCreate,
    update: goalCreate.partial(),
    refs: { subject: SubjectModel },
  },
  tasks: {
    model: TaskModel,
    label: 'Nhiệm vụ',
    create: taskCreate,
    update: taskCreate.partial(),
    refs: { subject: SubjectModel, course: CourseModel, goal: GoalModel },
    beforeCreate: (_u, data) => {
      if (data.status === 'done') data.completedAt = new Date();
    },
    beforeUpdate: (_u, doc, data) => {
      if (data.status === 'done' && doc.status !== 'done') data.completedAt = new Date();
      if (data.status && data.status !== 'done') data.completedAt = null;
    },
    afterUpdate: async (userId, doc, prev) => {
      if (doc.status === 'done' && prev.status !== 'done') await spawnNextOccurrence(userId, doc);
    },
  },
  distractions: {
    model: DistractionModel,
    label: 'Ghi nhận phân tâm',
    create: distractionCreate,
    update: distractionCreate.partial(),
    refs: { session: FocusSessionModel, subject: SubjectModel, task: TaskModel },
    beforeCreate: async (userId, data) => {
      data.category ??= DEFAULT_CATEGORY[data.reason as keyof typeof DEFAULT_CATEGORY];
      data.occurredAt ??= new Date();
      if (data.occurredAt > new Date()) data.occurredAt = new Date();
      if (data.session) {
        const s = await FocusSessionModel.findOne({ _id: data.session, user: userId });
        if (s) {
          data.subject ??= s.subject;
          data.task ??= s.task;
          if (data.minuteIntoSession == null) {
            data.minuteIntoSession = Math.round((computeFocusSeconds(s, data.occurredAt) / 60) * 10) / 10;
          }
        }
      }
    },
    afterCreate: async (userId, doc) => {
      if (doc.session) await recountSessionDistractions(userId, doc.session);
    },
    afterDelete: async (userId, doc) => {
      if (doc.session) await recountSessionDistractions(userId, doc.session);
    },
  },
};
export const ENTITIES = BASE_ENTITIES as Record<EntityName, EntityDef>;

const PHASE2: Record<Exclude<EntityName, 'subjects' | 'courses' | 'goals' | 'tasks' | 'distractions'>, EntityDef> = {
  materials: {
    model: MaterialModel,
    label: 'Tài liệu',
    create: materialCreate,
    update: materialUpdate,
    refs: { subject: SubjectModel, course: CourseModel },
    beforeCreate: (_u, data) => {
      if (data.textContent) {
        data.type = 'text';
        data.hasText = true;
      }
      if (data.type === 'link' && data.url && !/^https?:\/\//i.test(data.url)) data.url = `https://${data.url}`;
    },
    beforeUpdate: (_u, _doc, data) => {
      if (data.textContent !== undefined) data.hasText = Boolean(data.textContent);
      if (data.progress) {
        const p = { ...(_doc.progress?.toObject?.() ?? _doc.progress ?? {}), ...data.progress };
        if (p.totalPages > 0 && data.progress.percent === undefined) p.percent = Math.min(100, Math.round((p.page / p.totalPages) * 100));
        data.progress = p;
      }
    },
    afterDelete: async (userId, doc) => {
      const full = await MaterialModel.findById(doc._id).select('+storageId');
      await removeStored(full?.storageId);
      await MaterialNoteModel.updateMany({ user: userId, material: doc._id, deletedAt: null }, { deletedAt: new Date() });
      notifyChange(userId, 'materialNotes', 'bulk', null);
    },
  },
  materialNotes: {
    model: MaterialNoteModel,
    label: 'Ghi chú tài liệu',
    create: materialNoteCreate,
    update: materialNoteCreate.omit({ material: true }).partial(),
    refs: { material: MaterialModel },
  },
  decks: {
    model: DeckModel,
    label: 'Bộ thẻ',
    create: deckCreate,
    update: deckCreate.partial(),
    refs: { subject: SubjectModel, material: MaterialModel },
    afterDelete: async (userId, doc) => {
      await CardModel.updateMany({ user: userId, deck: doc._id, deletedAt: null }, { deletedAt: new Date() });
      notifyChange(userId, 'cards', 'bulk', null);
    },
  },
  cards: {
    model: CardModel,
    label: 'Thẻ ghi nhớ',
    create: cardCreate,
    update: cardCreate.omit({ deck: true }).partial(),
    refs: { deck: DeckModel },
  },
  quizzes: {
    model: QuizModel,
    label: 'Bộ câu hỏi',
    create: quizCreate,
    update: quizCreate.partial(),
    refs: { subject: SubjectModel, material: MaterialModel, task: TaskModel },
    beforeCreate: (_u, data) => assignQids(data),
    beforeUpdate: (_u, _doc, data) => assignQids(data),
  },
  recalls: {
    model: RecallModel,
    label: 'Ghi nhớ chủ động',
    create: recallCreate,
    update: recallCreate.partial(),
    refs: { session: FocusSessionModel, subject: SubjectModel },
    beforeCreate: async (userId, data) => {
      if (data.session && !data.subject) {
        const s = await FocusSessionModel.findOne({ _id: data.session, user: userId });
        data.subject = s?.subject ?? null;
      }
    },
  },
  recoveries: {
    model: RecoveryModel,
    label: 'Lấy lại tập trung',
    create: recoveryCreate,
    update: recoveryCreate.partial(),
    refs: { session: FocusSessionModel, distraction: DistractionModel },
  },
};
Object.assign(ENTITIES, PHASE2);

async function recountSessionDistractions(userId: string, sessionId: Types.ObjectId) {
  const count = await DistractionModel.countDocuments({
    user: userId,
    session: sessionId,
    deletedAt: null,
    reason: { $ne: 'left_app' },
  });
  const s = await FocusSessionModel.findOneAndUpdate(
    { _id: sessionId, user: userId },
    { distractionCount: count },
    { new: true },
  );
  if (s) notifyChange(userId, 'sessions', 'update', s.toJSON());
}

/* ---------------- Helpers ---------------- */

export function isEntityName(v: string): v is EntityName {
  return v in ENTITIES;
}

/** Tìm bản ghi bằng ObjectId hoặc clientId */
export async function findOwned(model: AnyModel, userId: string, idOrClientId: string) {
  const q = Types.ObjectId.isValid(idOrClientId) && String(new Types.ObjectId(idOrClientId)) === idOrClientId
    ? { $or: [{ _id: idOrClientId }, { clientId: idOrClientId }] }
    : { clientId: idOrClientId };
  return model.findOne({ ...q, user: userId });
}

async function resolveRefs(def: EntityDef, userId: string, data: Record<string, any>) {
  for (const [field, model] of Object.entries(def.refs)) {
    const v = data[field];
    if (v === undefined || v === null || v === '') {
      if (v === '') data[field] = null;
      continue;
    }
    const doc = await findOwned(model, userId, String(v));
    if (!doc) throw badRequest(`Tham chiếu ${field} không tồn tại`);
    data[field] = doc._id;
  }
}

export async function createEntity(entity: EntityName, userId: string, body: unknown, clientId?: string) {
  const def = ENTITIES[entity];
  if (clientId) {
    const existing = await def.model.findOne({ user: userId, clientId });
    if (existing) return existing; // idempotent
  }
  const data = parse(def.create, body) as Record<string, any>;
  await resolveRefs(def, userId, data);
  await def.beforeCreate?.(userId, data);
  const doc = await def.model.create({ ...data, user: userId, ...(clientId ? { clientId } : {}) });
  await def.afterCreate?.(userId, doc);
  notifyChange(userId, entity, 'create', doc.toJSON());
  return doc;
}

export interface UpdateOptions {
  /** updatedAt của bản server mà client đã thấy lần cuối (để phát hiện xung đột) */
  baseUpdatedAt?: Date;
  /** thời điểm client sửa (offline) */
  clientUpdatedAt?: Date;
}

export async function updateEntity(entity: EntityName, userId: string, id: string, body: unknown, opts: UpdateOptions = {}) {
  const def = ENTITIES[entity];
  const doc = await findOwned(def.model, userId, id);
  if (!doc || doc.deletedAt) throw notFound(`${def.label} không tồn tại`);

  // Phát hiện xung đột: bản server đã đổi sau khi client lấy về VÀ thay đổi server mới hơn thay đổi của client
  if (opts.baseUpdatedAt && doc.updatedAt > opts.baseUpdatedAt) {
    const clientTime = opts.clientUpdatedAt ?? new Date(0);
    if (doc.updatedAt > clientTime) {
      return { doc, conflict: true as const };
    }
  }

  const data = parse(def.update, body) as Record<string, any>;
  await resolveRefs(def, userId, data);
  const prev = doc.toObject();
  await def.beforeUpdate?.(userId, doc, data);
  doc.set(data);
  await doc.save();
  await def.afterUpdate?.(userId, doc, prev);
  notifyChange(userId, entity, 'update', doc.toJSON());
  return { doc, conflict: false as const };
}

export async function deleteEntity(entity: EntityName, userId: string, id: string) {
  const def = ENTITIES[entity];
  const doc = await findOwned(def.model, userId, id);
  if (!doc) throw notFound(`${def.label} không tồn tại`);
  if (!doc.deletedAt) {
    doc.deletedAt = new Date();
    await doc.save();
    await def.afterDelete?.(userId, doc);
    notifyChange(userId, entity, 'delete', { id: doc.id, clientId: doc.clientId, deletedAt: doc.deletedAt });
  }
  return doc;
}
