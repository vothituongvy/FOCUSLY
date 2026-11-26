'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { GoogleButton } from '@/components/GoogleButton';

export default function LoginPage() {
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <h2 style={{ textAlign: 'center' }}>Đăng nhập</h2>
      <label className="field">
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span className="row between">
          Mật khẩu <Link href="/forgot-password" className="small">Quên mật khẩu?</Link>
        </span>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn block" disabled={busy}>
        {busy ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
      <div className="divider">hoặc</div>
      <GoogleButton
        onCredential={async (token) => {
          try {
            await googleLogin(token);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      />
      <p className="small muted" style={{ textAlign: 'center' }}>
        Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
      </p>
    </form>
  );
}
