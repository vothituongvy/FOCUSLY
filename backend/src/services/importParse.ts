/**
 * Nhận dạng file đã SOẠN SẴN câu hỏi / flashcard để nhập thẳng, không cần AI.
 *
 * Flashcard – mỗi dòng một thẻ, mặt trước và mặt sau cách nhau bằng TAB (bảng Word/Excel), " | ", ";", " - ", " = " hoặc ":".
 *
 * Câu hỏi – dạng phổ biến:
 *   Câu 1: Thủ đô của Việt Nam là?
 *   A. Hà Nội
 *   B. Huế
 *   Đáp án: A            (nhiều đáp án: "Đáp án: A, C"; đúng/sai: "Đáp án: Đúng"; tự luận ngắn: "Đáp án: Hà Nội")
 *   Giải thích: ...      (không bắt buộc)
 * hoặc đánh dấu đáp án đúng bằng dấu * ở đầu lựa chọn: "*B. Huế".
 * Bảng Excel: Câu hỏi | A | B | C | D | Đáp án | (Giải thích).
 */

export interface ParsedCard {
  front: string;
  back: string;
  hint?: string;
}

export interface ParsedQuestion {
  type: 'mcq' | 'multi' | 'true_false' | 'short';
  prompt: string;
  options: string[];
  correctIndex: number | null;
  correctIndexes: number[];
  correctBoolean: boolean | null;
  acceptedAnswers: string[];
  explanation: string;
}

const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean);

// dòng tiêu đề bảng (không phải thẻ / câu hỏi). \p{L}: không dùng \b vì \b không hiểu chữ có dấu
const HEADER = /^(mặt trước|mat truoc|front|term|thuật ngữ|từ vựng|từ|word|question|câu hỏi|cau hoi|stt|#)(?!\p{L})/iu;

/** Tách 1 dòng thành [mặt trước, mặt sau] theo dấu phân cách */
function splitPair(line: string, sep: string): [string, string] | null {
  if (sep === '\t') {
    const cols = line.split('\t').map((c) => c.trim()).filter(Boolean);
    // bỏ cột số thứ tự ở đầu (1, 2, 3...)
    if (cols.length >= 3 && /^\d+[.)]?$/.test(cols[0])) cols.shift();
    return cols.length >= 2 ? [cols[0], cols.slice(1).join(' – ')] : null;
  }
  const i = line.indexOf(sep);
  if (i <= 0) return null;
  const a = line.slice(0, i).trim().replace(/^\d+[.)]\s+/, '');
  const b = line.slice(i + sep.length).trim();
  return a && b ? [a, b] : null;
}

export function parseCards(text: string): ParsedCard[] {
  const ls = lines(text);
  if (ls.length < 2) return [];
  let best: ParsedCard[] = [];
  for (const sep of ['\t', ' | ', '|', ';', ' – ', ' - ', ' = ', ': ']) {
    const cards: ParsedCard[] = [];
    let hit = 0;
    for (const l of ls) {
      const pair = splitPair(l, sep);
      if (!pair) continue;
      hit++;
      if (cards.length === 0 && HEADER.test(pair[0])) continue;
      cards.push({ front: pair[0].slice(0, 500), back: pair[1].slice(0, 1000) });
    }
    // phần lớn các dòng phải theo cùng một kiểu thì mới coi là "file soạn sẵn"
    if (hit >= 2 && hit / ls.length >= 0.6 && cards.length > best.length) best = cards;
  }
  return best.slice(0, 500);
}

const Q_START = /^(?:câu|cau|question|q|bài|bai)\s*\d+\s*[:.)\-–]?\s*(.*)$/i;
const Q_NUM = /^\d{1,3}\s*[.)]\s+(.+)$/;
const OPT = /^(\*?)\s*([A-Ha-h])\s*[.)]\s*(.+?)\s*(\*?)$/;
const ANS = /^(?:đáp án(?: đúng)?|dap an(?: dung)?|đa|answers?|key|correct)\s*[:：]\s*(.+)$/i;
const EXPL = /^(?:giải thích|giai thich|explanation|lời giải|loi giai)\s*[:：]\s*(.+)$/i;
const TRUE = /^(đúng|dung|true|t|đ|yes|có)$/i;
const FALSE = /^(sai|false|f|s|no|không)$/i;

interface Block {
  prompt: string;
  options: { text: string; star: boolean }[];
  answer: string;
  explanation: string;
}

