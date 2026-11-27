'use client';

import { useEffect, useRef, useState } from 'react';
import { tr } from '@/lib/i18n';
import { Icon } from '@/components/Icon';

/**
 * Đọc thành tiếng (Text-to-Speech) và luyện phát âm tiếng Anh bằng Web Speech API có sẵn trong trình duyệt.
 */
const VI = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
export const langOf = (text: string) => (VI.test(text) ? 'vi-VN' : 'en-US');
export const isEnglish = (text: string) => !VI.test(text) && /[a-z]/i.test(text) && text.length <= 200;

export function speak(text: string, lang = langOf(text), rate = 0.95) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[_*#`]/g, ''));
  u.lang = lang;
  u.rate = rate;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
  return true;
}

export function SpeakButton({ text, label }: { text: string; label?: string }) {
  if (typeof window !== 'undefined' && !('speechSynthesis' in window)) return null;
  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      title={tr('Đọc thành tiếng')}
    >
      <Icon name="volume" size={16} /> {label ?? tr('Nghe')}
    </button>
  );
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Độ giống nhau 0..1 theo khoảng cách Levenshtein trên chữ cái */
export function similarity(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  const d: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (x[i - 1] === y[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 1 - d[y.length] / Math.max(x.length, y.length);
}

type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

/** Luyện phát âm: đọc to từ/câu tiếng Anh, trình duyệt nghe và chấm độ giống */
export function PronounceButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'listening'>('idle');
  const [result, setResult] = useState<{ heard: string; score: number } | null>(null);
  const [err, setErr] = useState('');
  const rec = useRef<Rec | null>(null);
  useEffect(() => {
    setResult(null);
    setErr('');
  }, [text]);
  const Ctor = typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;
  if (!Ctor || !isEnglish(text)) return null;

  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'listening') return rec.current?.stop();
    setErr('');
    setResult(null);
    const r = new Ctor();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 3;
    r.onresult = (ev) => {
      const alts = Array.from(ev.results[0] ?? []).map((a) => a.transcript);
      const best = alts.map((h) => ({ heard: h, score: similarity(h, text) })).sort((a, b) => b.score - a.score)[0];
      if (best) setResult(best);
    };
    r.onerror = (ev) => setErr(ev.error === 'not-allowed' ? tr('Hãy cho phép dùng micro để luyện phát âm.') : ev.error === 'no-speech' ? tr('Chưa nghe thấy gì, thử lại nhé.') : tr('Không nhận được giọng nói ({0}).', ev.error));
    r.onend = () => setState('idle');
    rec.current = r;
    setState('listening');
    r.start();
  };

  const pct = result ? Math.round(result.score * 100) : 0;
  return (
    <span className="pronounce" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`btn sm ${state === 'listening' ? 'danger' : 'secondary'}`} onClick={start} title={tr('Đọc to rồi xem điểm phát âm')}>
        <Icon name="mic" size={16} /> {state === 'listening' ? tr('Đang nghe… (bấm để dừng)') : tr('Luyện phát âm')}
      </button>
      {result && (
        <span className={`small pron-result ${pct >= 85 ? 'good' : pct >= 60 ? 'ok' : 'bad'}`}>
          {pct >= 85 ? tr('Chuẩn lắm!') : pct >= 60 ? tr('Gần đúng') : tr('Thử lại')} {pct}% · {tr('Nghe được: “{0}”', result.heard)}
        </span>
      )}
      {err && <span className="small error-text">{err}</span>}
    </span>
  );
}
