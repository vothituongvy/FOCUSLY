import Link from 'next/link';
import { tr } from '@/lib/i18n';

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="card col" style={{ maxWidth: 420, textAlign: 'center', alignItems: 'center' }}>
        <h1>404</h1>
        <p className="muted">{tr('Không tìm thấy trang bạn cần.')}</p>
        <Link href="/dashboard" className="btn">
          {tr('Về tổng quan')}
        </Link>
      </div>
    </div>
  );
}
