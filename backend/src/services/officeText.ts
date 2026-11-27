import { inflateRawSync } from 'zlib';

/**
 * Đọc chữ từ file Word (.docx) và Excel (.xlsx) mà không cần thư viện ngoài.
 * Hai định dạng này thực chất là file ZIP chứa XML; ta chỉ cần giải nén vài file XML cần thiết.
 */

/** Giải nén các mục trong file ZIP có tên thoả điều kiện */
function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // Tìm "End of central directory" (chữ ký 0x06054b50) từ cuối file
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    try {
      if (method === 0) out.set(name, data);
      else if (method === 8) out.set(name, inflateRawSync(data));
    } catch {
      /* bỏ qua mục hỏng */
    }
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

/** Word: mỗi đoạn một dòng; ô trong bảng cách nhau bằng TAB (để nhận dạng bảng thuật ngữ – định nghĩa) */
export function docxText(buf: Buffer): string {
  const xml = unzip(buf, (n) => n === 'word/document.xml').get('word/document.xml')?.toString('utf8');
  if (!xml) return '';
  const body = xml
    .replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cell) => cell.replace(/<\/w:p>/g, ' ') + '\t')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decode(body)
    .split('\n')
    .map((l) => l.replace(/[  ]+/g, ' ').replace(/\t\s*$/, '').trim())
    .join('\n');
}

/** Excel: mỗi hàng một dòng, các ô cách nhau bằng TAB (đọc mọi trang tính) */
export function xlsxText(buf: Buffer): string {
  const files = unzip(buf, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    shared.push(decode((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const colIndex = (ref: string) => {
    const letters = ref.replace(/\d+/g, '');
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  const sheets = [...files.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort();
  const lines: string[] = [];
  for (const k of sheets) {
    const xml = files.get(k)!.toString('utf8');
    for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c)?.[1] ?? '';
        const type = /\bt="(\w+)"/.exec(c)?.[1];
        let v = '';
        if (type === 's') v = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(c)?.[1] ?? -1)] ?? '';
        else if (type === 'inlineStr') v = decode((/<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1] ?? ''));
        else v = decode(/<v>([\s\S]*?)<\/v>/.exec(c)?.[1] ?? '');
        const i = ref ? colIndex(ref) : cells.length;
        while (cells.length < i) cells.push('');
        cells[i] = v.replace(/\s+/g, ' ').trim();
      }
      if (cells.some(Boolean)) lines.push(cells.join('\t').replace(/\t+$/, ''));
    }
  }
  return lines.join('\n');
}
