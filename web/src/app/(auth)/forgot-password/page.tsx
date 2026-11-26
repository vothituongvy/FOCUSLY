'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
      setMsg(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2 style={{ textAlign: 'center' }}>Quên mật khẩu</h2>
      <p className="muted small">Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
      <label className="field">
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {msg && <p className="success-text">{msg}</p>}
      {error && <p className="error-text">{error}</p>}
      <button className="btn block" disabled={busy}>
        {busy ? 'Đang gửi...' : 'Gửi liên kết'}
      </button>
      <p className="small" style={{ textAlign: 'center' }}>
        <Link href="/login">‹ Quay lại đăng nhập</Link>
      </p>
    </form>
  );
}
