'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/sentry';

/** Bắt lỗi JavaScript chưa xử lý trên trình duyệt và gửi lên Sentry (nếu đã cấu hình) */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => captureException(e.error ?? e.message, { kind: 'window.onerror' });
    const onRejection = (e: PromiseRejectionEvent) => {
      // lỗi API (mạng, 4xx) đã được hiện cho người dùng -> không báo
      if ((e.reason as { status?: number })?.status) return;
      captureException(e.reason, { kind: 'unhandledrejection' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
