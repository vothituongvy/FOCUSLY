import { Storage } from '@op-engineering/op-sqlite';
import EN from './i18n-en.json';

/**
 * Song ngữ Việt / Anh cho app (cùng từ điển với bản Web).
 * Ngôn ngữ đọc ĐỒNG BỘ lúc mở app (op-sqlite Storage) để cả các nhãn khai báo sẵn cũng đúng ngôn ngữ.
 */
export type Lang = 'vi' | 'en';

let store: Storage | null = null;
try {
  store = new Storage({ name: 'focusly-prefs' });
} catch {
  store = null;
}

function detect(): Lang {
  try {
    const v = store?.getItemSync('lang');
    if (v === 'en' || v === 'vi') return v;
  } catch {
    /* dùng mặc định */
  }
  return 'vi';
}

export let LANG: Lang = detect();
export let LOCALE = LANG === 'en' ? 'en-GB' : 'vi-VN';

const dict = EN as Record<string, string>;
const listeners = new Set<() => void>();

export function tr(vi: string, ...args: Array<string | number | null | undefined>): string {
  const s = LANG === 'en' ? (dict[vi] ?? vi) : vi;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? '')) : s;
}

export function setLang(lang: Lang) {
  try {
    store?.setItemSync('lang', lang);
  } catch {
    /* vẫn đổi trong phiên này */
  }
  LANG = lang;
  LOCALE = lang === 'en' ? 'en-GB' : 'vi-VN';
  listeners.forEach((f) => f());
}

export function onLangChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
