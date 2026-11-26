'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

/** Ô mật khẩu có nút con mắt để hiện / ẩn */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw-wrap">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShown(!shown)}
        aria-label={shown ? tr('Ẩn mật khẩu') : tr('Hiện mật khẩu')}
        aria-pressed={shown}
        title={shown ? tr('Ẩn mật khẩu') : tr('Hiện mật khẩu')}
      >
        <Icon name={shown ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </span>
  );
}
