'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GUIDE } from '@/lib/guide';
import { LANG, tr } from '@/lib/i18n';
import { Icon } from '@/components/Icon';

/** Hướng dẫn sử dụng FOCUSLY: mục lục bên trái, nội dung từng tính năng bên phải */
export default function GuidePage() {
  const sections = GUIDE[LANG];
  const [active, setActive] = useState(sections[0].id);

  // tô mục lục theo phần đang đọc
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => Boolean(x));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tr('Hướng dẫn sử dụng')}</h1>
          <p className="muted">{tr('Mọi thứ bạn cần để học tập trung với FOCUSLY, từ phiên học đầu tiên tới các tính năng nâng cao.')}</p>
        </div>
      </div>

      <div className="guide">
        <nav className="guide-toc" aria-label={tr('Mục lục')}>
          <div className="small muted" style={{ padding: '0 10px 6px' }}>
            {tr('Mục lục')}
          </div>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'true' : undefined}>
              {s.title}
            </a>
          ))}
        </nav>

        <div className="guide-body">
          {sections.map((s) => (
            <section key={s.id} id={s.id} className="guide-section">
              <h2>
                <span className="guide-icon" aria-hidden>
                  <Icon name={s.icon} size={18} />
                </span>
                {s.title}
              </h2>
              <p className="guide-intro">{s.intro}</p>
              {s.steps && (
                <ol className="guide-steps">
                  {s.steps.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              )}
              {s.points.length > 0 && (
                <ul className="guide-points">
                  {s.points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              {s.tip && (
                <p className="guide-tip">
                  <b>{tr('Mẹo')}:</b> {s.tip}
                </p>
              )}
              {s.link && (
                <Link href={s.link.href} className="btn secondary sm">
                  {s.link.label} <Icon name="chevronRight" size={14} />
                </Link>
              )}
            </section>
          ))}
          <p className="small muted" style={{ marginTop: 8 }}>
            {tr('Vẫn còn thắc mắc? Hỏi Trợ lý AI ngay trong FOCUSLY.')}{' '}
            <Link href="/ai">{tr('Mở Trợ lý AI')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
