import type { FocusSession, Segment } from '../types';

/**
 * Logic phiên học chạy cục bộ (giống hệt server) để UI phản hồi tức thì và hoạt động khi offline.
 * Server vẫn là nguồn sự thật: khi đồng bộ, bản server sẽ thay thế bản cục bộ.
 */

const iso = (d: Date) => d.toISOString();

export function segSeconds(s: Segment, nowMs: number) {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : nowMs;
  return Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
}

export function focusSeconds(s: Pick<FocusSession, 'segments'>, nowMs = Date.now()) {
  return s.segments.filter((x) => x.type === 'focus').reduce((a, x) => a + segSeconds(x, nowMs), 0);
}

export function breakSeconds(s: Pick<FocusSession, 'segments'>, nowMs = Date.now()) {
  return s.segments.filter((x) => x.type === 'break').reduce((a, x) => a + segSeconds(x, nowMs), 0);
}

function closeOpen(segments: Segment[], at: Date, reason: string): Segment[] {
  return segments.map((s, i) => (i === segments.length - 1 && !s.endedAt ? { ...s, endedAt: iso(at), endReason: reason } : s));
}

export function localPause(s: FocusSession, at: Date): FocusSession {
  if (s.status !== 'active') return s;
  return { ...s, status: 'paused', pauseCount: s.pauseCount + 1, segments: closeOpen(s.segments, at, 'pause') };
}

export function localResume(s: FocusSession, at: Date): FocusSession {
  if (s.status !== 'paused' && s.status !== 'on_break') return s;
  return {
    ...s,
    status: 'active',
    autoPausedAt: null,
    segments: [...closeOpen(s.segments, at, 'resume'), { type: 'focus', startedAt: iso(at), endedAt: null }],
  };
}

export function localBreak(s: FocusSession, at: Date): FocusSession {
  if (s.status !== 'active' && s.status !== 'paused') return s;
  const cycles = (s.pomodoro.completedCycles ?? 0) + (s.status === 'active' && s.mode === 'pomodoro' ? 1 : 0);
  return {
    ...s,
    status: 'on_break',
    pomodoro: { ...s.pomodoro, completedCycles: cycles },
    segments: [...closeOpen(s.segments, at, 'break'), { type: 'break', startedAt: iso(at), endedAt: null }],
  };
}

export function localEnd(
  s: FocusSession,
  at: Date,
  summary: { abandon?: boolean; goalAchieved?: boolean | null; rating?: number | null; note?: string },
): FocusSession {
  const segments = closeOpen(s.segments, at, 'end');
  const done = { ...s, segments };
  return {
    ...done,
    status: summary.abandon ? 'abandoned' : 'completed',
    endedAt: iso(at),
    actualFocusSeconds: Math.round(focusSeconds(done, at.getTime())),
    breakSeconds: Math.round(breakSeconds(done, at.getTime())),
    summary: { goalAchieved: summary.goalAchieved ?? null, rating: summary.rating ?? null, note: summary.note ?? '' },
  };
}

/** Thông tin Pomodoro / đếm ngược ở thời điểm hiện tại */
export function timerInfo(s: FocusSession, nowMs: number) {
  const segs = s.segments;
  const total = focusSeconds(s, nowMs);
  const lastBreak = segs.map((x) => x.type).lastIndexOf('break');
  const sinceBreak = segs
    .slice(lastBreak + 1)
    .filter((x) => x.type === 'focus')
    .reduce((a, x) => a + segSeconds(x, nowMs), 0);
  const cur = segs[segs.length - 1];
  const curSecs = cur && !cur.endedAt ? segSeconds(cur, nowMs) : 0;
  const p = s.pomodoro;
  const cycles = p.completedCycles ?? 0;
  const longBreak = cycles > 0 && cycles % p.cyclesBeforeLongBreak === 0;

  let target = 0;
  let elapsed = total;
  let label = 'Tập trung';
  if (s.status === 'on_break') {
    elapsed = curSecs;
    label = longBreak ? 'Nghỉ dài' : 'Nghỉ ngắn';
    if (s.mode === 'pomodoro') target = (longBreak ? p.longBreakMinutes : p.breakMinutes) * 60;
  } else if (s.mode === 'pomodoro') {
    target = p.focusMinutes * 60;
    elapsed = sinceBreak;
    label = `Pomodoro ${cycles + 1}`;
  } else if (s.mode === 'custom') {
    target = s.plannedMinutes * 60;
    label = 'Phiên tuỳ chỉnh';
  }
  const display = target ? Math.max(0, target - elapsed) : elapsed;
  const ratio = target ? Math.min(1, elapsed / target) : (elapsed % 3600) / 3600;
  return { total, target, elapsed, display, ratio, label, done: target > 0 && elapsed >= target };
}

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`;
}

export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
