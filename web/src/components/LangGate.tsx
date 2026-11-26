'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Máy chủ chỉ render tiếng Việt. Người chọn English: đợi tới khi chạy trên trình duyệt
 * mới hiện nội dung, để không lệch chữ giữa bản máy chủ và bản trình duyệt.
 */
export function LangGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready ? <>{children}</> : null;
}
