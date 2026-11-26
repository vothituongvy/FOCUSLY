'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    setError('');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token) return <p className="error-text">Liên kết không hợp lệ.</p>;
  if (done)
    return (
      <div className="col" style={{ textAlign: 'center' }}>
        <p className="success-text">Đặt lại mật khẩu thành công! Mọi thiết bị đã được đăng xuất.</p>
        <Link className="btn block" href="/login">
          Đăng nhập
        </Link>
      </div>
    );

  return (
    <form className="form" onSubmit={submit}>
      <h2 style={{ textAlign: 'center' }}>Đặt lại mật khẩu</h2>
      <label className="field">
        Mật khẩu mới
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label className="field">
        Nhập lại
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn block" disabled={busy}>
        Cập nhật mật khẩu
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
