'use client';

import { ReactNode, useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width, color: 'var(--text)' }} role="dialog" aria-modal>
        {title && (
          <div className="row between" style={{ marginBottom: 16 }}>
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label} />
  );
}

export function Spinner() {
  return (
    <div className="center-page">
      <div className="spinner" />
    </div>
  );
}

export function Avatar({ name, url, size }: { name: string; url?: string | null; size?: 'lg' }) {
  if (url) return <img className={`avatar ${size ?? ''}`} src={url} alt={name} />;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return <div className={`avatar ${size ?? ''}`}>{initials || '?'}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}
