/**
 * FOCUSLY Brain – THƯ VIỆN KIẾN THỨC CHUNG.
 *
 * Máy chủ tự xây thư viện từ Wikipedia (chạy nền, rất nhẹ):
 *  1. Bắt đầu từ các chủ đề hạt giống trong topics.ts (~350 chủ đề, 14 môn).
 *  2. Mỗi bài tải về, Brain lấy thêm các bài LIÊN QUAN được bài đó liên kết tới (đọc lan 2 tầng) –
 *     giống cách một người học mở rộng kiến thức từ một khái niệm sang các khái niệm xung quanh.
 *  3. Dừng ở BRAIN_KNOWLEDGE_MAX bài (mặc định 2000 – vừa RAM 512 MB của Render miễn phí) để vừa gói MongoDB Atlas miễn phí.
 *
 * Tra cứu: chỉ mục BM25 theo từng ĐOẠN (~600 ký tự) dựng sẵn trong bộ nhớ – nhẹ, tra trong vài mili-giây.
 */
import { Schema, model } from 'mongoose';
import { bm25, expandQuery, fold, sentences, terms } from './text';
import { fetchLinks, lookup } from './wiki';
import { allTopics } from './topics';

const knowledgeSchema = new Schema(
  {
    topic: { type: String, required: true, unique: true }, // từ khoá dùng để tìm (chủ đề hạt giống hoặc tên bài liên kết)
    subject: { type: String, default: '' },
    title: { type: String, default: '' },
    lang: { type: String, default: 'vi' },
    url: { type: String, default: '' },
    text: { type: String, default: '' },
    links: { type: [String], default: [] }, // bài liên quan (để đọc lan tiếp)
    depth: { type: Number, default: 0 }, // 0 = hạt giống, 1–2 = bài liên quan
    failed: { type: Boolean, default: false },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
knowledgeSchema.index({ title: 1 });
export const KnowledgeModel = model('KnowledgeDoc', knowledgeSchema);

const MAX_CHARS = 12_000; // đoạn đầu bài – phần định nghĩa và nội dung chính
const MAX_ARTICLES = Math.max(100, Number(process.env.BRAIN_KNOWLEDGE_MAX ?? 2000));
const MAX_DEPTH = 2;
const LINKS_PER_ARTICLE = 25;

/* ---------------- Chỉ mục BM25 theo đoạn ---------------- */
interface Chunk {
  text: string;
  article: number;
}

class SearchIndex {
  chunks: Chunk[] = [];
  postings = new Map<string, number[]>();
  tfs = new Map<string, number[]>();
  lengths: number[] = [];
  avgLen = 1;
  articles: { id: string; title: string; url: string; subject: string; key: string }[] = [];

  build(docs: { id: string; title: string; url: string; subject: string; text: string }[]) {
    const post = new Map<string, number[]>();
    const tfs = new Map<string, number[]>();
    this.chunks = [];
    this.lengths = [];
    this.articles = docs.map((d) => ({ id: d.id, title: d.title, url: d.url, subject: d.subject, key: fold(d.title) }));
    const titleTerms = docs.map((d) => terms(d.title).map(fold));
    docs.forEach((d, a) => {
      // gom câu thành đoạn ~600 ký tự
      let buf: string[] = [];
      let len = 0;
      const flush = () => {
        if (!buf.length) return;
        const i = this.chunks.length;
        const text = buf.join(' ');
        this.chunks.push({ text, article: a });
        const tf = new Map<string, number>();
        const ts = terms(text).map(fold);
        ts.forEach((w) => tf.set(w, (tf.get(w) ?? 0) + 1));
        for (const w of titleTerms[a]) tf.set(w, (tf.get(w) ?? 0) + 2); // ưu tiên bài đúng chủ đề
        this.lengths.push(ts.length);
        for (const [w, n] of tf) {
          (post.get(w) ?? post.set(w, []).get(w)!).push(i);
          (tfs.get(w) ?? tfs.set(w, []).get(w)!).push(n);
        }
        buf = [];
        len = 0;
      };
      for (const s of sentences(d.text, 25, 500)) {
        buf.push(s);
        len += s.length;
        if (len >= 600) flush();
      }
      flush();
    });
    this.postings = post;
    this.tfs = tfs;
    this.avgLen = this.lengths.reduce((x, y) => x + y, 0) / (this.lengths.length || 1) || 1;
  }

  search(query: string, k = 5): { chunk: Chunk; score: number }[] {
    const q = [...new Set(terms(expandQuery(query)).map(fold))];
    const N = this.chunks.length;
    if (!q.length || !N) return [];
    const scores = new Map<number, number>();
    for (const w of q) {
      const list = this.postings.get(w);
      const tf = this.tfs.get(w);
      if (!list || !tf) continue;
      const idf = Math.log(1 + (N - list.length + 0.5) / (list.length + 0.5));
      for (let j = 0; j < list.length; j++) {
        const i = list[j];
        const s = (idf * tf[j] * 2.4) / (tf[j] + 1.4 * (0.25 + (0.75 * this.lengths[i]) / this.avgLen));
        scores.set(i, (scores.get(i) ?? 0) + s);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([i, score]) => ({ chunk: this.chunks[i], score }));
  }
}

const index = new SearchIndex();
let dirty = true;
let lastBuild = 0;
let building: Promise<void> | null = null;

async function ensureIndex() {
  // dựng lại tối đa 10 phút/lần khi thư viện đang lớn dần
  if (!dirty && lastBuild) return;
  if (lastBuild && Date.now() - lastBuild < 10 * 60_000 && index.chunks.length) return;
  if (building) return building;
  building = (async () => {
    const docs = await KnowledgeModel.find({ failed: false, text: { $ne: '' } }).select('title url subject text').lean();
    index.build(docs.map((d) => ({ id: String(d._id), title: d.title ?? '', url: d.url ?? '', subject: d.subject ?? '', text: d.text ?? '' })));
    lastBuild = Date.now();
    dirty = false;
  })().finally(() => {
    building = null;
  });
  return building;
}

export interface KnowledgeHit {
  title: string;
  url: string;
  subject: string;
  /** các câu sát câu hỏi nhất trong đoạn tìm được */
  sentences: string[];
  score: number;
}

/** Tìm trong thư viện: trả về các đoạn tốt nhất, mỗi đoạn rút gọn còn vài câu sát câu hỏi */
export async function searchKnowledge(query: string, k = 4): Promise<KnowledgeHit[]> {
  await ensureIndex().catch(() => undefined);
  return index.search(query, k).map(({ chunk, score }) => {
    const art = index.articles[chunk.article];
    const sents = sentences(chunk.text, 20, 500);
    const ranked = bm25(sents.map((s, i) => ({ id: String(i), text: s })), query).slice(0, 2).map((h) => Number(h.doc.id));
    const pick = (ranked.length ? ranked : [0]).sort((a, b) => a - b).map((i) => sents[i]).filter(Boolean);
    return { title: art.title, url: art.url, subject: art.subject, sentences: pick, score };
  });
}

/** Bài trong thư viện khớp nhất với một chủ đề (nội dung đầy đủ lấy từ database) */
export async function knowledgeArticle(topic: string): Promise<{ title: string; url: string; text: string } | null> {
  await ensureIndex().catch(() => undefined);
  const key = fold(topic).trim();
  if (!key) return null;
  let art = index.articles.find((a) => a.key === key) ?? index.articles.find((a) => a.key.startsWith(`${key} (`));
  if (!art) {
    const hit = index.search(topic, 1)[0];
    if (hit && hit.score > 4) art = index.articles[hit.chunk.article];
  }
  if (!art) return null;
  const doc = await KnowledgeModel.findById(art.id).select('title url text').lean();
  return doc ? { title: doc.title ?? '', url: doc.url ?? '', text: doc.text ?? '' } : null;
}

export async function knowledgeStats() {
  const [articles, bySubject] = await Promise.all([
    KnowledgeModel.countDocuments({ failed: false }),
    KnowledgeModel.aggregate<{ _id: string; n: number }>([{ $match: { failed: false } }, { $group: { _id: '$subject', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  return { articles, max: MAX_ARTICLES, subjects: bySubject.map((s) => ({ subject: s._id, articles: s.n })), chunks: index.chunks.length };
}

/* ---------------- Tự xây và tự mở rộng thư viện (chạy nền) ---------------- */
let started = false;
let running = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Bỏ các bài không mang kiến thức học tập: năm, ngày, danh sách, trang định hướng… */
const SKIP = /^(\d{1,4}( TCN)?|Năm \d+|Tháng \d+|\d+ tháng \d+|Danh sách|List of|Thể loại|Bản mẫu|Wikipedia|Tập tin|Trợ giúp|ISBN|Thế kỷ \d+|.*\(định hướng\))$/i;

export function startKnowledgeBuilder() {
  if (started || (process.env.BRAIN_KNOWLEDGE ?? 'on').toLowerCase() === 'off') return;
  started = true;
  const run = () => void buildMissing().catch((e) => console.warn('[brain] thư viện kiến thức:', (e as Error).message));
  setTimeout(run, 20_000);
  // mỗi 6 giờ kiểm tra chủ đề mới (BRAIN_EXTRA_TOPICS) và đọc lan tiếp nếu chưa đủ
  setInterval(run, 6 * 3600_000).unref();
}

export async function buildMissing(log = (m: string) => console.log(m)) {
  if (running) return;
  running = true;
  try {
    const existing = await KnowledgeModel.find({}).select('topic title failed fetchedAt links depth subject').lean();
    const seen = new Set<string>();
    existing.forEach((d) => {
      seen.add(fold(d.topic));
      if (d.title) seen.add(fold(d.title));
    });
    let count = existing.filter((d) => !d.failed).length;
    const retryBefore = Date.now() - 7 * 86_400_000;

    // hàng đợi: hạt giống còn thiếu trước, rồi các bài liên quan của bài đã có (theo tầng)
    const queue: { topic: string; subject: string; depth: number }[] = [];
    for (const t of allTopics()) {
      const d = existing.find((x) => x.topic === t.topic);
      if (!d || (d.failed && new Date(d.fetchedAt).getTime() < retryBefore)) queue.push({ ...t, depth: 0 });
    }
    for (const d of existing.filter((x) => !x.failed && (x.depth ?? 0) < MAX_DEPTH).sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))) {
      for (const l of d.links ?? []) if (!seen.has(fold(l))) queue.push({ topic: l, subject: d.subject ?? '', depth: (d.depth ?? 0) + 1 });
    }
    if (!queue.length || count >= MAX_ARTICLES) return;
    log(`[brain] Thư viện kiến thức: ${count} bài, đang mở rộng (tối đa ${MAX_ARTICLES})…`);

    let added = 0;
    while (queue.length && count < MAX_ARTICLES) {
      const t = queue.shift()!;
      const key = fold(t.topic);
      if (t.depth > 0 && (seen.has(key) || SKIP.test(t.topic))) continue;
      seen.add(key);
      const a = await lookup(t.topic, 'vi').catch(() => null);
      if (a && seen.has(fold(a.title)) && t.depth > 0) continue; // trùng bài đã có (chuyển hướng)
      let links: string[] = [];
      if (a && t.depth < MAX_DEPTH) {
        links = (await fetchLinks(a.title, a.lang, a.text).catch(() => [] as string[])).filter((l) => !SKIP.test(l)).slice(0, LINKS_PER_ARTICLE);
        await sleep(400);
      }
      await KnowledgeModel.updateOne(
        { topic: t.topic },
        a
          ? { $set: { subject: t.subject, title: a.title, lang: a.lang, url: a.url, text: a.text.slice(0, MAX_CHARS), links, depth: t.depth, failed: false, fetchedAt: new Date() } }
          : { $set: { subject: t.subject, depth: t.depth, failed: true, fetchedAt: new Date() } },
        { upsert: true },
      );
      if (a) {
        seen.add(fold(a.title));
        count++;
        added++;
        for (const l of links) if (!seen.has(fold(l))) queue.push({ topic: l, subject: t.subject, depth: t.depth + 1 });
        if (added % 50 === 0) {
          dirty = true;
          log(`[brain] … thư viện có ${count} bài`);
        }
      }
      await sleep(1000);
    }
    dirty = true;
    log(`[brain] Thư viện kiến thức: thêm ${added} bài, tổng ${count} bài.`);
  } finally {
    running = false;
  }
}

/* ---------------- Học từ câu hỏi ----------------
 * Bài Wikipedia nào phải tra trực tiếp (chưa có trong thư viện) sẽ được lưu lại -> lần sau trả lời ngay.
 * Thư viện vượt giới hạn thì bỏ bớt bài "học từ câu hỏi" cũ nhất (không đụng tới bài hạt giống).
 */
export const LEARNED_SUBJECT = 'Học từ câu hỏi';

export async function learnArticle(a: { title: string; lang: string; url: string; text: string }) {
  if ((process.env.BRAIN_KNOWLEDGE ?? 'on').toLowerCase() === 'off') return;
  const exists = await KnowledgeModel.exists({ $or: [{ title: a.title }, { topic: a.title }] });
  if (exists) return;
  await KnowledgeModel.updateOne(
    { topic: a.title },
    { $set: { subject: LEARNED_SUBJECT, title: a.title, lang: a.lang, url: a.url, text: a.text.slice(0, MAX_CHARS), links: [], depth: MAX_DEPTH + 1, failed: false, fetchedAt: new Date() } },
    { upsert: true },
  );
  const total = await KnowledgeModel.countDocuments({ failed: false });
  if (total > MAX_ARTICLES) {
    const old = await KnowledgeModel.find({ subject: LEARNED_SUBJECT }).sort({ fetchedAt: 1 }).limit(total - MAX_ARTICLES).select('_id').lean();
    if (old.length) await KnowledgeModel.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
  dirty = true;
}
