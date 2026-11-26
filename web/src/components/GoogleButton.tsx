'use client';

import { useEffect, useRef, useState } from 'react';
import { tr } from '@/lib/i18n';

// trim(): giá trị dán vào Vercel hay dính dấu xuống dòng ở cuối -> Google báo invalid_client
const CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();

interface GoogleId {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

/** Nút "Đăng nhập bằng Google" (Google Identity Services) -> trả về ID token */
export function GoogleButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    const render = () => {
      if (!window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => cbRef.current(r.credential) });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 340, text: 'continue_with' });
      setReady(true);
    };
    if (window.google) return render();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, []);

  if (!CLIENT_ID) {
    return (
      <button className="btn secondary block" type="button" disabled title={tr('Cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID để bật')}>
        {tr('Đăng nhập bằng Google (chưa cấu hình)')}
      </button>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }}>
      <div ref={ref} />
      {!ready && <span className="muted small">{tr('Đang tải Google...')}</span>}
    </div>
  );
}
