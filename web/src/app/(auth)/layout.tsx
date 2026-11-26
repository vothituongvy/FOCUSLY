'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LangSwitch } from '@/components/LangSwitch';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { status, init } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'loading') void init();
  }, [status, init]);

  useEffect(() => {
    if (status === 'authed') router.replace('/dashboard');
  }, [status, router]);

  // Chỉ hiện form khi chắc chắn chưa đăng nhập; đang kiểm tra hoặc đã đăng nhập thì chỉ hiện vòng xoay
  // (tránh form đăng nhập nháy lên rồi mới chuyển vào Dashboard)
  if (status !== 'guest') {
    return (
      <div className="center-page">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <LangSwitch className="lang-switch-corner" />
      <div className="card auth-card">
        <div className="brand">
          <img src="/icons/logo-mark.png" alt="" className="brand-mark" width={30} height={30} /> <span className="brand-word">FOCUSLY</span>
        </div>
        <p className="muted small" style={{ textAlign: 'center', marginBottom: 20 }}>
          Learn with focus. Grow with consistency.
        </p>
        {children}
      </div>
    </div>
  );
}
