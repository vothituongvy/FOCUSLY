'use client';

import { useEffect } from 'react';

/** Error boundary cho khu vực đã đăng nhập (Phase 4) */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ui]', error);
  }, [error]);
  return (
    <div className="center-page">
      <div className="card col" style={{ maxWidth: 460, textAlign: 'center', alignItems: 'center' }}>
        <h2>Đã có lỗi xảy ra</h2>
        <p className="muted small">{error.message || 'Lỗi không xác định'}</p>
        {error.digest && <p className="small muted">Mã lỗi: {error.digest}</p>}
        <div className="row">
          <button className="btn" onClick={reset}>
            Thử lại
          </button>
          <a className="btn secondary" href="/dashboard">
            Về tổng quan
          </a>
        </div>
      </div>
    </div>
  );
}
