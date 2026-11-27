/**
 * Tiện ích thời gian theo múi giờ người dùng (không cần thư viện ngoài).
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getParts(date: Date, timeZone: string) {
  let fmt = dtfCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    dtfCache.set(timeZone, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return parts;
}

export function safeTimeZone(tz?: string | null): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** "YYYY-MM-DD" theo múi giờ */
export function dayKey(date: Date, timeZone: string): string {
  const p = getParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function weekdayIn(date: Date, timeZone: string): number {
  return WEEKDAYS[getParts(date, timeZone).weekday] ?? 0;
}

/** Số phút tính từ 00:00 theo múi giờ */
export function minutesOfDay(date: Date, timeZone: string): number {
  const p = getParts(date, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function hourIn(date: Date, timeZone: string): number {
  return Number(getParts(date, timeZone).hour);
}

export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Danh sách N dayKey gần nhất (kết thúc ở ngày của `end`) */
export function lastDayKeys(n: number, timeZone: string, end = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(end.getTime() - i * 86_400_000), timeZone));
  }
  // loại trùng do DST (hiếm)
  return [...new Set(keys)];
}

/** Khoảng UTC đủ rộng để chứa N ngày gần nhất ở mọi múi giờ (lọc lại bằng dayKey) */
export function wideRange(days: number, end = new Date()) {
  return {
    from: new Date(end.getTime() - (days + 1) * 86_400_000),
    to: new Date(end.getTime() + 86_400_000),
  };
}

export function isWithinSchedule(
  now: Date,
  timeZone: string,
  schedule: { days: number[]; start: string; end: string; enabled?: boolean | null }[],
): boolean {
  const wd = weekdayIn(now, timeZone);
  const mins = minutesOfDay(now, timeZone);
  return schedule.some((s) => {
    if (s.enabled === false) return false;
    const start = parseHm(s.start);
    const end = parseHm(s.end);
    if (start <= end) return s.days.includes(wd) && mins >= start && mins < end;
    // khung giờ qua nửa đêm (vd 22:00 - 01:00)
    const prevWd = (wd + 6) % 7;
    return (s.days.includes(wd) && mins >= start) || (s.days.includes(prevWd) && mins < end);
  });
}

/** Mốc UTC của "YYYY-MM-DD HH:mm" theo giờ địa phương của múi giờ */
export function zonedDate(ymd: string, hm: string, timeZone: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  const target = parseHm(hm);
  let t = Date.UTC(y, mo - 1, d, Math.floor(target / 60), target % 60);
  for (let i = 0; i < 2; i++) {
    const at = new Date(t);
    const dayDiff = Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${dayKey(at, timeZone)}T00:00:00Z`)) / 60000);
    const diff = dayDiff + target - minutesOfDay(at, timeZone);
    t += diff * 60000;
  }
  return new Date(t);
}
