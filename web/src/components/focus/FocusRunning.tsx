'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLearning } from '@/lib/learning';
import { useNow } from '@/lib/hooks';
import { fmtClock, fmtDuration } from '@/lib/format';
import { extensionAttempts, extensionShieldOff, isExtensionInstalled } from '@/lib/extension';
import type { FocusSession, Segment } from '@/lib/types';
import { DistractionModal } from '../DistractionModal';
import { QuickReset } from '../QuickReset';
import { Modal } from '../ui';
import { Icon } from '@/components/Icon';

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    /* ignore */
  }
}

function notify(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: 'focusly' });
    } catch {
      /* ignore */
    }
  }
}

const segSeconds = (s: Segment, now: number) => Math.max(0, ((s.endedAt ? +new Date(s.endedAt) : now) - +new Date(s.startedAt)) / 1000);

export function FocusRunning({
  session,
  offsetMs,
  onChange,
  onEnded,
}: {
  session: FocusSession;
  offsetMs: number;
  onChange: (s: FocusSession) => void;
  onEnded: (s: FocusSession) => void;
}) {
  const user = useAuth((s) => s.user);
  const subject = useLearning((s) => s.subjects.find((x) => x.id === (typeof session.subject === 'string' ? session.subject : null)));
  const nowLocal = useNow(500);
  const now = nowLocal + offsetMs;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDistraction, setShowDistraction] = useState(false);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [leaveBanner, setLeaveBanner] = useState<number | null>(null);
  const [escapes, setEscapes] = useState(0);
  const [extOk, setExtOk] = useState<boolean | null>(null);
  const strict = Boolean(session.strict);
  const [breakOver, setBreakOver] = useState(false);
  const [recover, setRecover] = useState<{ distractionId?: string; trigger: 'manual' | 'distraction' | 'app_leave' } | null>(null);
  const autoRef = useRef<string>('');
  const leftAt = useRef<number | null>(null);
  const reminderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusMode = session.shieldEnabled && (user?.shield.hideDistractions ?? true);

  /* ---------- Tính thời gian ---------- */
  const segs = session.segments;
  const focusTotal = segs.filter((s) => s.type === 'focus').reduce((a, s) => a + segSeconds(s, now), 0);
  const lastBreakIdx = segs.map((s) => s.type).lastIndexOf('break');
  const focusSinceBreak = segs
    .slice(lastBreakIdx + 1)
    .filter((s) => s.type === 'focus')
    .reduce((a, s) => a + segSeconds(s, now), 0);
  const current = segs[segs.length - 1];
  const p = session.pomodoro;
  const cycles = p.completedCycles ?? 0;
  const isLongBreak = cycles > 0 && cycles % p.cyclesBeforeLongBreak === 0;

  let target = 0;
  let elapsed = focusTotal;
  let phaseLabel = 'Tập trung';
  if (session.mode === 'pomodoro') {
    if (session.status === 'on_break') {
      target = (isLongBreak ? p.longBreakMinutes : p.breakMinutes) * 60;
      elapsed = current && !current.endedAt ? segSeconds(current, now) : 0;
      phaseLabel = isLongBreak ? 'Nghỉ dài' : 'Nghỉ ngắn';
    } else {
      target = p.focusMinutes * 60;
      elapsed = focusSinceBreak;
      phaseLabel = `Pomodoro ${cycles + 1}`;
    }
  } else if (session.mode === 'custom') {
    if (session.status === 'on_break') {
      elapsed = current && !current.endedAt ? segSeconds(current, now) : 0;
      phaseLabel = 'Đang nghỉ';
    } else {
      target = session.plannedMinutes * 60;
      phaseLabel = 'Phiên tuỳ chỉnh';
    }
  } else if (session.status === 'on_break') {
    elapsed = current && !current.endedAt ? segSeconds(current, now) : 0;
    phaseLabel = 'Đang nghỉ';
  }
  const remaining = target ? Math.max(0, target - elapsed) : elapsed;
  const ratio = target ? Math.min(1, elapsed / target) : (elapsed % 3600) / 3600;

  /* ---------- Hành động ---------- */
  const act = useCallback(
    async (action: 'pause' | 'resume' | 'break', at?: Date) => {
      setBusy(true);
      setError('');
      try {
        const { session: s } = await post<{ session: FocusSession }>(`/sessions/${session.id}/${action}`, at ? { at: at.toISOString() } : {});
        onChange(s);
        setBreakOver(false);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [session.id, onChange],
  );

  // Tự chuyển Pomodoro: hết giờ tập trung -> nghỉ; hết giờ nghỉ -> nhắc quay lại
  useEffect(() => {
    if (!target || remaining > 0) return;
    const key = `${session.status}-${segs.length}`;
    if (autoRef.current === key) return;
    autoRef.current = key;
    beep();
    if (session.mode === 'pomodoro' && session.status === 'active') {
      notify('Hết giờ tập trung ', 'Đến giờ nghỉ ngắn rồi!');
      void act('break');
    } else if (session.status === 'on_break') {
      notify('Hết giờ nghỉ', `Quay lại mục tiêu: ${session.goal}`);
      setBreakOver(true);
    } else if (session.mode === 'custom' && session.status === 'active') {
      notify('Hoàn thành thời lượng phiên ', 'Ghi nhận kết quả phiên học nhé.');
      setEndAt(new Date(now));
    }
  }, [remaining, target, session.status, session.mode, segs.length, act, session.goal, now]);

  // Heartbeat 30s: để server biết phiên vẫn đang mở (khôi phục khi đóng app/mất mạng)
  useEffect(() => {
    const id = setInterval(() => {
      post<{ session: FocusSession }>(`/sessions/${session.id}/heartbeat`)
        .then((r) => r.session.updatedAt !== session.updatedAt && onChange(r.session))
        .catch(() => undefined);
    }, 30_000);
    return () => clearInterval(id);
  }, [session.id, session.updatedAt, onChange]);

  // Focus Shield: phát hiện rời tab.
  // Phiên nghiêm ngặt = ĐỒNG HỒ TRUNG THỰC: rời FOCUSLY quá 2 giây là tự dừng, tính lùi về lúc rời đi.
  useEffect(() => {
    if (!session.shieldEnabled) return;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (session.status !== 'active') return;
        const left = Date.now();
        leftAt.current = left;
        if (strict) {
          pauseTimer = setTimeout(() => {
            void act('pause', new Date(left + offsetMs));
          }, 2000);
        }
        reminderTimer.current = setTimeout(() => notify('Phiên học vẫn đang chờ bạn', session.goal || 'Quay lại FOCUSLY để học tiếp'), strict ? 15_000 : 60_000);
      } else if (leftAt.current) {
        if (pauseTimer) clearTimeout(pauseTimer);
        if (reminderTimer.current) clearTimeout(reminderTimer.current);
        const left = leftAt.current;
        leftAt.current = null;
        const seconds = Math.round((Date.now() - left) / 1000);
        if (seconds >= (strict ? 2 : 10)) {
          setLeaveBanner(seconds);
          post<{ session: FocusSession }>(`/sessions/${session.id}/app-leave`, {
            leftAt: new Date(left + offsetMs).toISOString(),
            returnedAt: new Date(Date.now() + offsetMs).toISOString(),
            device: 'web',
          })
            .then((r) => onChange(r.session))
            .catch(() => undefined);
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (pauseTimer) clearTimeout(pauseTimer);
      if (reminderTimer.current) clearTimeout(reminderTimer.current);
    };
  }, [session.id, session.shieldEnabled, session.status, session.goal, offsetMs, onChange, strict, act]);

  // Phiên nghiêm ngặt: lấy các lần cố mở trang bị chặn / chuyển tab từ extension, ghi vào Nhật ký phân tâm
  useEffect(() => {
    if (!strict) return;
    void isExtensionInstalled().then(setExtOk);
    const sync = async () => {
      const list = await extensionAttempts();
      for (const a of list) {
        setEscapes((n) => n + 1);
        await post('/distractions', {
          session: session.id,
          reason: 'blocked_site',
          note: a.kind === 'tab' ? `Chuyển sang tab ${a.host}` : `Cố mở ${a.host}`,
          occurredAt: new Date(a.at).toISOString(),
          source: 'auto',
          device: 'web',
        }).catch(() => undefined);
      }
    };
    const id = setInterval(() => void sync(), 8000);
    return () => {
      clearInterval(id);
      void sync();
    };
  }, [strict, session.id]);

  const R = 136;
  const C = 2 * Math.PI * R;
  // Vòng thời gian: vàng dạ quang khi đang tập trung, xanh khi nghỉ, xám khi tạm dừng
  const ringColor = session.status === 'on_break' ? '#4cc38a' : session.status === 'paused' ? '#8a93a8' : focusMode ? 'var(--marker)' : 'var(--ink)';

  const content = (
    <div className="focus-stage" style={{ width: '100%', maxWidth: 720 }}>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {subject && (
          <span className="badge">
            {subject.icon} {subject.name}
          </span>
        )}
        <span className="badge">{phaseLabel}</span>
        {strict ? <span className="badge">Phiên nghiêm ngặt</span> : session.shieldEnabled && <span className="badge">Focus Shield</span>}
        {session.device !== 'web' && <span className="badge">bắt đầu từ {session.device}</span>}
      </div>

      <p className="session-goal">{session.goal}</p>

      {session.autoPausedAt && session.status === 'paused' && (
        <div className="banner warn">Phiên đã tự tạm dừng vì ứng dụng bị đóng hoặc mất kết nối. Thời gian vắng mặt không được tính.</div>
      )}
      {strict && extOk === false && (
        <div className="banner warn">Chưa có FOCUSLY Extension nên trình duyệt chưa bị khoá tab. Đồng hồ vẫn tự dừng khi bạn rời trang này.</div>
      )}
      {leaveBanner && (
        <div className="banner warn">
          {strict
            ? `Bạn đã rời FOCUSLY ${fmtDuration(leaveBanner)}. Đồng hồ đã dừng từ lúc bạn rời đi.`
            : `Bạn vừa rời tab ${fmtDuration(leaveBanner)}. Có phải bạn bị phân tâm?`}
          {strict && session.status === 'paused' && (
            <button
              className="btn sm"
              onClick={() => {
                setLeaveBanner(null);
                void act('resume');
              }}
            >
              Học tiếp
            </button>
          )}
          <button className="btn sm" onClick={() => setShowDistraction(true)}>
            Ghi nguyên nhân
          </button>
          <button className="btn sm ghost" onClick={() => setLeaveBanner(null)}>
            Bỏ qua
          </button>
        </div>
      )}
      {breakOver && (
        <div className="banner warn">
          <Icon name="calendar" size={16} /> Hết giờ nghỉ!{' '}
          <button className="btn sm" onClick={() => act('resume')}>
            Tiếp tục học
          </button>
        </div>
      )}

      <div className="timer-ring">
        <svg width="300" height="300">
          <circle cx="150" cy="150" r={R} stroke={focusMode ? 'rgba(255,255,255,.08)' : 'var(--rule)'} strokeWidth="10" fill="none" />
          <circle
            cx="150"
            cy="150"
            r={R}
            stroke={ringColor}
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset .5s linear' }}
          />
        </svg>
        <div className="timer-center">
          <div className="timer-text">{fmtClock(remaining)}</div>
          <div className="muted small">
            {session.status === 'paused' ? 'Tạm dừng' : session.status === 'on_break' ? 'Nghỉ giải lao' : target ? 'còn lại' : 'đã tập trung'}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ justifyContent: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="muted small">Tập trung thực tế</div>
          <b>{fmtClock(focusTotal)}</b>
        </div>
        {session.plannedMinutes > 0 && (
          <div style={{ textAlign: 'center' }}>
            <div className="muted small">Dự kiến</div>
            <b>{session.plannedMinutes} phút</b>
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div className="muted small">Phân tâm</div>
          <b>{session.distractionCount}</b>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="muted small">Rời tab/app</div>
          <b>{session.appLeaveCount}</b>
        </div>
        {strict && (
          <div style={{ textAlign: 'center' }}>
            <div className="muted small">Lần cố thoát</div>
            <b>{escapes}</b>
          </div>
        )}
      </div>

      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {session.status === 'active' && (
          <button className="btn secondary lg" disabled={busy} onClick={() => act('pause')}>
            <Icon name="pause" size={16} /> Tạm dừng
          </button>
        )}
        {(session.status === 'paused' || session.status === 'on_break') && (
          <button className="btn lg" disabled={busy} onClick={() => act('resume')}>
            <Icon name="play" size={16} /> {session.status === 'on_break' ? 'Kết thúc nghỉ' : 'Tiếp tục'}
          </button>
        )}
        {session.status === 'active' && session.mode !== 'custom' && (
          <button className="btn secondary lg" disabled={busy} onClick={() => act('break')}>
            <Icon name="coffee" size={16} /> Nghỉ
          </button>
        )}
        {strict && (!target || session.mode !== 'custom' || focusTotal < session.plannedMinutes * 60) ? (
          <HoldButton disabled={busy} onDone={() => setEndAt(new Date(now))} />
        ) : (
          <button className="btn danger lg" disabled={busy} onClick={() => setEndAt(new Date(now))}>
            <Icon name="stop" size={16} /> Kết thúc
          </button>
        )}
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button className="btn ghost" onClick={() => setShowDistraction(true)}>
          <Icon name="zap" size={16} /> Tôi đang bị phân tâm
        </button>
        <button className="btn ghost" onClick={() => setRecover({ trigger: 'manual' })}>
          <Icon name="wind" size={16} /> Quick Reset
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );

  return (
    <>
      {focusMode ? (
        <div className="focus-mode">
          {content}
          <button
            className="btn ghost sm"
            style={{ position: 'absolute', top: 16, right: 16 }}
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)}
          >
            <Icon name="maximize" size={16} /> Toàn màn hình
          </button>
        </div>
      ) : (
        <div className="card">{content}</div>
      )}

      {showDistraction && (
        <DistractionModal
          open
          sessionId={session.id}
          goal={session.goal}
          onClose={() => {
            setShowDistraction(false);
            if (leaveBanner) setRecover({ trigger: 'app_leave' });
            setLeaveBanner(null);
          }}
          onRecover={(distractionId) => setRecover({ distractionId, trigger: 'distraction' })}
        />
      )}
      {recover && (
        <QuickReset
          open
          goal={session.goal}
          sessionId={session.id}
          distractionId={recover.distractionId}
          trigger={recover.trigger}
          onClose={() => setRecover(null)}
          onResume={() => session.status !== 'active' && void act('resume')}
          onBreak={() => session.status === 'active' && void act('break')}
          onEnd={() => setEndAt(new Date(now))}
        />
      )}
      {endAt && (
        <EndSessionModal
          session={session}
          at={endAt}
          focusSeconds={focusTotal}
          onCancel={() => setEndAt(null)}
          onEnded={(s) => {
            setEndAt(null);
            void extensionShieldOff();
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
            onEnded(s);
          }}
        />
      )}
    </>
  );
}

/**
 * Phiên nghiêm ngặt: muốn kết thúc sớm phải GIỮ nút 3 giây – đủ để tự hỏi lại "mình có thật sự muốn dừng?".
 */
function HoldButton({ onDone, disabled }: { onDone: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOLD_MS = 3000;
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };
  const start = () => {
    if (disabled || timer.current) return;
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const p = (Date.now() - t0) / HOLD_MS;
      if (p >= 1) {
        stop();
        onDone();
      } else setProgress(p);
    }, 30);
  };
  useEffect(() => stop, []);
  return (
    <button
      className="btn danger lg"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && start()}
      onKeyUp={stop}
      style={{ position: 'relative', overflow: 'hidden', userSelect: 'none', touchAction: 'none' }}
      aria-label="Giữ 3 giây để kết thúc sớm"
    >
      <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${progress * 100}%`, background: 'rgba(184, 64, 47, .25)' }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="stop" size={16} /> {progress > 0 ? 'Giữ tiếp…' : 'Giữ 3 giây để kết thúc sớm'}
      </span>
    </button>
  );
}

function EndSessionModal({
  session,
  at,
  focusSeconds,
  onCancel,
  onEnded,
}: {
  session: FocusSession;
  at: Date;
  focusSeconds: number;
  onCancel: () => void;
  onEnded: (s: FocusSession) => void;
}) {
  const [goalAchieved, setGoalAchieved] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (abandon = false) => {
    setBusy(true);
    try {
      const { session: s } = await post<{ session: FocusSession }>(`/sessions/${session.id}/end`, {
        at: at.toISOString(),
        abandon,
        goalAchieved,
        rating,
        note,
        markTaskDone,
      });
      onEnded(s);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onCancel} title="Kết thúc phiên học">
      <div className="form">
        <p className="muted">
          Bạn đã tập trung <b style={{ color: 'var(--text)' }}>{fmtDuration(focusSeconds)}</b>. Mục tiêu: “{session.goal}”
        </p>
        <div className="field">
          Bạn đã đạt mục tiêu phiên học chưa?
          <div className="chips">
            {[
              [true, 'Đã đạt'],
              [false, 'Chưa đạt'],
            ].map(([v, l]) => (
              <button key={String(v)} type="button" className={`chip ${goalAchieved === v ? 'active' : ''}`} onClick={() => setGoalAchieved(v as boolean)}>
                {l as string}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          Mức độ tập trung tự đánh giá
          <div className="chips">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className={`chip ${rating === n ? 'active' : ''}`} onClick={() => setRating(n)}>
                {'★'.repeat(n)}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Ghi chú kết quả
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Đã học được gì? Còn vướng chỗ nào?" />
        </label>
        {session.task && (
          <label className="row">
            <input type="checkbox" checked={markTaskDone} onChange={(e) => setMarkTaskDone(e.target.checked)} /> Đánh dấu nhiệm vụ đã hoàn thành
          </label>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="row between">
          <button className="btn ghost" disabled={busy} onClick={() => submit(true)} title="Huỷ phiên (không tính vào thống kê hoàn thành)">
            Huỷ phiên
          </button>
          <div className="row">
            <button className="btn secondary" onClick={onCancel}>
              Học tiếp
            </button>
            <button className="btn" disabled={busy} onClick={() => submit(false)}>
              Lưu kết quả
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
