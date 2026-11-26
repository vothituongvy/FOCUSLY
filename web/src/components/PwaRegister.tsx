'use client';

import { useEffect } from 'react';

/** Đăng ký Service Worker (chỉ bản production để tránh cache khi dev) */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[pwa]', e));
  }, []);
  return null;
}
