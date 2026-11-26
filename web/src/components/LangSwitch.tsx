'use client';

import { LANG, setLang, type Lang } from '@/lib/i18n';

const OPTIONS: { id: Lang; label: string; title: string }[] = [
  { id: 'vi', label: 'VI', title: 'Tiếng Việt' },
  { id: 'en', label: 'EN', title: 'English' },
];

/** Nút đổi ngôn ngữ giao diện Tiếng Việt / English */
export function LangSwitch({ className = '' }: { className?: string }) {
  return (
    <div className={`lang-switch ${className}`} role="radiogroup" aria-label="Ngôn ngữ / Language">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={LANG === o.id}
          title={o.title}
          className={LANG === o.id ? 'on' : ''}
          onClick={() => LANG !== o.id && setLang(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