/** Ghép "đáp án" + "lựa chọn" thành câu hỏi hợp lệ; trả về null nếu thiếu đáp án */
function buildQuestion(b: Block): ParsedQuestion | null {
  const prompt = b.prompt.trim();
  if (!prompt) return null;
  const base = { prompt: prompt.slice(0, 2000), explanation: b.explanation.slice(0, 2000), correctIndex: null, correctIndexes: [], correctBoolean: null, acceptedAnswers: [], options: [] };
  if (b.options.length >= 2) {
    const options = b.options.map((o) => o.text.slice(0, 500));
    let idx: number[] = [];
    if (b.answer) {
      const letters = b.answer.toUpperCase().match(/\b[A-H]\b/g) ?? (/^[A-H]+$/i.test(b.answer.replace(/[\s,;]/g, '')) ? b.answer.replace(/[\s,;]/g, '').toUpperCase().split('') : []);
      idx = [...new Set(letters.map((l) => l.charCodeAt(0) - 65))].filter((i) => i < options.length);
      // "Đáp án: Hà Nội" – ghi thẳng nội dung lựa chọn
      if (!idx.length) {
        const i = options.findIndex((o) => o.toLowerCase() === b.answer.toLowerCase());
        if (i >= 0) idx = [i];
      }
    }
    if (!idx.length) idx = b.options.map((o, i) => (o.star ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return null;
    return idx.length === 1
      ? { ...base, type: 'mcq', options, correctIndex: idx[0] }
      : { ...base, type: 'multi', options, correctIndexes: idx.sort((a, c) => a - c) };
  }
  const ans = b.answer.trim();
  if (!ans) return null;
  if (TRUE.test(ans)) return { ...base, type: 'true_false', correctBoolean: true };
  if (FALSE.test(ans)) return { ...base, type: 'true_false', correctBoolean: false };
  return { ...base, type: 'short', acceptedAnswers: ans.split(/\s*[/;|]\s*/).filter(Boolean).slice(0, 10) };
}

/** Bảng (Excel / bảng Word): Câu hỏi | A | B | C | D | Đáp án | Giải thích */
function parseQuizTable(ls: string[]): ParsedQuestion[] {
  const rows = ls.map((l) => l.split('\t').map((c) => c.trim()));
  if (rows.filter((r) => r.length >= 3).length < Math.max(1, rows.length * 0.6)) return [];
  const out: ParsedQuestion[] = [];
  for (const r0 of rows) {
    const r = /^\d+[.)]?$/.test(r0[0] ?? '') ? r0.slice(1) : r0;
    if (r.length < 2 || HEADER.test(r[0])) continue;
    const prompt = r[0];
    // cột cuối có dạng chữ cái / Đúng-Sai -> cột đáp án; có thể kèm cột giải thích phía sau
    let ansCol = r.length - 1;
    let explanation = '';
    const isAns = (v: string) => /^[A-H](\s*[,;]\s*[A-H])*$/i.test(v) || TRUE.test(v) || FALSE.test(v);
    if (r.length >= 4 && !isAns(r[ansCol]) && isAns(r[ansCol - 1])) {
      explanation = r[ansCol];
      ansCol -= 1;
    }
    const options = r.slice(1, ansCol).filter(Boolean);
    const q = buildQuestion({ prompt, options: options.map((t) => ({ text: t, star: false })), answer: r[ansCol] ?? '', explanation });
    if (q) out.push(q);
  }
  return out;
}

export function parseQuiz(text: string): ParsedQuestion[] {
  const ls = lines(text);
  if (!ls.length) return [];
  if (ls.some((l) => l.includes('\t'))) {
    const t = parseQuizTable(ls);
    if (t.length) return t.slice(0, 200);
  }
  const out: ParsedQuestion[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) {
      const q = buildQuestion(cur);
      if (q) out.push(q);
    }
    cur = null;
  };
  for (const l of ls) {
    // "1. ..." chỉ coi là câu mới khi câu đang đọc đã có lựa chọn hoặc đáp án (tránh nhầm với dòng đánh số trong đề)
    const open = cur as Block | null;
    const start: RegExpExecArray | null = Q_START.exec(l) ?? (open && open.options.length === 0 && !open.answer ? null : Q_NUM.exec(l));
    if (start) {
      flush();
      cur = { prompt: start[1] ?? '', options: [], answer: '', explanation: '' };
      continue;
    }
    if (!cur) continue;
    const ans = ANS.exec(l);
    if (ans) {
      cur.answer = ans[1].trim();
      continue;
    }
    const ex = EXPL.exec(l);
    if (ex) {
      cur.explanation = ex[1].trim();
      continue;
    }
    const opt = OPT.exec(l);
    if (opt && (cur.options.length > 0 || opt[2].toUpperCase() === 'A')) {
      cur.options.push({ text: opt[3], star: Boolean(opt[1] || opt[4]) });
      continue;
    }
    if (cur.options.length === 0 && !cur.answer) cur.prompt += (cur.prompt ? ' ' : '') + l;
    else if (cur.explanation) cur.explanation += ' ' + l;
  }
  flush();
  return out.slice(0, 200);
}
