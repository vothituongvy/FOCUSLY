import type { FocusSession, Segment } from './types';
import { LOCALE, tr } from '@/lib/i18n';

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDate(iso?: string | null, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return tr('vừa xong');
  if (diff < 3600) return tr('{0} phút trước', Math.floor(diff / 60));
  if (diff < 86400) return tr('{0} giờ trước', Math.floor(diff / 3600));
  return tr('{0} ngày trước', Math.floor(diff / 86400));
}

/** yyyy-mm-dd theo giờ máy */
export function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function toDateTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${toDateInput(iso)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromDateInput(v: string): string | null {
  if (!v) return null;
  return new Date(v.length <= 10 ? `${v}T00:00:00` : v).toISOString();
}

/**
 * Tính số giây focus/break ở thời điểm hiện tại dựa trên các segment server trả về.
 * `offsetMs` = serverTime - giờ máy client, để không bị lệch đồng hồ.
 */
export function liveSeconds(session: Pick<FocusSession, 'segments'>, offsetMs = 0, nowMs = Date.now()) {
  const now = nowMs + offsetMs;
  let focus = 0;
  let brk = 0;
  for (const seg of session.segments as Segment[]) {
    const end = seg.endedAt ? new Date(seg.endedAt).getTime() : now;
    const d = Math.max(0, end - new Date(seg.startedAt).getTime()) / 1000;
    if (seg.type === 'focus') focus += d;
    else brk += d;
  }
  const last = session.segments[session.segments.length - 1];
  const currentSegSeconds = last && !last.endedAt ? Math.max(0, now - new Date(last.startedAt).getTime()) / 1000 : 0;
  return { focus, brk, currentSegSeconds };
}

export const WEEKDAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
