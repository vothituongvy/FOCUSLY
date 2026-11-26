import EN from './i18n-en.json';

/**
 * Song ngữ Việt / Anh.
 * Chuỗi gốc tiếng Việt chính là khoá: tr('Lưu') → "Save" khi chọn English.
 * Ngôn ngữ lưu trong cookie `focusly_lang`; đổi ngôn ngữ sẽ tải lại trang.
 */
export type Lang = 'vi' | 'en';
export const LANG_COOKIE = 'focusly_lang';

function detect(): Lang {
  if (typeof document === 'undefined') return 'vi'; // máy chủ luôn render tiếng Việt (bản English chỉ render ở trình duyệt)
  const m = document.cookie.match(/(?:^|;\s*)focusly_lang=(en|vi)/);
  return (m?.[1] as Lang) ?? 'vi';
}

export const LANG: Lang = detect();
/** Locale cho ngày giờ/số */
export const LOCALE = LANG === 'en' ? 'en-GB' : 'vi-VN';

const dict = EN as Record<string, string>;

export function tr(vi: string, ...args: Array<string | number | null | undefined>): string {
  const s = LANG === 'en' ? (dict[vi] ?? vi) : vi;
  return args.length ? s.replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? '')) : s;
}

export function setLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
