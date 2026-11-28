'use client';

/**
 * Chế độ giao diện: sáng / tối / theo hệ điều hành. Lưu ở trình duyệt (localStorage),
 * áp lên <html data-theme="light|dark">. Đoạn THEME_BOOT chạy trước khi trang vẽ để không bị nháy trắng.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'focusly_theme';

export const THEME_BOOT = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`;

export function getThemeMode(): ThemeMode {
  try {
    const m = localStorage.getItem(KEY);
    return m === 'light' || m === 'dark' ? m : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

export function applyTheme(mode: ThemeMode = getThemeMode()) {
  const dark = mode === 'dark' || (mode === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1120' : '#16203a');
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* chế độ riêng tư */
  }
  applyTheme(mode);
  window.dispatchEvent(new Event('focusly:theme'));
}

/** Theo dõi hệ điều hành đổi sáng/tối (khi đang chọn "Theo hệ thống") */
export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const on = () => getThemeMode() === 'system' && applyTheme('system');
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
