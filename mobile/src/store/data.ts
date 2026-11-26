import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { api, isNetworkError } from '../api/client';
import {
  bumpAttempts,
  deleteRecord,
  enqueue,
  getRecord,
  hasPendingFor,
  initDb,
  kvGet,
  kvSet,
  listRecords,
  outboxCount,
  peekOutbox,
  removeOutbox,
  uid,
  upsertRecord,
} from '../offline/db';
import type { Card, Course, Deck, Distraction, FocusSession, Goal, Material, Quiz, QuizAttempt, Subject, Task, User } from '../types';

export type Entity =
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
const ENTITIES: Entity[] = ['subjects', 'courses', 'goals', 'tasks', 'distractions', 'materials', 'materialNotes', 'decks', 'cards', 'quizzes', 'recalls', 'recoveries'];
/** Các bảng chỉ đọc (server tạo) */
const READONLY = ['sessions', 'quizAttempts'];

interface Base {
  id: string;
  clientId?: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface PushResult {
  mutationId: string;
  status: 'ok' | 'conflict' | 'error';
  entity: string;
  item?: Base & Record<string, unknown>;
  error?: { code: string; message: string };
}

interface DataState {
  subjects: Subject[];
  courses: Course[];
  goals: Goal[];
  tasks: Task[];
  distractions: Distraction[];
  sessions: FocusSession[];
  materials: Material[];
  decks: Deck[];
  cards: Card[];
  quizzes: Quiz[];
  quizAttempts: QuizAttempt[];
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastConflicts: number;
  init: () => Promise<void>;
  reloadFromDb: () => Promise<void>;
  sync: () => Promise<void>;
  create: <T>(entity: Entity, data: Record<string, unknown>) => Promise<T>;
  update: (entity: Entity, id: string, data: Record<string, unknown>) => Promise<void>;
  remove: (entity: Entity, id: string) => Promise<void>;
  /** Xếp hàng một thao tác tuỳ chỉnh (vd: cards/review, quizAttempts/create) */
  queueCustom: (entity: string, op: string, refId: string | null, payload: Record<string, unknown>) => Promise<void>;
  /** Cập nhật bản ghi cục bộ (không gửi server – dùng cho kết quả tính trước) */
  patchLocal: (entity: string, id: string, data: Record<string, unknown>) => Promise<void>;
}

/** Lắng nghe kết quả đồng bộ phiên học (session store đăng ký) */
let sessionListener: ((s: FocusSession) => void) | null = null;
export const onSessionSynced = (fn: (s: FocusSession) => void) => {
  sessionListener = fn;
};
let userListener: ((u: User) => void) | null = null;
export const onUserSynced = (fn: (u: User) => void) => {
  userListener = fn;
};

let syncAgain = false;
let netListening = false;

/**
 * Store dữ liệu "local-first":
 * - Đọc từ SQLite (hoạt động offline)
 * - Ghi: cập nhật SQLite ngay + xếp hàng vào outbox
 * - Đồng bộ: push outbox -> pull thay đổi từ server (khi có mạng / có sự kiện realtime)
 */
export const useData = create<DataState>((set, get) => ({
  subjects: [],
  courses: [],
  goals: [],
  tasks: [],
  distractions: [],
  sessions: [],
  materials: [],
  decks: [],
  cards: [],
  quizzes: [],
  quizAttempts: [],
  online: true,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  lastConflicts: 0,

  init: async () => {
    await initDb();
    await get().reloadFromDb();
    set({ lastSyncAt: await kvGet<string>('lastPullAt') });
    if (netListening) return;
    netListening = true;
    NetInfo.addEventListener((s) => {
      const online = Boolean(s.isConnected && s.isInternetReachable !== false);
      const was = get().online;
      set({ online });
      if (online && !was) void get().sync();
    });
  },

  reloadFromDb: async () => {
    const alive = <T extends { deletedAt?: string | null }>(xs: T[]) => xs.filter((x) => !x.deletedAt);
    const [subjects, courses, goals, tasks, distractions, sessions, materials, decks, cards, quizzes, quizAttempts] = await Promise.all([
      listRecords<Subject>('subjects'),
      listRecords<Course>('courses'),
      listRecords<Goal>('goals'),
      listRecords<Task>('tasks'),
      listRecords<Distraction>('distractions'),
      listRecords<FocusSession>('sessions'),
      listRecords<Material>('materials'),
      listRecords<Deck>('decks'),
      listRecords<Card>('cards'),
      listRecords<Quiz>('quizzes'),
      listRecords<QuizAttempt>('quizAttempts'),
    ]);
    set({
      subjects: alive(subjects).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      courses: alive(courses),
      goals: alive(goals),
      tasks: alive(tasks),
      distractions: alive(distractions).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      sessions: alive(sessions).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      materials: alive(materials).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      decks: alive(decks),
      cards: alive(cards),
      quizzes: alive(quizzes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      quizAttempts: alive(quizAttempts).sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
      pending: await outboxCount(),
    });
  },

  sync: async () => {
    if (get().syncing) {
      syncAgain = true;
      return;
    }
    set({ syncing: true });
    let conflicts = 0;
    try {
      /* ---- 1. PUSH ---- */
      for (let round = 0; round < 10; round++) {
        const batch = await peekOutbox(100);
        if (!batch.length) break;
        const mutations = batch.map((m) => ({
          mutationId: m.mutationId,
          entity: m.entity,
          op: m.op,
          id: m.refId ?? undefined,
          clientId: m.payload.clientId as string | undefined,
          data: m.payload.data as Record<string, unknown> | undefined,
          baseUpdatedAt: m.payload.baseUpdatedAt as string | undefined,
          clientUpdatedAt: m.payload.clientUpdatedAt as string | undefined,
        }));
        const { results } = await api<{ results: PushResult[] }>('/sync/push', { method: 'POST', body: { mutations }, timeoutMs: 30000 });
        const done: string[] = [];
        const retry: string[] = [];
        for (const r of results) {
          const m = batch.find((b) => b.mutationId === r.mutationId);
          if (r.status === 'error' && r.error?.code === 'INTERNAL' && (m?.attempts ?? 0) < 5) {
            retry.push(r.mutationId);
            continue;
          }
          done.push(r.mutationId);
          if (r.status === 'conflict') conflicts++;
          if (!r.item) continue;
          if (r.entity === 'quizAttempts') {
            const a = r.item as unknown as QuizAttempt;
            if (a.clientId && a.clientId !== a.id) await deleteRecord('quizAttempts', a.clientId);
            await upsertRecord('quizAttempts', a);
          } else if (r.entity === 'sessions') {
            const s = r.item as unknown as FocusSession;
            await upsertRecord('sessions', s);
            if (s.clientId && s.clientId !== s.id) await deleteRecord('sessions', s.clientId);
            sessionListener?.(s);
          } else {
            // bản ghi tạo offline: id tạm (clientId) -> id thật từ server
            if (r.item.clientId && r.item.clientId !== r.item.id) await deleteRecord(r.entity, r.item.clientId);
            if (r.item.deletedAt) await deleteRecord(r.entity, r.item.id);
            else await upsertRecord(r.entity, r.item);
          }
        }
        await removeOutbox(done);
        await bumpAttempts(retry);
        if (retry.length && !done.length) break;
      }

      /* ---- 2. PULL ---- */
      const since = (await kvGet<string>('lastPullAt')) ?? '';
      const pull = await api<{
        serverTime: string;
        changes: Record<string, (Base & Record<string, unknown>)[]>;
        user: User | null;
      }>(`/sync/pull?since=${encodeURIComponent(since)}`, { timeoutMs: 30000 });
      for (const entity of [...ENTITIES, ...READONLY]) {
        for (const item of pull.changes[entity] ?? []) {
          if (await hasPendingFor(entity, item.id)) continue; // đang có thay đổi cục bộ chưa gửi
          if (item.clientId && item.clientId !== item.id) await deleteRecord(entity, item.clientId);
          if (item.deletedAt) await deleteRecord(entity, item.id);
          else await upsertRecord(entity, item);
        }
      }
      if (pull.user) userListener?.(pull.user);
      await kvSet('lastPullAt', pull.serverTime);
      set({ lastSyncAt: pull.serverTime, online: true, lastConflicts: conflicts });
    } catch (e) {
      if (isNetworkError(e)) set({ online: false });
      else console.warn('[sync]', e);
    } finally {
      await get().reloadFromDb();
      set({ syncing: false });
      if (syncAgain) {
        syncAgain = false;
        void get().sync();
      }
    }
  },

  create: async <T,>(entity: Entity, data: Record<string, unknown>) => {
    const clientId = uid();
    const now = new Date().toISOString();
    const local = { ...data, id: clientId, clientId, createdAt: now, updatedAt: now, deletedAt: null };
    await upsertRecord(entity, local, true);
    await enqueue({ mutationId: uid(), entity, op: 'create', refId: clientId, payload: { clientId, data } });
    await get().reloadFromDb();
    void get().sync();
    return local as T;
  },

  update: async (entity, id, data) => {
    const current = await getRecord<Base & Record<string, unknown>>(entity, id);
    if (!current) return;
    const now = new Date().toISOString();
    await upsertRecord(entity, { ...current, ...data, id, updatedAt: current.updatedAt }, true);
    await enqueue({
      mutationId: uid(),
      entity,
      op: 'update',
      refId: id,
      payload: { data, baseUpdatedAt: current.updatedAt, clientUpdatedAt: now },
    });
    await get().reloadFromDb();
    void get().sync();
  },

  queueCustom: async (entity, op, refId, payload) => {
    await enqueue({ mutationId: uid(), entity, op, refId, payload });
    await get().reloadFromDb();
    void get().sync();
  },

  patchLocal: async (entity, id, data) => {
    const current = await getRecord<Base & Record<string, unknown>>(entity, id);
    await upsertRecord(entity, { ...(current ?? {}), ...data, id, updatedAt: current?.updatedAt ?? new Date().toISOString() } as Base, true);
    await get().reloadFromDb();
  },

  remove: async (entity, id) => {
    await deleteRecord(entity, id);
    await enqueue({ mutationId: uid(), entity, op: 'delete', refId: id, payload: {} });
    await get().reloadFromDb();
    void get().sync();
  },
}));
