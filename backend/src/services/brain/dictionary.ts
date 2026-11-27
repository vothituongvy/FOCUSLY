/**
 * FOCUSLY Brain – Từ điển Anh–Việt (miễn phí, không cần khoá).
 * - Nghĩa tiếng Anh, phiên âm, từ loại, ví dụ: Free Dictionary API (dictionaryapi.dev, dữ liệu Wiktionary)
 * - Nghĩa tiếng Việt: dịch từ và câu ví dụ qua MyMemory
 */
import { translateFree } from './assistant';

const POS_VI: Record<string, string> = {
  noun: 'danh từ',
  verb: 'động từ',
  adjective: 'tính từ',
  adverb: 'trạng từ',
  pronoun: 'đại từ',
  preposition: 'giới từ',
  conjunction: 'liên từ',
  interjection: 'thán từ',
  determiner: 'từ hạn định',
  exclamation: 'thán từ',
  'phrasal verb': 'cụm động từ',
};

export interface WordEntry {
  word: string;
  phonetic: string | null;
  audio: string | null;
  senses: { pos: string; posVi: string; definition: string; example: string | null }[];
  vi: string | null;
  alternatives: string[];
}

const cache = new Map<string, { at: number; value: WordEntry | null }>();

export const isEnglishWord = (s: string) => /^[a-z][a-z' -]{0,40}$/i.test(s.trim()) && s.trim().split(/\s+/).length <= 3;

export async function lookupWord(raw: string): Promise<WordEntry | null> {
  const word = raw.trim().toLowerCase();
  if (!isEnglishWord(word)) return null;
  const hit = cache.get(word);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let value: WordEntry | null = null;
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: ctrl.signal });
    if (r.ok) {
      const data = (await r.json()) as {
        word: string;
        phonetic?: string;
        phonetics?: { text?: string; audio?: string }[];
        meanings?: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
      }[];
      const e = data[0];
      if (e) {
        const senses: WordEntry['senses'] = [];
        for (const m of e.meanings ?? []) {
          for (const d of m.definitions.slice(0, 2)) senses.push({ pos: m.partOfSpeech, posVi: POS_VI[m.partOfSpeech] ?? m.partOfSpeech, definition: d.definition, example: d.example ?? null });
          if (senses.length >= 5) break;
        }
        const phon = e.phonetic ?? e.phonetics?.find((p) => p.text)?.text ?? null;
        const audio = e.phonetics?.find((p) => p.audio)?.audio || null;
        value = { word: e.word, phonetic: phon, audio, senses, vi: null, alternatives: [] };
      }
    }
  } catch {
    value = null;
  } finally {
    clearTimeout(timer);
  }
  // nghĩa tiếng Việt (kể cả khi từ điển Anh không có mục này)
  try {
    const t = await translateFree(word, 'vi');
    if (value) {
      value.vi = t.translation;
      value.alternatives = t.alternatives;
    } else if (t.translation && t.translation.toLowerCase() !== word) {
      value = { word, phonetic: null, audio: null, senses: [], vi: t.translation, alternatives: t.alternatives };
    }
  } catch {
    /* bỏ qua: vẫn trả nghĩa tiếng Anh nếu có */
  }
  cache.set(word, { at: Date.now(), value });
  return value;
}

/** Trình bày mục từ cho Trợ lý AI */
export function formatEntry(e: WordEntry): string {
  const lines = [`**${e.word}**${e.phonetic ? `  ${e.phonetic}` : ''}${e.vi ? ` – ${e.vi}` : ''}`];
  if (e.alternatives.length) lines.push(`Nghĩa khác: ${e.alternatives.join(', ')}`);
  const byPos = new Map<string, WordEntry['senses']>();
  e.senses.forEach((s) => byPos.set(s.posVi, [...(byPos.get(s.posVi) ?? []), s]));
  for (const [pos, list] of byPos) {
    lines.push('', `_${pos}_`);
    list.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.definition}`);
      if (s.example) lines.push(`   Ví dụ: “${s.example}”`);
    });
  }
  lines.push('', '_Từ điển: Free Dictionary API (Wiktionary) · nghĩa tiếng Việt: MyMemory_');
  return lines.join('\n');
}
