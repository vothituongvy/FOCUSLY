'use client';

import { useEffect, useState } from 'react';
import { getThemeMode, setThemeMode, watchSystemTheme, type ThemeMode } from '@/lib/theme';
import { tr } from '@/lib/i18n';

/** Nút chọn Sáng / Tối / Theo hệ thống */
export function ThemeSwitch() {
  const [mode, setMode] = useState<ThemeMode>('system');
  useEffect(() => {
    setMode(getThemeMode());
    const off = watchSystemTheme();
    const sync = () => setMode(getThemeMode());
    window.addEventListener('focusly:theme', sync);
    return () => {
      off();
      window.removeEventListener('focusly:theme', sync);
    };
  }, []);
  const opts: [ThemeMode, string, string][] = [
    ['light', '☀️', 'Sáng'],
    ['dark', '🌙', 'Tối'],
    ['system', '💻', 'Hệ thống'],
  ];
  return (
    <div className="seg theme-seg" role="radiogroup" aria-label={tr('Giao diện')}>
      {opts.map(([m, icon, label]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? 'on' : ''}
          onClick={(e) => {
            e.stopPropagation();
            setThemeMode(m);
            setMode(m);
          }}
          title={m === 'system' ? tr('Theo hệ điều hành') : tr(label)}
        >
          <span aria-hidden>{icon}</span> {tr(label)}
        </button>
      ))}
    </div>
  );
}
