'use client';

import { useState } from 'react';
import { post } from '@/lib/api';
import { tr } from '@/lib/i18n';

/**
 * Nút 👍/👎 – FOCUSLY Brain học từ đánh giá này để lần sau tạo nội dung hợp ý bạn hơn.
 * kind: answer (câu trả lời trợ lý) · question (câu hỏi AI tạo) · card (flashcard AI tạo)
 */
export function Feedback({
  kind,
  origin,
  text,
  initial = 0,
  conversationId,
  index,
}: {
  kind: 'answer' | 'question' | 'card';
  origin?: string;
  text?: string;
  initial?: number;
  conversationId?: string;
  index?: number;
}) {
  const [vote, setVote] = useState(initial);
  const send = (v: 1 | -1) => {
    if (vote === v) return;
    setVote(v);
    void post('/ai/feedback', { items: [{ kind, origin: origin || 'unknown', vote: v, text: (text ?? '').slice(0, 300) }], conversationId, index }).catch(() => setVote(0));
  };
  return (
    <span className="feedback" role="group" aria-label={tr('Đánh giá nội dung AI')}>
      <button type="button" className={`fb-btn ${vote === 1 ? 'on' : ''}`} aria-pressed={vote === 1} title={tr('Hữu ích')} onClick={() => send(1)}>
        👍
      </button>
      <button type="button" className={`fb-btn ${vote === -1 ? 'on down' : ''}`} aria-pressed={vote === -1} title={tr('Chưa tốt')} onClick={() => send(-1)}>
        👎
      </button>
      {vote !== 0 && <span className="small muted">{tr('Cảm ơn! Brain sẽ học từ đánh giá này.')}</span>}
    </span>
  );
}
