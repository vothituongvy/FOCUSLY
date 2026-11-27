import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { unzip } from './officeText';

/**
 * Đọc bộ thẻ Anki (.apkg) – file ZIP chứa CSDL SQLite (collection.anki2 / anki21 / anki21b nén zstd).
 * Dùng SQLite có sẵn trong Node (node:sqlite, Node ≥ 22.13) nên không cần thư viện ngoài.
 */
export interface AnkiCard {
  front: string;
  back: string;
}

const MAX_CARDS = 3000;

export function cleanAnkiField(html: string): string {
  return html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>|<\/div>|<\/p>|<\/li>/gi, '\n')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\{\{c\d+::(.*?)(::[^}]*)?\}\}/g, '$1') // cloze -> chữ gốc
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Thẻ từ danh sách trường của note (trường 1 = mặt trước, trường 2 = mặt sau; cloze -> che chỗ trống) */
export function noteToCard(fields: string[]): AnkiCard | null {
  const raw0 = fields[0] ?? '';
  if (/\{\{c\d+::/.test(raw0)) {
    const front = cleanAnkiField(raw0.replace(/\{\{c\d+::(.*?)(::([^}]*))?\}\}/g, (_m, _a, _h, hint) => `[${hint || '…'}]`));
    const back = cleanAnkiField(raw0);
    return front && back ? { front: front.slice(0, 2000), back: back.slice(0, 4000) } : null;
  }
  const front = cleanAnkiField(raw0);
  const back = cleanAnkiField(fields.slice(1).filter((f) => cleanAnkiField(f)).join('\n'));
  if (!front || !back) return null;
  return { front: front.slice(0, 2000), back: back.slice(0, 4000) };
}

type SqliteDb = { prepare: (sql: string) => { all: () => unknown[] }; close: () => void };

function openSqlite(file: string): SqliteDb {
  let mod: { DatabaseSync: new (p: string, o?: unknown) => SqliteDb };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('node:sqlite');
  } catch {
    throw new Error('Máy chủ chưa hỗ trợ đọc file Anki (cần Node ≥ 22.13). Hãy xuất từ Anki dạng “Notes in Plain Text (.txt)” rồi nhập file đó.');
  }
  return new mod.DatabaseSync(file, { readOnly: true });
}

export function parseApkg(buf: Buffer): AnkiCard[] {
  const files = unzip(buf, (n) => /^collection\.anki2(1b?)?$/.test(n));
  let db: Buffer | undefined;
  const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;
  if (files.has('collection.anki21b') && zstd) db = zstd(files.get('collection.anki21b')!);
  db ??= files.get('collection.anki21') ?? files.get('collection.anki2');
  if (!db) throw new Error('File .apkg không hợp lệ (không thấy dữ liệu thẻ).');

  const tmp = path.join(os.tmpdir(), `anki-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  fs.writeFileSync(tmp, db);
  try {
    const sql = openSqlite(tmp);
    try {
      const rows = sql.prepare('SELECT flds FROM notes').all() as { flds: string }[];
      const cards: AnkiCard[] = [];
      for (const r of rows) {
        const c = noteToCard(String(r.flds ?? '').split('\x1f'));
        if (c) cards.push(c);
        if (cards.length >= MAX_CARDS) break;
      }
      // bản xuất mới chỉ để lại 1 thẻ nhắc "cập nhật Anki" trong collection.anki2
      if (cards.length <= 1 && /update|cập nhật/i.test(cards[0]?.front ?? '') && files.has('collection.anki21b')) {
        throw new Error('File Anki dùng định dạng mới. Khi xuất trong Anki, hãy tick “Support older Anki versions” (Hỗ trợ bản Anki cũ) rồi thử lại.');
      }
      return cards;
    } finally {
      sql.close();
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
