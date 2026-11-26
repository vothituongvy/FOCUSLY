'use client';

import { useRef, useState } from 'react';
import { ApiError, errorMessage, post } from '@/lib/api';
import { Icon } from './Icon';
import { tr } from '@/lib/i18n';

type Dir = 'auto' | 'vi' | 'en';
interface Result {
  from: 'vi' | 'en' | 'other';
  to: 'vi' | 'en';
  translation: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  alternatives: string[];
  example?: { source: string; target: string } | null;
  short: boolean;
}

const DIRS: { id: Dir; label: string }[] = [
  { id: 'auto', label: tr('Tự nhận') },
  { id: 'vi', label: tr('Anh → Việt') },
  { id: 'en', label: tr('Việt → Anh') },
];
const LANG_NAME = { vi: tr('Tiếng Việt'), en: tr('Tiếng Anh'), other: tr('Ngôn ngữ khác') } as const;

/**
 * Ô dịch Anh ⇄ Việt ngay trong phiên học: tra từ, dịch câu mà không phải rời FOCUSLY
 * (nên dùng được cả trong Phiên nghiêm ngặt).
 */
export function TranslatePanel({ onClose }: { onClose?: () => void }) {
  const [text, setText] = useState('');
  const [dir, setDir] = useState<Dir>('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [aiOff, setAiOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<{ q: string; a: string }[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);

  const run = async (q = text) => {
    const value = q.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const r = await post<Result>('/ai/translate', { text: value, to: dir });
      setResult(r);
      setRecent((list) => [{ q: value, a: r.translation }, ...list.filter((x) => x.q !== value)].slice(0, 5));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AI_DISABLED') setAiOff(true);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const googleUrl = `https://translate.google.com/?sl=auto&tl=${dir === 'en' ? 'en' : 'vi'}&text=${encodeURIComponent(text)}&op=translate`;

  return (
    <section className="translate" aria-label={tr('Dịch Anh ⇄ Việt')}>
      <header className="translate-head">
        <b>
          <Icon name="translate" size={17} />{' '}{tr('Dịch Anh ⇄ Việt')}
        </b>
        {onClose && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label={tr('Đóng ô dịch')}>
            <Icon name="x" size={16} />
          </button>
        )}
      </header>

      <div className="translate-dirs" role="radiogroup" aria-label={tr('Chiều dịch')}>
        {DIRS.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={dir === d.id} className={dir === d.id ? 'on' : ''} onClick={() => setDir(d.id)}>
            {d.label}
          </button>
        ))}
      </div>

      <textarea
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void run();
          }
        }}
        placeholder={tr('Gõ một từ hoặc dán câu cần dịch, nhấn Enter')}
        rows={3}
        maxLength={2000}
      />
      <div className="row between">
        <span className="small muted">{tr('Shift + Enter để xuống dòng')}</span>
        <button type="button" className="btn sm" disabled={busy || !text.trim()} onClick={() => void run()}>
          {busy ? tr('Đang dịch…') : tr('Dịch')}
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: 'var(--stop)' }}>
          {aiOff ? tr('Ô dịch dùng trợ lý AI nhưng AI chưa được bật trên máy chủ.') : error}{' '}
          {text.trim() && (
            <a href={googleUrl} target="_blank" rel="noreferrer">
              {tr('Mở Google Dịch')}
            </a>
          )}
        </div>
      )}

      {result && !error && (
        <div className="translate-out">
          <div className="small muted">
            {LANG_NAME[result.from]} → {LANG_NAME[result.to]}
          </div>
          <p className="translate-text">{result.translation}</p>
          {(result.phonetic || result.partOfSpeech) && (
            <div className="small muted">{[result.phonetic, result.partOfSpeech].filter(Boolean).join('  ·  ')}</div>
          )}
          {result.alternatives.length > 0 && (
            <div className="small">
              {tr('Nghĩa khác:')}{' '}<span className="muted">{result.alternatives.join(', ')}</span>
            </div>
          )}
          {result.example && (
            <div className="translate-example small">
              <div>{result.example.source}</div>
              <div className="muted">{result.example.target}</div>
            </div>
          )}
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              void navigator.clipboard?.writeText(result.translation).then(() => setCopied(true));
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? tr('Đã chép') : tr('Chép bản dịch')}
          </button>
        </div>
      )}

      {recent.length > 1 && (
        <div className="translate-recent">
          <div className="small muted">{tr('Vừa tra')}</div>
          {recent.slice(1).map((r) => (
            <button
              key={r.q}
              type="button"
              onClick={() => {
                setText(r.q);
                void run(r.q);
              }}
            >
              <span className="truncate">{r.q}</span>
              <span className="muted truncate">{r.a}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
