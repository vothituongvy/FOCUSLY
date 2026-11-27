/**
 * FOCUSLY Brain – kho kiến thức Wikipedia (tiếng Việt + tiếng Anh), miễn phí, không cần khoá.
 * Brain không lưu sẵn Wikipedia: khi cần mới tra, chỉ gửi TỪ KHOÁ câu hỏi (không gửi dữ liệu người dùng).
 * Nội dung Wikipedia theo giấy phép CC BY-SA – luôn ghi nguồn kèm liên kết.
 */
import { bm25, isVietnamese, sentences, type Doc } from './text';

const UA = 'FOCUSLY-Brain/1.0 (study app; https://focusly-nu-sage.vercel.app)';
const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 6 * 3600_000;

async function getJson<T>(url: string): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: ctrl.signal });
    if (!r.ok) return null;
    const value = (await r.json()) as T;
    cache.set(url, { at: Date.now(), value });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface WikiArticle {
  title: string;
  lang: 'vi' | 'en';
  url: string;
  text: string;
}

/** Bỏ phần đuôi không dùng để học (Tham khảo, Liên kết ngoài…) và tiêu đề mục kiểu "== X ==" */
function cleanExtract(t: string): string {
  const cut = t.search(/\n==+\s*(Tham khảo|Chú thích|Liên kết ngoài|Xem thêm|Đọc thêm|Ghi chú|References|External links|See also|Notes|Further reading)\s*==+/i);
  return (cut > 0 ? t.slice(0, cut) : t)
    .replace(/\n==+\s*([^=\n]+?)\s*==+\n?/g, '\n\n$1.\n')
    .replace(/\(\s*[;,]?\s*\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 80_000);
}

/** Tìm bài phù hợp nhất cho một câu hỏi / chủ đề */
export async function searchWiki(query: string, lang: 'vi' | 'en'): Promise<string[]> {
  const q = query.replace(/[?!.]+$/g, '').trim().slice(0, 200);
  if (!q) return [];
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=3&srprop=&format=json&utf8=1&origin=*`;
  const data = await getJson<{ query?: { search?: { title: string }[] } }>(url);
  return (data?.query?.search ?? []).map((s) => s.title);
}

export async function fetchWiki(title: string, lang: 'vi' | 'en'): Promise<WikiArticle | null> {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json&utf8=1&origin=*`;
  const data = await getJson<{ query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> } }>(url);
  const page = Object.values(data?.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  const text = cleanExtract(page.extract);
  if (text.length < 80) return null;
  const t = page.title ?? title;
  return { title: t, lang, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`, text };
}

/** Tra bài cho chủ đề: ưu tiên ngôn ngữ của câu hỏi, không có thì thử ngôn ngữ còn lại */
export async function lookup(query: string, prefer?: 'vi' | 'en'): Promise<WikiArticle | null> {
  const first = prefer ?? (isVietnamese(query) ? 'vi' : 'en');
  for (const lang of [first, first === 'vi' ? 'en' : 'vi'] as const) {
    const titles = await searchWiki(query, lang);
    for (const t of titles.slice(0, 2)) {
      const a = await fetchWiki(t, lang);
      if (a) return a;
    }
  }
  return null;
}

/**
 * Trả lời câu hỏi bằng Wikipedia: đoạn mở đầu (định nghĩa) + các câu sát câu hỏi nhất.
 * Trả null nếu không tìm thấy gì đủ liên quan.
 */
export async function answerFromWiki(question: string, concept?: string | null): Promise<{ text: string; article: WikiArticle } | null> {
  const a = await lookup(concept || question);
  if (!a) return null;
  const sents = sentences(a.text, 30, 420);
  if (!sents.length) return null;
  const lead = sents.slice(0, 2);
  const docs: Doc[] = sents.map((s, i) => ({ id: String(i), text: s }));
  const hits = concept ? [] : bm25(docs, question).slice(0, 3).filter((h) => !lead.includes(h.doc.text));
  const vi = a.lang === 'vi';
  const lines = [
    vi ? `**Theo Wikipedia – ${a.title}:**` : `**From Wikipedia – ${a.title}:**`,
    ...lead.map((s) => `- ${s}`),
    ...hits.map((h) => `- ${h.doc.text}`),
    '',
    `[${vi ? 'Đọc bài đầy đủ' : 'Read the full article'}](${a.url}) · _Wikipedia, CC BY-SA_`,
    '',
    vi ? `Gõ **“lưu bài ${a.title}”** để lưu thành tài liệu và tạo flashcard, câu hỏi từ bài này.` : `Type **“save ${a.title}”** to keep it as a material and make flashcards or quizzes from it.`,
  ];
  return { text: lines.join('\n'), article: a };
}
