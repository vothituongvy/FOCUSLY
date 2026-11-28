'use client';

import { useEffect, useState } from 'react';
import { tr } from '@/lib/i18n';

/**
 * Báo "Đã có phiên bản FOCUSLY mới" khi web vừa được cập nhật mà tab này vẫn chạy bản cũ.
 * Kiểm tra mỗi 5 phút và mỗi khi quay lại tab.
 */
export function UpdateBanner() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine) return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch('/version', { cache: 'no-store' });
        const j = (await r.json()) as { id?: string };
        if (!stop && j.id && j.id !== mine) setFresh(true);
      } catch {
        /* mất mạng: bỏ qua */
      }
    };
    const t = setInterval(check, 5 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVis);
    void check();
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  if (!fresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>🎉 {tr('Đã có phiên bản FOCUSLY mới.')}</span>
      <button className="btn sm" onClick={() => location.reload()}>
        {tr('Tải lại để cập nhật')}
      </button>
      <button className="icon-btn" aria-label={tr('Để sau')} onClick={() => setFresh(false)}>
        ✕
      </button>
    </div>
  );
}
