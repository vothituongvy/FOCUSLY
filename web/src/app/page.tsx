'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { tokens } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const { init } = useAuth();

  // Quyết định ngay theo phiên đã lưu, không chờ máy chủ trả lời:
  // có phiên -> vào thẳng /dashboard (trang trong tự kiểm tra lại), chưa có -> /login
  useEffect(() => {
    if (tokens.access || tokens.refresh) {
      router.replace('/dashboard');
      void init();
    } else {
      router.replace('/login');
    }
  }, [init, router]);

  return (
    <div className="center-page">
      <div className="spinner" />
    </div>
  );
}
