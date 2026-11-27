'use client';

import { Fragment, ReactNode } from 'react';

/**
 * Trình hiển thị Markdown tối giản & an toàn (không dùng dangerouslySetInnerHTML)
 * cho câu trả lời AI: tiêu đề, danh sách, **đậm**, *nghiêng*, `code`, ```khối code```.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|(?<![A-Za-z0-9])_[^_\n]+_(?![A-Za-z0-9]))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(tok);
    // chỉ cho phép liên kết http(s) – mở tab mới
    if (link) parts.push(<a key={k} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>);
    else if (tok.startsWith('**')) parts.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('_')) parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith('`')) parts.push(<code key={k} className="md-code">{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;

  const flushList = () => {
    if (!list) return;
    const L = list;
    const items = L.items.map((it, i) => <li key={i}>{inline(it, `li${out.length}-${i}`)}</li>);
    out.push(L.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      if (code) {
        out.push(
          <pre key={out.length} className="md-pre">
            <code>{code.join('\n')}</code>
          </pre>,
        );
        code = null;
      } else {
        flushList();
        code = [];
      }
      return;
    }
    if (code) return void code.push(raw);
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (h) {
      flushList();
      const level = h[1].length;
      const Tag = (level <= 2 ? 'h3' : 'h4') as 'h3' | 'h4';
      out.push(<Tag key={out.length} style={{ margin: '10px 0 4px' }}>{inline(h[2], `h${out.length}`)}</Tag>);
    } else if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flushList();
    } else {
      flushList();
      out.push(<p key={out.length} style={{ margin: '4px 0' }}>{inline(line, `p${out.length}`)}</p>);
    }
  });
  flushList();
  if (code) out.push(<pre key={out.length} className="md-pre"><code>{(code as string[]).join('\n')}</code></pre>);
  return <div className="md">{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</div>;
}
