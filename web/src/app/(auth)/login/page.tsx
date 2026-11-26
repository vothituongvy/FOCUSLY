'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { GoogleButton } from '@/components/GoogleButton';
import { tr } from '@/lib/i18n';
import { PasswordInput } from '@/components/PasswordInput';

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
      <h2 style={{ textAlign: 'center' }}>{tr('Đăng nhập')}</h2>
      <label className="field">
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label className="field">
        <span className="row between">
          {tr('Mật khẩu')}{' '}<Link href="/forgot-password" className="small">{tr('Quên mật khẩu?')}</Link>
        </span>
        <PasswordInput required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn block" disabled={busy}>
        {busy ? tr('Đang đăng nhập...') : tr('Đăng nhập')}
      </button>
      <div className="divider">{tr('hoặc')}</div>
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
        {tr('Chưa có tài khoản?')}{' '}<Link href="/register">{tr('Đăng ký')}</Link>
      </p>
    </form>
  );
}
