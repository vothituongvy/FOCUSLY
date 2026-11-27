/**
 * FOCUSLY Brain – xử lý văn bản tiếng Việt / tiếng Anh, không dùng thư viện ngoài.
 * - Tách câu, tách từ (giữ dấu tiếng Việt)
 * - Từ khoá / cụm khái niệm (RAKE: cụm từ nằm giữa các từ dừng)
 * - Tìm đoạn liên quan (BM25)
 * - Tóm tắt trích xuất (TextRank)
 */

const VI_STOP = `và là của các những một có được cho với trong này đó khi thì mà để từ theo như đã đang sẽ không cũng rất nhiều ra vào lên nên nếu hay hoặc vì do bởi tại về trên dưới sau trước giữa
cái việc sự nó họ chúng ta tôi bạn mình em anh chị ở đây kia nào gì sao bao đâu ai lại còn chỉ đều mỗi từng cả hết vẫn đến tới qua bị phải cần muốn thể thế nhưng tuy dù rằng
diễn xảy nhờ giúp làm khoảng chủ_yếu thường_được bằng
nhau gồm có_thể được_gọi là_một các_loại loại số nhiều_hơn hơn nhất rồi vậy thôi ạ nhé nhỉ à ừ ồ chứ đấy ấy này_nọ những_gì một_số khác nữa luôn thường hãy chưa đều vừa mới
the a an and or of to in on at for with by from as is are was were be been being this that these those it its they them their he she his her we our you your i my me
not no but if then than so such can could may might will would shall should do does did have has had which who whom whose what when where why how all any some more most other into over under about also only just very`
  .split(/\s+/)
  .map((w) => w.replace(/_/g, ' '))
  .filter(Boolean);
const STOP = new Set(VI_STOP);

/** Chuẩn hoá Unicode (NFC) để chữ có dấu so khớp đúng */
export const nfc = (s: string) => s.normalize('NFC');

