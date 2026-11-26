/**
 * Trích văn bản từ tài liệu để tìm kiếm và cho AI đọc.
 * PDF dùng pdf-parse (import thẳng lib để tránh lỗi debug-mode của bản 1.x).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = require('pdf-parse/lib/pdf-parse.js');

export const MAX_TEXT_CHARS = 300_000;

export interface Extracted {
  text: string;
  pages: number;
}

export async function extractText(buffer: Buffer, mime: string, originalName = ''): Promise<Extracted> {
  try {
    if (mime === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) {
      const r = await pdfParse(buffer);
      return { text: clean(r.text), pages: r.numpages || 0 };
    }
    if (mime.startsWith('text/') || /\.(md|txt|csv|json)$/i.test(originalName)) {
      return { text: clean(buffer.toString('utf8')), pages: 0 };
    }
  } catch (e) {
    console.warn('[extract] Không trích được văn bản:', (e as Error).message);
  }
  return { text: '', pages: 0 };
}

function clean(s: string): string {
  return s.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT_CHARS);
}

export function materialTypeFromMime(mime: string, name: string): 'pdf' | 'image' | 'text' | 'document' {
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('text/') || /\.(md|txt|csv)$/i.test(name)) return 'text';
  return 'document';
}
