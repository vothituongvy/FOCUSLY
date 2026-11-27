/**
 * FOCUSLY Brain – tự soạn flashcard, câu hỏi, tóm tắt, giải thích từ nội dung tài liệu.
 * Không dùng mô hình ngôn ngữ: dựa vào cấu trúc câu (định nghĩa "X là Y"), cụm khái niệm quan trọng
 * và kỹ thuật điền khuyết (cloze) – cách các giáo viên thường dùng để ra đề từ giáo trình.
 */
import { findPhrase, isVietnamese, keyphrases, nfc, overlap, type Phrase, seeded, sentences, shuffle, summarize, terms } from './text';

export interface Card {
  front: string;
  back: string;
  hint?: string;
}

export type QType = 'mcq' | 'multi' | 'true_false' | 'short';
export interface Question {
  type: QType;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  correctIndexes: number[];
  correctBoolean: boolean | null;
  acceptedAnswers: string[];
  explanation: string;
}

const BLANK = '_____';

/* ---------------- Định nghĩa: "X là Y", "X: Y", "X is Y" ---------------- */
const DEF_VI = /^(.{2,70}?)\s+(?:là|được gọi là|được định nghĩa là|có nghĩa là|nghĩa là|chính là|được hiểu là|gồm|bao gồm)\s+(.{8,})$/u;
const DEF_EN = /^(.{2,70}?)\s+(?:is|are|refers to|means|is defined as|is called|consists of)\s+(.{8,})$/iu;
const DEF_COLON = /^([^:]{2,60}):\s+(.{8,})$/u;

export interface Definition {
  term: string;
  definition: string;
  sentence: string;
  /** câu hỏi mặt trước tự nhiên: "X là gì?" hoặc "X: …" */
  ask: string;
}

export function definitions(text: string): Definition[] {
  const out: Definition[] = [];
  const seen = new Set<string>();
  for (const s of sentences(text, 15, 320)) {
    const colon = DEF_COLON.exec(s);
    const m = colon ?? DEF_VI.exec(s) ?? DEF_EN.exec(s);
    if (!m) continue;
    const en = !colon && !DEF_VI.exec(s);
    let term = m[1].trim().replace(/^(?:\d+[.)]\s*|[-•*]\s*)/, '');
    // chủ ngữ quá dài hoặc bắt đầu bằng đại từ -> không phải định nghĩa
    if (term.split(/\s+/).length > 7 || /^(nó|đây|điều này|this|it|that|they)\b/i.test(term)) continue;
    term = term.replace(/^(?:khái niệm|thuật ngữ|the term)\s+/i, '');
    const definition = m[2].trim().replace(/[.;]+$/, '');
    const key = term.toLowerCase();
    if (seen.has(key) || definition.length < 8) continue;
    seen.add(key);
    // "Quang hợp gồm hai pha: ..." -> hỏi "Quang hợp gồm hai pha: …?"; "X là Y" -> "X là gì?"
    const ask = colon ? `${term}: …?` : en ? `What is ${term}?` : `${term} là gì?`;
    out.push({ term, definition, sentence: s, ask });
  }
  return out;
}

/** Câu tiêu biểu chứa cụm khái niệm (ưu tiên câu vừa đủ dài, nằm sớm trong tài liệu) */
function bestSentenceFor(p: Phrase, sents: string[], used: Set<string>): string | null {
  let best: string | null = null;
  let bestScore = -1;
  sents.forEach((s, i) => {
    if (used.has(s) || !findPhrase(s, p.key)) return;
    const len = s.length;
    const score = (len >= 50 && len <= 220 ? 2 : 1) + 1 / (1 + i / 20) + terms(s).length / 30;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  });
  return best;
}

const blankOut = (s: string, phrase: string) => {
  const r = findPhrase(s, phrase);
  return r ? s.slice(0, r.start) + BLANK + s.slice(r.end) : null;
};

/* ---------------- Flashcard ---------------- */
export function makeFlashcards(text: string, count = 15, title = ''): { title: string; cards: Card[] } {
  const vi = isVietnamese(text);
  const cards: Card[] = [];
  const fronts = new Set<string>();
  const push = (c: Card) => {
    const k = c.front.toLowerCase();
    if (fronts.has(k) || cards.length >= count) return;
    fronts.add(k);
    cards.push(c);
  };

  // 1) thẻ định nghĩa – chất lượng tốt nhất
  for (const d of definitions(text)) push({ front: d.ask, back: cap(d.definition) });

  // 2) thẻ điền khuyết theo cụm khái niệm quan trọng
  const sents = sentences(text, 40, 260);
  const used = new Set<string>();
  for (const p of keyphrases(text, count * 3)) {
    if (cards.length >= count) break;
    if (p.words === 1 && p.freq < 2) continue;
    const s = bestSentenceFor(p, sents, used);
    if (!s) continue;
    const q = blankOut(s, p.key);
    if (!q) continue;
    used.add(s);
    push({ front: q, back: p.text, hint: vi ? `${p.words} từ` : `${p.words} word(s)` });
  }
  return { title: title || (vi ? 'Thẻ ghi nhớ' : 'Flashcards'), cards };
}

