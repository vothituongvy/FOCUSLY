'use client';

import Link from 'next/link';
import { ThemeSwitch } from './ThemeSwitch';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { get } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { LANG, setLang, tr, type Lang } from '@/lib/i18n';
import { Avatar } from './ui';
import { Icon } from './Icon';

/** Menu tài khoản ở góc phải thanh trên: hồ sơ, cài đặt, ngôn ngữ, đăng xuất */
export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // mục "Số liệu sử dụng" chỉ hiện với quản trị viên (ADMIN_EMAILS)
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    get<{ admin: boolean }>('/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const close = () => setOpen(false);

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={tr('Tài khoản')}>
        <Avatar name={user.name} url={user.avatarUrl} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <Avatar name={user.name} url={user.avatarUrl} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 700 }}>
                {user.name}
              </div>
              <div className="truncate small muted">{user.email}</div>
            </div>
          </div>
          <Link href="/settings" role="menuitem" className="menu-item" onClick={close}>
            <Icon name="settings" size={17} /> {tr('Hồ sơ & cài đặt')}
          </Link>
          <Link href="/settings?tab=shield" role="menuitem" className="menu-item" onClick={close}>
            <Icon name="shield" size={17} /> Focus Shield
          </Link>
          <Link href="/guide" role="menuitem" className="menu-item" onClick={close}>
            <Icon name="help" size={17} /> {tr('Hướng dẫn sử dụng')}
          </Link>
          <Link href="/feedback" role="menuitem" className="menu-item" onClick={close}>
            <Icon name="chat" size={17} /> {tr('Góp ý & báo lỗi')}
          </Link>
          {admin && (
            <Link href="/admin" role="menuitem" className="menu-item" onClick={close}>
              <Icon name="analytics" size={17} /> {tr('Thống kê hệ thống')}
            </Link>
          )}
          <Link href="/notifications" role="menuitem" className="menu-item" onClick={close}>
            <Icon name="bell" size={17} /> {tr('Thông báo')}
          </Link>
          <div className="menu-item menu-lang">
            <Icon name="globe" size={17} />
            <span className="grow">{tr('Ngôn ngữ')}</span>
            <span className="seg" role="radiogroup" aria-label={tr('Ngôn ngữ')}>
              {(['vi', 'en'] as Lang[]).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={LANG === l} className={LANG === l ? 'on' : ''} onClick={() => LANG !== l && setLang(l)}>
                  {l === 'vi' ? 'Tiếng Việt' : 'English'}
                </button>
              ))}
            </span>
          </div>
          <div className="menu-item menu-lang menu-theme">
            <span className="grow">{tr('Giao diện')}</span>
            <ThemeSwitch />
          </div>
          <div className="menu-sep" />
          <button
            role="menuitem"
            className="menu-item"
            onClick={async () => {
              close();
              disconnectSocket();
              await logout();
              router.replace('/login');
            }}
          >
            <Icon name="logout" size={17} /> {tr('Đăng xuất')}
          </button>
        </div>
      )}
    </div>
  );
}