/** Bỏ dấu tiếng Việt – dùng khi so khớp lỏng (người dùng gõ không dấu) */
export const fold = (s: string) =>
  nfc(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export function words(s: string): string[] {
  return nfc(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

export const isStop = (w: string) => STOP.has(w) || /^\d{1,2}$/.test(w);

/** Từ có nghĩa (bỏ từ dừng) – dùng làm "term" cho tìm kiếm và so sánh câu */
export function terms(s: string): string[] {
  return words(s).filter((w) => !isStop(w) && w.length > 1);
}

/** Tách câu: theo dấu câu kết thúc và xuống dòng; bỏ câu quá ngắn / quá dài */
export function sentences(text: string, min = 25, max = 400): string[] {
  const out: string[] = [];
  for (const block of nfc(text).split(/\n+/)) {
    const b = block.replace(/\s+/g, ' ').trim();
    if (!b) continue;
    // tách sau . ! ? … ; nếu theo sau là khoảng trắng + chữ in hoa / số / dấu mở
    const parts = b.split(/(?<=[.!?…])\s+(?=[\p{Lu}\d"“(\[])/u);
    for (const p of parts) {
      const s = p.trim().replace(/^[-•*–\d.)\s]+(?=\p{L})/u, '');
      if (s.length >= min && s.length <= max) out.push(s);
      else if (s.length > max) {
        // câu quá dài: cắt theo dấu chấm phẩy
        for (const q of s.split(/;\s+/)) if (q.length >= min && q.length <= max) out.push(q.trim());
      }
    }
  }
  return out;
}

/* ---------------- Cụm khái niệm (RAKE) ---------------- */
export interface Phrase {
  text: string; // dạng hiển thị (giữ hoa/thường như trong văn bản)
  key: string; // dạng chữ thường để so khớp
  score: number;
  freq: number;
  words: number;
}

export function keyphrases(text: string, limit = 30): Phrase[] {
  const freq = new Map<string, number>();
  const degree = new Map<string, number>();
  const cands = new Map<string, { text: string; count: number; ws: string[] }>();

  for (const sent of sentences(text, 10, 600)) {
    // giữ token gốc để lấy dạng hiển thị
    const toks = nfc(sent).match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu) ?? [];
    let run: string[] = [];
    const flush = () => {
      if (run.length >= 1 && run.length <= 4) {
        const ws = run.map((t) => t.toLowerCase());
        if (!(ws.length === 1 && ws[0].length < 3)) {
          const key = ws.join(' ');
          const c = cands.get(key) ?? { text: run.join(' '), count: 0, ws };
          c.count++;
          cands.set(key, c);
          for (const w of ws) {
            freq.set(w, (freq.get(w) ?? 0) + 1);
            degree.set(w, (degree.get(w) ?? 0) + ws.length - 1);
          }
        }
      }
      run = [];
    };
    for (const t of toks) {
      const low = t.toLowerCase();
      if (/^[\p{L}\p{N}]+$/u.test(t) && !isStop(low) && !/^\d+$/.test(low)) run.push(t);
      else flush();
    }
    flush();
  }

  const scored: Phrase[] = [...cands.entries()].map(([key, c]) => {
    const s = c.ws.reduce((a, w) => a + ((degree.get(w) ?? 0) + (freq.get(w) ?? 1)) / (freq.get(w) ?? 1), 0);
    // cụm lặp lại nhiều lần và cụm 2–3 từ (tiếng Việt: 1 từ thường gồm 2 tiếng) được ưu tiên
    const lenBonus = c.ws.length === 2 || c.ws.length === 3 ? 1.4 : c.ws.length === 1 ? 0.7 : 1;
    return { text: c.text, key, score: s * Math.log2(1 + c.count) * lenBonus, freq: c.count, words: c.ws.length };
  });

  // bỏ cụm nằm gọn trong cụm điểm cao hơn
  scored.sort((a, b) => b.score - a.score);
  const kept: Phrase[] = [];
  for (const p of scored) {
    if (kept.some((k) => k.key.includes(p.key) && k.score >= p.score)) continue;
    kept.push(p);
    if (kept.length >= limit) break;
  }
  return kept;
}

/* ---------------- Tìm kiếm BM25 ---------------- */
export interface Doc {
  id: string;
  text: string;
  source?: string;
}

export function bm25(docs: Doc[], query: string, k1 = 1.4, b = 0.75): { doc: Doc; score: number }[] {
  const q = [...new Set(terms(query))];
  const qFold = q.map(fold);
  if (!q.length || !docs.length) return [];
  const toks = docs.map((d) => terms(d.text).map(fold));
  const avgLen = toks.reduce((a, t) => a + t.length, 0) / toks.length || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  return docs
    .map((doc, i) => {
      const t = toks[i];
      const tf = new Map<string, number>();
      for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
      let score = 0;
      for (const w of qFold) {
        const f = tf.get(w) ?? 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avgLen));
      }
      // thưởng khi cụm câu hỏi xuất hiện nguyên vẹn (VD "quang hợp")
      const phrase = fold(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (phrase.length > 3 && fold(doc.text).includes(phrase)) score *= 1.5;
      return { doc, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score);
}

/* ---------------- Tóm tắt TextRank ---------------- */
export function summarize(text: string, count = 6): string[] {
  const sents = sentences(text, 40, 320);
  if (sents.length <= count) return sents;
  const pool = sents.slice(0, 400); // giới hạn để chạy nhanh
  const T = pool.map((s) => new Set(terms(s)));
  const n = pool.length;
  const W: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let common = 0;
      for (const w of T[i]) if (T[j].has(w)) common++;
      if (!common) continue;
      const w = common / (Math.log(T[i].size + 1) + Math.log(T[j].size + 1));
      W[i][j] = W[j][i] = w;
    }
  const out = W.map((r) => r.reduce((a, x) => a + x, 0) || 1);
  let score = new Array(n).fill(1 / n);
  for (let it = 0; it < 30; it++) {
    const next = new Array(n).fill((1 - 0.85) / n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (W[j][i]) next[i] += (0.85 * W[j][i] * score[j]) / out[j];
    score = next;
  }
  // câu đầu tài liệu thường là câu mở bài -> cộng nhẹ
  const ranked = pool.map((s, i) => ({ s, i, v: score[i] * (i < 3 ? 1.15 : 1) })).sort((a, b) => b.v - a.v);
  const picked: typeof ranked = [];
  for (const r of ranked) {
    // tránh 2 câu gần như trùng ý
    if (picked.some((p) => overlap(T[p.i], T[r.i]) > 0.6)) continue;
    picked.push(r);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a.i - b.i).map((p) => p.s);
}

export function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let c = 0;
  for (const w of a) if (b.has(w)) c++;
  return c / Math.min(a.size, b.size);
}

/** Tìm vị trí cụm trong câu, không phân biệt hoa thường, chỉ khớp trọn từ */
export function findPhrase(sentence: string, phrase: string): { start: number; end: number } | null {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const m = new RegExp(`(^|[^\\p{L}\\p{N}])(${esc})(?=$|[^\\p{L}\\p{N}])`, 'iu').exec(nfc(sentence));
  if (!m) return null;
  const start = m.index + m[1].length;
  return { start, end: start + m[2].length };
}

/** Câu có phải tiếng Việt không (dựa vào chữ có dấu) */
export const isVietnamese = (s: string) => /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(s);

/** Trộn mảng (Fisher–Yates) với bộ sinh số ngẫu nhiên có hạt giống → cùng tài liệu cho kết quả ổn định */
export function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
