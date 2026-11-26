'use client';

import { useEffect, useRef, useState } from 'react';
import { post } from '@/lib/api';
import { Modal } from './ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

/**
 * PHASE 2 – Focus Recovery: quy trình "Quick Reset"
 * 1. Nhận ra mình phân tâm 2. Quick Reset 3. Hít thở / nghỉ ngắn
 * 4. Hiển thị lại mục tiêu 5. Chọn tiếp tục hoặc kết thúc
 */
const PHASES = [
  { label: tr('Hít vào'), seconds: 4, scale: 1.15 },
  { label: tr('Giữ hơi'), seconds: 4, scale: 1.15 },
  { label: tr('Thở ra'), seconds: 4, scale: 0.8 },
  { label: tr('Nghỉ'), seconds: 4, scale: 0.8 },
];
const CYCLES = 3; // ~48 giây (box breathing)

type Outcome = 'resumed' | 'ended' | 'break';

export function QuickReset({
  open,
  onClose,
  goal,
  sessionId,
  distractionId,
  trigger = 'manual',
  onResume,
  onBreak,
  onEnd,
}: {
  open: boolean;
  onClose: () => void;
  goal: string;
  sessionId?: string | null;
  distractionId?: string | null;
  trigger?: 'manual' | 'distraction' | 'app_leave';
  onResume?: () => void;
  onBreak?: () => void;
  onEnd?: () => void;
}) {
  const [step, setStep] = useState<'choose' | 'breathing' | 'goal'>('choose');
  const [action, setAction] = useState<'breathing' | 'take_break' | 'goal_reminder'>('breathing');
  const [tick, setTick] = useState(0);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (open) {
      setStep('choose');
      setTick(0);
      startedAt.current = Date.now();
    }
  }, [open]);

  useEffect(() => {
    if (step !== 'breathing') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  const total = PHASES.reduce((a, p) => a + p.seconds, 0) * CYCLES;
  useEffect(() => {
    if (step === 'breathing' && tick >= total) setStep('goal');
  }, [tick, total, step]);

  let rem = tick % PHASES.reduce((a, p) => a + p.seconds, 0);
  let phase = PHASES[0];
  for (const p of PHASES) {
    if (rem < p.seconds) {
      phase = p;
      break;
    }
    rem -= p.seconds;
  }

  const finish = async (outcome: Outcome) => {
    void post('/recoveries', {
      session: sessionId ?? null,
      distraction: distractionId ?? null,
      trigger,
      action,
      outcome,
      durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      startedAt: new Date(startedAt.current).toISOString(),
      device: 'web',
    }).catch(() => undefined);
    onClose();
    if (outcome === 'resumed') onResume?.();
    if (outcome === 'break') onBreak?.();
    if (outcome === 'ended') onEnd?.();
  };

  return (
    <Modal open={open} onClose={onClose} title={tr('Quick Reset – lấy lại tập trung')}>
      {step === 'choose' && (
        <div className="col" style={{ gap: 12 }}>
          <p className="muted">{tr('Bị gián đoạn là bình thường. Chọn một cách để quay lại:')}</p>
          <button
            className="btn block lg"
            onClick={() => {
              setAction('breathing');
              setStep('breathing');
            }}
          >
            {tr('Hít thở 4-4-4-4 (≈ 50 giây)')}
          </button>
          <button
            className="btn secondary block"
            onClick={() => {
              setAction('goal_reminder');
              setStep('goal');
            }}
          >
            {tr('Xem lại mục tiêu')}
          </button>
          <button
            className="btn secondary block"
            onClick={() => {
              setAction('take_break');
              void finish('break');
            }}
          >
            <Icon name="coffee" size={16} />{' '}{tr('Nghỉ ngắn 5 phút')}
          </button>
        </div>
      )}

      {step === 'breathing' && (
        <div className="col" style={{ alignItems: 'center', gap: 18, padding: '10px 0' }}>
          <div className="breath-circle" style={{ transform: `scale(${phase.scale})`, transitionDuration: `${phase.seconds}s` }}>
            <span>{phase.label}</span>
          </div>
          <p className="muted small">
            {tr('Vòng {0}/{1}', Math.min(CYCLES, Math.floor(tick / 16) + 1), CYCLES)}
          </p>
          <button className="btn ghost" onClick={() => setStep('goal')}>
            {tr('Bỏ qua')}
          </button>
        </div>
      )}

      {step === 'goal' && (
        <div className="col" style={{ alignItems: 'center', textAlign: 'center', gap: 14 }}>
          <p className="muted">{tr('Mục tiêu ban đầu của bạn:')}</p>
          <p className="session-goal">“{goal || tr('Tập trung học')}”</p>
          <p className="small muted">{tr('Chỉ cần làm bước nhỏ tiếp theo – không cần hoàn hảo.')}</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <button className="btn lg" onClick={() => finish('resumed')}>
              <Icon name="play" size={16} />{' '}{tr('Tiếp tục học')}
            </button>
            <button className="btn secondary" onClick={() => finish('break')}>
              {tr('Nghỉ ngắn')}
            </button>
            <button className="btn ghost" onClick={() => finish('ended')}>
              {tr('Kết thúc phiên')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
