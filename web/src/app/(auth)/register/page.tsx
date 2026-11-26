'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { GoogleButton } from '@/components/GoogleButton';
import { tr } from '@/lib/i18n';
import { PasswordInput } from '@/components/PasswordInput';

export default function RegisterPage() {
  const { register, googleLogin } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError(tr('Mật khẩu nhập lại không khớp'));
    if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password) || form.password.length < 8) {
      return setError(tr('Mật khẩu tối thiểu 8 ký tự, gồm chữ và số'));
    }
    setBusy(true);
    try {
      await register(form.name, form.email, form.password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="form" onSubmit={submit}>
      <h2 style={{ textAlign: 'center' }}>{tr('Tạo tài khoản')}</h2>
      <label className="field">
        {tr('Họ tên')}
        <input required value={form.name} onChange={set('name')} autoComplete="name" />
      </label>
      <label className="field">
        Email
        <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
      </label>
      <label className="field">
        {tr('Mật khẩu')}
        <PasswordInput required value={form.password} onChange={set('password')} autoComplete="new-password" />
      </label>
      <label className="field">
        {tr('Nhập lại mật khẩu')}
        <PasswordInput required value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn block" disabled={busy}>
        {busy ? tr('Đang tạo...') : tr('Đăng ký')}
      </button>
      <div className="divider">{tr('hoặc')}</div>
      <GoogleButton
        onCredential={async (t) => {
          try {
            await googleLogin(t);
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      />
      <p className="small muted" style={{ textAlign: 'center' }}>
        {tr('Đã có tài khoản?')}{' '}<Link href="/login">{tr('Đăng nhập')}</Link>
      </p>
    </form>
  );
}
