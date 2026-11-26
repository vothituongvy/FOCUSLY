import { tr } from '@/lib/i18n';
/** Bản sao SM-2 phía client để hiển thị "ôn lại sau bao lâu" trên nút chấm điểm (server vẫn tính chính thức) */
export const GRADES = [
  { key: 'again', label: tr('Quên'), grade: 1, hotkey: '1' },
  { key: 'hard', label: tr('Khó'), grade: 3, hotkey: '2' },
  { key: 'good', label: tr('Nhớ'), grade: 4, hotkey: '3' },
  { key: 'easy', label: tr('Dễ'), grade: 5, hotkey: '4' },
] as const;

export function previewInterval(srs: { ease?: number; interval?: number; repetitions?: number } | undefined, q: number): string {
  if (q < 3) return tr('10 phút');
  const ease = Math.max(1.3, (srs?.ease ?? 2.5) + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const rep = (srs?.repetitions ?? 0) + 1;
  let interval: number;
  if (rep === 1) interval = q === 5 ? 3 : 1;
  else if (rep === 2) interval = q === 5 ? 8 : 6;
  else interval = Math.round((srs?.interval ?? 1) * ease * (q === 3 ? 0.85 : q === 5 ? 1.3 : 1));
  interval = Math.max(1, interval);
  if (interval >= 365) return tr('{0} năm', (interval / 365).toFixed(1));
  if (interval >= 30) return tr('{0} tháng', Math.round(interval / 30));
  return tr('{0} ngày', interval);
}
