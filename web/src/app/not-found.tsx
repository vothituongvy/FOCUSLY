import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="card col" style={{ maxWidth: 420, textAlign: 'center', alignItems: 'center' }}>
        <h1>404</h1>
        <p className="muted">Không tìm thấy trang bạn cần.</p>
        <Link href="/dashboard" className="btn">
          Về tổng quan
        </Link>
      </div>
    </div>
  );
}