/* ---------------- Câu hỏi ---------------- */
/** Đáp án nhiễu: cụm khái niệm khác cùng độ dài, không xuất hiện trong câu */
function distractors(answer: Phrase, pool: Phrase[], sentence: string, rnd: () => number, n = 3): string[] {
  const low = sentence.toLowerCase();
  const cands = pool.filter((p) => p.key !== answer.key && !low.includes(p.key) && !p.key.includes(answer.key) && !answer.key.includes(p.key));
  const near = cands.filter((p) => Math.abs(p.words - answer.words) <= 1);
  const list = shuffle(near.length >= n ? near : cands, rnd).slice(0, n);
  return list.map((p) => p.text);
}

/** Đổi một cụm khái niệm trong câu bằng cụm khác -> phát biểu SAI */
function falsify(s: string, pool: Phrase[], rnd: () => number): string | null {
  // chỉ đổi những cụm "giống khái niệm" (lặp lại ≥ 2 lần hoặc gồm ≥ 2 từ) và đổi sang cụm CÙNG số từ để câu vẫn tự nhiên
  const solid = pool.filter((p) => p.freq >= 2 || p.words >= 2);
  const inside = solid.filter((p) => findPhrase(s, p.key));
  for (const p of shuffle(inside, rnd)) {
    const other = shuffle(
      solid.filter((q) => q.key !== p.key && q.words === p.words && !s.toLowerCase().includes(q.key) && !q.key.includes(p.key) && !p.key.includes(q.key)),
      rnd,
    )[0];
    if (!other) continue;
    const r = findPhrase(s, p.key)!;
    const text = r.start === 0 ? cap(other.text) : other.text.toLowerCase() === other.text ? other.text : other.text[0].toLowerCase() + other.text.slice(1);
    return s.slice(0, r.start) + text + s.slice(r.end);
  }
  // không có cụm để đổi: đảo khẳng định/phủ định
  if (/\bkhông\b/u.test(s)) return s.replace(/\bkhông\s+/u, '');
  if (/\b(là|có)\b/u.test(s)) return s.replace(/\b(là|có)\b/u, 'không $1');
  return null;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clip = (s: string, n = 180) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export function makeQuiz(text: string, count = 10, types: readonly QType[] = ['mcq', 'multi', 'true_false', 'short'], title = ''): { title: string; questions: Question[] } {
  const vi = isVietnamese(text);
  const rnd = seeded(text.slice(0, 2000) + count);
  const pool = keyphrases(text, 60).filter((p) => p.text.length <= 60);
  const sents = sentences(text, 40, 260);
  const used = new Set<string>();
  const questions: Question[] = [];
  const base = { options: [] as string[], correctIndex: null, correctIndexes: [] as number[], correctBoolean: null, acceptedAnswers: [] as string[] };

  // chia đều các loại câu theo yêu cầu
  const plan: QType[] = [];
  const weights: Record<QType, number> = { mcq: 4, true_false: 3, short: 2, multi: 1 };
  const allowed = types.filter((t) => weights[t]);
  while (plan.length < count * 2 && allowed.length) for (const t of allowed) for (let i = 0; i < weights[t]; i++) plan.push(t);
  const order = shuffle(plan, rnd);

  const defs = definitions(text);
  let pi = 0;
  for (const type of order) {
    if (questions.length >= count) break;
    if (type === 'mcq') {
      // ưu tiên định nghĩa: "X là gì?" với 4 lựa chọn là các định nghĩa
      const d = defs.find((x) => !used.has(x.sentence));
      if (d && defs.length >= 4) {
        used.add(d.sentence);
        const wrong = shuffle(defs.filter((x) => x !== d), rnd).slice(0, 3).map((x) => clip(cap(x.definition), 140));
        const options = shuffle([clip(cap(d.definition), 140), ...wrong], rnd);
        questions.push({ ...base, type: 'mcq', prompt: d.ask, options, correctIndex: options.indexOf(clip(cap(d.definition), 140)), explanation: d.sentence });
        continue;
      }
    }
    // tìm cụm khái niệm tiếp theo có câu phù hợp
    let p: Phrase | undefined;
    let s: string | null = null;
    while (pi < pool.length && !s) {
      p = pool[pi++];
      s = bestSentenceFor(p, sents, used);
    }
    if (!p || !s) break;
    used.add(s);
    const cloze = blankOut(s, p.key)!;

    if (type === 'mcq') {
      const wrong = distractors(p, pool, s, rnd);
      if (wrong.length < 2) continue;
      const options = shuffle([p.text, ...wrong], rnd);
      questions.push({ ...base, type: 'mcq', prompt: vi ? `Điền vào chỗ trống: ${cloze}` : `Fill in the blank: ${cloze}`, options, correctIndex: options.indexOf(p.text), explanation: s });
    } else if (type === 'short') {
      questions.push({ ...base, type: 'short', prompt: vi ? `Điền từ còn thiếu: ${cloze}` : `Fill in the missing words: ${cloze}`, acceptedAnswers: [p.text], explanation: s });
    } else if (type === 'true_false') {
      const makeFalse = rnd() < 0.5;
      const f = makeFalse ? falsify(s, pool, rnd) : null;
      if (makeFalse && f) questions.push({ ...base, type: 'true_false', prompt: f, correctBoolean: false, explanation: vi ? `Câu đúng: ${s}` : `Correct statement: ${s}` });
      else questions.push({ ...base, type: 'true_false', prompt: s, correctBoolean: true, explanation: vi ? 'Phát biểu này đúng theo tài liệu.' : 'This statement is true according to the material.' });
    } else if (type === 'multi') {
      // 2–3 phát biểu đúng + 1–2 phát biểu bị đổi khái niệm
      const trues = [s, ...shuffle(sents.filter((x) => !used.has(x) && x.length <= 200 && overlap(new Set(terms(x)), new Set(terms(s))) < 0.5), rnd).slice(0, 2)];
      const falses: string[] = [];
      for (const t of shuffle(sents.filter((x) => !trues.includes(x) && x.length <= 200), rnd)) {
        const f = falsify(t, pool, rnd);
        if (f) falses.push(f);
        if (falses.length >= 2) break;
      }
      if (trues.length < 2 || falses.length < 1) continue;
      trues.forEach((t) => used.add(t));
      const all = shuffle([...trues.map((t) => ({ t: clip(t), ok: true })), ...falses.map((t) => ({ t: clip(t), ok: false }))], rnd);
      questions.push({
        ...base,
        type: 'multi',
        prompt: vi ? 'Chọn TẤT CẢ các phát biểu đúng theo tài liệu:' : 'Select ALL statements that are true according to the material:',
        options: all.map((x) => x.t),
        correctIndexes: all.map((x, i) => (x.ok ? i : -1)).filter((i) => i >= 0),
        explanation: vi ? 'Các phát biểu sai đã bị thay đổi khái niệm so với tài liệu.' : 'The false statements had a key term swapped.',
      });
    }
  }
  return { title: title || (vi ? 'Bộ câu hỏi ôn tập' : 'Review quiz'), questions };
}

/* ---------------- Tóm tắt dạng Markdown ---------------- */
export function makeSummary(text: string, title: string, detailed = false): string {
  const vi = isVietnamese(text) || !/[a-z]/i.test(text);
  const main = summarize(text, detailed ? 10 : 5);
  const defs = definitions(text).slice(0, detailed ? 8 : 5);
  const keys = keyphrases(text, 12).filter((k) => !defs.some((d) => d.term.toLowerCase().includes(k.key)));
  const quiz = makeQuiz(text, 3, ['short'], title).questions;
  const L = vi
    ? { main: 'Ý chính', terms: 'Khái niệm quan trọng', keys: 'Từ khoá nổi bật', check: 'Câu hỏi tự kiểm tra', note: '_Tóm tắt trích từ nội dung tài liệu bởi FOCUSLY Brain._' }
    : { main: 'Key points', terms: 'Important concepts', keys: 'Key terms', check: 'Self-check questions', note: '_Extractive summary generated by FOCUSLY Brain._' };
  const lines = [`## ${L.main}`, ...main.map((s) => `- ${s}`)];
  if (defs.length) lines.push('', `## ${L.terms}`, ...defs.map((d) => `- **${d.term}**: ${clip(d.definition, 200)}`));
  if (keys.length) lines.push('', `## ${L.keys}`, keys.slice(0, 8).map((k) => k.text).join(' · '));
  if (quiz.length) lines.push('', `## ${L.check}`, ...quiz.map((q, i) => `${i + 1}. ${q.prompt.replace(/^.*?:\s*/, '')}`));
  lines.push('', L.note);
  return lines.join('\n');
}

/** Giải thích khái niệm: câu định nghĩa + các câu liên quan nhất trong tài liệu */
export function explainFromText(concept: string, text: string): string | null {
  const vi = isVietnamese(text) || isVietnamese(concept);
  const c = nfc(concept).trim().toLowerCase();
  const def = definitions(text).find((d) => d.term.toLowerCase() === c || d.term.toLowerCase().includes(c) || c.includes(d.term.toLowerCase()));
  const related = sentences(text, 30, 320)
    .filter((s) => s.toLowerCase().includes(c) && s !== def?.sentence)
    .slice(0, 4);
  if (!def && !related.length) return null;
  const lines: string[] = [];
  if (def) lines.push(vi ? `**${cap(def.term)}** là ${def.definition}.` : `**${cap(def.term)}**: ${def.definition}.`);
  if (related.length) lines.push('', vi ? '**Trong tài liệu còn nói:**' : '**The material also says:**', ...related.map((s) => `- ${s}`));
  lines.push('', vi ? '_Mẹo: thử tự diễn đạt lại bằng lời của bạn rồi so với tài liệu._' : '_Tip: rephrase it in your own words, then compare with the material._');
  return lines.join('\n');
}
