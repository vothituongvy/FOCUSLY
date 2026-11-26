import { open } from '@op-engineering/op-sqlite';

/**
 * SQLite (OP-SQLite) – lưu dữ liệu offline:
 *  - records: bản sao cục bộ của subjects/courses/goals/tasks/distractions/sessions
 *  - outbox : hàng đợi thay đổi chưa gửi lên server (theo đúng thứ tự)
 *  - kv     : giá trị lẻ (lastPullAt, cache dashboard...)
 */
const db = open({ name: 'focusly.sqlite' });

type Row = Record<string, unknown>;

async function exec(sql: string, params: unknown[] = []): Promise<Row[]> {
  // Tương thích nhiều phiên bản op-sqlite (rows là mảng hoặc { _array })
  const res = (await (db as unknown as { execute: (s: string, p?: unknown[]) => unknown }).execute(sql, params)) as {
    rows?: Row[] | { _array: Row[] };
  };
  const rows = res?.rows;
  if (!rows) return [];
  return Array.isArray(rows) ? rows : (rows._array ?? []);
}

let ready: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await exec(
        `CREATE TABLE IF NOT EXISTS records (
          entity TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, updatedAt TEXT, pending INTEGER DEFAULT 0,
          PRIMARY KEY (entity, id))`,
      );
      await exec(
        `CREATE TABLE IF NOT EXISTS outbox (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, mutationId TEXT UNIQUE, entity TEXT, op TEXT, refId TEXT, json TEXT, createdAt TEXT, attempts INTEGER DEFAULT 0)`,
      );
      await exec(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)`);
    })();
  }
  return ready;
}

/* ---------- records ---------- */
export async function upsertRecord(entity: string, item: { id: string; updatedAt?: string }, pending = false) {
  await exec(`INSERT OR REPLACE INTO records (entity, id, json, updatedAt, pending) VALUES (?, ?, ?, ?, ?)`, [
    entity,
    item.id,
    JSON.stringify(item),
    item.updatedAt ?? new Date().toISOString(),
    pending ? 1 : 0,
  ]);
}

export async function deleteRecord(entity: string, id: string) {
  await exec(`DELETE FROM records WHERE entity = ? AND id = ?`, [entity, id]);
}

export async function getRecord<T>(entity: string, id: string): Promise<T | null> {
  const rows = await exec(`SELECT json FROM records WHERE entity = ? AND id = ?`, [entity, id]);
  return rows[0] ? (JSON.parse(String(rows[0].json)) as T) : null;
}

export async function listRecords<T>(entity: string): Promise<T[]> {
  const rows = await exec(`SELECT json FROM records WHERE entity = ?`, [entity]);
  return rows.map((r) => JSON.parse(String(r.json)) as T);
}

/* ---------- outbox ---------- */
export interface OutboxItem {
  seq: number;
  mutationId: string;
  entity: string;
  op: string;
  refId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function enqueue(m: { mutationId: string; entity: string; op: string; refId?: string | null; payload: Record<string, unknown> }) {
  await exec(`INSERT INTO outbox (mutationId, entity, op, refId, json, createdAt) VALUES (?, ?, ?, ?, ?, ?)`, [
    m.mutationId,
    m.entity,
    m.op,
    m.refId ?? null,
    JSON.stringify(m.payload),
    new Date().toISOString(),
  ]);
}

/** Gộp heartbeat: chỉ giữ heartbeat mới nhất cho 1 phiên */
export async function removeQueued(entity: string, op: string, refId: string) {
  await exec(`DELETE FROM outbox WHERE entity = ? AND op = ? AND refId = ?`, [entity, op, refId]);
}

export async function peekOutbox(limit = 100): Promise<OutboxItem[]> {
  const rows = await exec(`SELECT * FROM outbox ORDER BY seq ASC LIMIT ?`, [limit]);
  return rows.map((r) => ({
    seq: Number(r.seq),
    mutationId: String(r.mutationId),
    entity: String(r.entity),
    op: String(r.op),
    refId: (r.refId as string) ?? null,
    payload: JSON.parse(String(r.json)),
    attempts: Number(r.attempts ?? 0),
  }));
}

export async function removeOutbox(mutationIds: string[]) {
  if (!mutationIds.length) return;
  await exec(`DELETE FROM outbox WHERE mutationId IN (${mutationIds.map(() => '?').join(',')})`, mutationIds);
}

export async function bumpAttempts(mutationIds: string[]) {
  if (!mutationIds.length) return;
  await exec(`UPDATE outbox SET attempts = attempts + 1 WHERE mutationId IN (${mutationIds.map(() => '?').join(',')})`, mutationIds);
}

export async function outboxCount(): Promise<number> {
  const rows = await exec(`SELECT COUNT(*) AS c FROM outbox`);
  return Number(rows[0]?.c ?? 0);
}

export async function hasPendingFor(entity: string, refId: string): Promise<boolean> {
  const rows = await exec(`SELECT 1 FROM outbox WHERE entity = ? AND refId = ? LIMIT 1`, [entity, refId]);
  return rows.length > 0;
}

/* ---------- kv ---------- */
export async function kvGet<T>(k: string): Promise<T | null> {
  const rows = await exec(`SELECT v FROM kv WHERE k = ?`, [k]);
  return rows[0] ? (JSON.parse(String(rows[0].v)) as T) : null;
}

export async function kvSet(k: string, v: unknown) {
  await exec(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, [k, JSON.stringify(v)]);
}

export async function wipeAll() {
  await exec(`DELETE FROM records`);
  await exec(`DELETE FROM outbox`);
  await exec(`DELETE FROM kv`);
}

export const uid = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
