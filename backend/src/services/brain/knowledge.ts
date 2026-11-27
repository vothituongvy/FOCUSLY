/**
 * FOCUSLY Brain – THƯ VIỆN KIẾN THỨC CHUNG.
 * Vài trăm bài Wikipedia về các môn học (xem topics.ts) được máy chủ tự tải về MỘT LẦN và lưu trong database.
 * Khi trả lời, Brain tra thư viện này bằng chỉ mục BM25 trong bộ nhớ (vài mili-giây) trước khi phải gọi Wikipedia trực tiếp.
 */
import { Schema, model } from 'mongoose';
import { fold, sentences, terms } from './text';
import { lookup } from './wiki';
import { allTopics } from './topics';

const knowledgeSchema = new Schema(
  {
    topic: { type: String, required: true, unique: true },
    subject: { type: String, default: '' },
    title: { type: String, default: '' },
    lang: { type: String, default: 'vi' },
    url: { type: String, default: '' },
    text: { type: String, default: '' },
    failed: { type: Boolean, default: false },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
export const KnowledgeModel = model('KnowledgeDoc', knowledgeSchema);

const MAX_CHARS = 60_000;

/* ---------------- Chỉ mục BM25 dựng sẵn trong bộ nhớ ---------------- */
interface Entry {
  text: string;
  title: string;
  url: string;
  subject: string;
  article: number;
}

class SearchIndex {
  entries: Entry[] = [];
  postings = new Map<string, { i: number; tf: number }[]>();
  lengths: number[] = [];
  avgLen = 1;
  articles: { title: string; url: string; subject: string; text: string; key: string }[] = [];

  build(docs: { title: string; url: string; subject: string; text: string }[]) {
    this.entries = [];
    this.postings.clear();
    this.lengths = [];
    this.articles = docs.map((d) => ({ ...d, key: fold(d.title) }));
    docs.forEach((d, a) => {
      for (const s of sentences(d.text, 30, 420)) {
        const i = this.entries.length;
        this.entries.push({ text: s, title: d.title, url: d.url, subject: d.subject, article: a });
        const tf = new Map<string, number>();
        const ts = terms(s).map(fold);
        ts.forEach((w) => tf.set(w, (tf.get(w) ?? 0) + 1));
        // tiêu đề bài được tính như một phần của mọi câu trong bài -> câu hỏi về "X" ưu tiên bài X
        for (const w of terms(d.title).map(fold)) tf.set(w, (tf.get(w) ?? 0) + 1);
        this.lengths.push(ts.length);
        for (const [w, n] of tf) {
          const list = this.postings.get(w);
          if (list) list.push({ i, tf: n });
          else this.postings.set(w, [{ i, tf: n }]);
        }
      }
    });
    this.avgLen = this.lengths.reduce((a, x) => a + x, 0) / (this.lengths.length || 1) || 1;
  }

  search(query: string, k = 5): { entry: Entry; score: number }[] {
    const q = [...new Set(terms(query).map(fold))];
    const N = this.entries.length;
    if (!q.length || !N) return [];
    const scores = new Map<number, number>();
    for (const w of q) {
      const list = this.postings.get(w);
      if (!list) continue;
      const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5));
      for (const { i, tf } of list) {
        const s = (idf * tf * 2.4) / (tf + 1.4 * (0.25 + (0.75 * this.lengths[i]) / this.avgLen));
        scores.set(i, (scores.get(i) ?? 0) + s);
      }
    }
    const phrase = fold(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return [...scores.entries()]
      .map(([i, score]) => ({ entry: this.entries[i], score: phrase.length > 3 && fold(this.entries[i].text).includes(phrase) ? score * 1.5 : score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

const index = new SearchIndex();
let indexedAt = 0;
let dirty = true;
let building: Promise<void> | null = null;

async function ensureIndex() {
  if (!dirty && indexedAt) return;
  if (building) return building;
  building = (async () => {
    const docs = await KnowledgeModel.find({ failed: false, text: { $ne: '' } }).select('title url subject text').lean();
    index.build(docs.map((d) => ({ title: d.title ?? '', url: d.url ?? '', subject: d.subject ?? '', text: d.text ?? '' })));
    indexedAt = Date.now();
    dirty = false;
  })().finally(() => {
    building = null;
  });
  return building;
}

/** Tìm câu liên quan trong thư viện kiến thức chung */
export async function searchKnowledge(query: string, k = 5) {
  await ensureIndex().catch(() => undefined);
  return index.search(query, k);
}

/** Bài trong thư viện khớp nhất với một chủ đề (dùng để soạn câu hỏi / flashcard theo chủ đề) */
export async function knowledgeArticle(topic: string): Promise<{ title: string; url: string; text: string } | null> {
  await ensureIndex().catch(() => undefined);
  const key = fold(topic).trim();
  const exact = index.articles.find((a) => a.key === key) ?? index.articles.find((a) => a.key.startsWith(key) || key.startsWith(a.key));
  if (exact) return exact;
  const hit = index.search(topic, 1)[0];
  return hit && hit.score > 3 ? index.articles[hit.entry.article] : null;
}

export async function knowledgeStats() {
  const [articles, failed] = await Promise.all([KnowledgeModel.countDocuments({ failed: false }), KnowledgeModel.countDocuments({ failed: true })]);
  return { articles, failed, topics: allTopics().length, sentences: index.entries.length };
}

/* ---------------- Tự xây thư viện (chạy nền trên máy chủ) ---------------- */
let started = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tải các chủ đề còn thiếu từ Wikipedia, mỗi bài cách nhau ~1,5 giây (lịch sự với Wikipedia, không làm nặng máy chủ).
 * Chủ đề tải lỗi sẽ được thử lại sau 7 ngày. Tắt bằng BRAIN_KNOWLEDGE=off.
 */
export function startKnowledgeBuilder() {
  if (started || (process.env.BRAIN_KNOWLEDGE ?? 'on').toLowerCase() === 'off') return;
  started = true;
  setTimeout(() => void buildMissing().catch((e) => console.warn('[brain] thư viện kiến thức:', (e as Error).message)), 20_000);
}

export async function buildMissing(log = (m: string) => console.log(m)) {
  const topics = allTopics();
  const existing = await KnowledgeModel.find({}).select('topic failed fetchedAt').lean();
  const done = new Map(existing.map((d) => [d.topic, d]));
  const retryBefore = Date.now() - 7 * 86_400_000;
  const todo = topics.filter((t) => {
    const d = done.get(t.topic);
    return !d || (d.failed && new Date(d.fetchedAt).getTime() < retryBefore);
  });
  if (!todo.length) return;
  log(`[brain] Đang xây thư viện kiến thức: ${todo.length} chủ đề còn thiếu…`);
  let ok = 0;
  for (const [n, t] of todo.entries()) {
    const a = await lookup(t.topic, 'vi').catch(() => null);
    await KnowledgeModel.updateOne(
      { topic: t.topic },
      a
        ? { $set: { subject: t.subject, title: a.title, lang: a.lang, url: a.url, text: a.text.slice(0, MAX_CHARS), failed: false, fetchedAt: new Date() } }
        : { $set: { subject: t.subject, failed: true, fetchedAt: new Date() } },
      { upsert: true },
    );
    if (a) ok++;
    if ((n + 1) % 25 === 0) {
      dirty = true;
      log(`[brain] … ${n + 1}/${todo.length} chủ đề (${ok} bài)`);
    }
    await sleep(1500);
  }
  dirty = true;
  log(`[brain] Xong thư viện kiến thức: thêm ${ok}/${todo.length} bài.`);
}
