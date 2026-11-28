'use client';

import { useEffect } from 'react';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

/** Áp lại chế độ giao diện sau khi tải trang và khi hệ điều hành đổi sáng/tối */
export function ThemeWatcher() {
  useEffect(() => {
    applyTheme();
    return watchSystemTheme();
  }, []);
  return null;
}
