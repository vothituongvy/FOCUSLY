'use client';

import { useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { fromDateInput, toDateTimeInput } from '@/lib/format';
import { REASONS, type DistractionReason } from '@/lib/types';
import { Modal } from './ui';
import { tr } from '@/lib/i18n';

/** Ghi nhận một lần mất tập trung (trong phiên học hoặc ghi bổ sung) */
export function DistractionModal({
  open,
  onClose,
  sessionId,
  goal,
  onSaved,
  presetNote,
  onRecover,
}: {
  open: boolean;
  onClose: () => void;
  sessionId?: string | null;
  goal?: string;
  onSaved?: () => void;
  presetNote?: string;
  /** Phase 2: sau khi ghi nhận, mở Quick Reset (Focus Recovery) */
  onRecover?: (distractionId: string) => void;
}) {
  const subjects = useLearning((s) => s.subjects);
  const [reason, setReason] = useState<DistractionReason | null>(null);
  const [note, setNote] = useState(presetNote ?? '');
  const [subject, setSubject] = useState('');
  const [occurredAt, setOccurredAt] = useState(toDateTimeInput(new Date().toISOString()));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!reason) return setError(tr('Chọn nguyên nhân'));
    try {
      const r = await post<{ item: { id: string } }>('/distractions', {
        reason,
        note,
        session: sessionId ?? null,
        ...(sessionId ? {} : { subject: subject || null, occurredAt: fromDateInput(occurredAt) }),
        device: 'web',
      });
      onSaved?.();
      if (onRecover) {
        onClose();
        onRecover(r.item.id);
      } else if (sessionId && goal) setSaved(true);
      else onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={saved ? tr('Quay lại mục tiêu nhé ') : tr('Điều gì làm bạn phân tâm?')}>
      {saved ? (
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 16 }}>
          <p className="muted">{tr('Đã ghi vào Nhật ký phân tâm. Mục tiêu của phiên này là:')}</p>
          <p className="session-goal">“{goal}”</p>
          <p className="small muted">{tr('Hít thở sâu 3 lần, sau đó tiếp tục.')}</p>
          <button className="btn lg" onClick={onClose}>
            {tr('Tiếp tục học')}
          </button>
        </div>
      ) : (
        <div className="form">
          <div className="chips">
            {REASONS.map((r) => (
              <button key={r.value} type="button" className={`chip ${reason === r.value ? 'active' : ''}`} onClick={() => setReason(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
          {!sessionId && (
            <div className="grid grid-2">
              <label className="field">
                {tr('Môn học')}
                <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">{tr('— Không —')}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {tr('Thời điểm')}
                <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
              </label>
            </div>
          )}
          <label className="field">
            {tr('Ghi chú (tuỳ chọn)')}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr('VD: Mở Facebook xem thông báo nhóm lớp')} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn secondary" onClick={onClose}>
              {tr('Huỷ')}
            </button>
            <button className="btn" onClick={save}>
              {tr('Ghi nhận')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
