'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { get } from '@/lib/api';
import { tr } from '@/lib/i18n';
import type { Material, Task } from '@/lib/types';
import { Icon, type IconName } from './Icon';

interface Hit {
  id: string;
  label: string;
  sub?: string;
  icon: IconName;
  group: 'task' | 'material';
  href: string;
}

const STATUS: Record<string, string> = {
  todo: tr('Cần làm'),
  in_progress: tr('Đang học'),
  done: tr('Hoàn thành'),
  cancelled: tr('Đã huỷ'),
};

/**
 * Ô tìm kiếm ở thanh trên: gõ để tìm nhiệm vụ và tài liệu (cả trong nội dung PDF/văn bản).
 * ↑ ↓ để chọn, Enter để mở, Esc để đóng.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // màn hình nhỏ: ô tìm kiếm mở rộng ra cả thanh trên
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (term.length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      const [tasks, mats] = await Promise.all([
        get<{ items: Task[] }>(`/tasks?search=${encodeURIComponent(term)}&limit=6&sort=created`).catch(() => ({ items: [] as Task[] })),
        get<{ items: (Material & { snippet?: string })[] }>(`/materials/search?q=${encodeURIComponent(term)}`).catch(() => ({ items: [] as Material[] })),
      ]);
      setHits([
        ...tasks.items.slice(0, 6).map<Hit>((x) => ({
          id: `t-${x.id}`,
          label: x.title,
          sub: STATUS[x.status] ?? '',
          icon: x.status === 'done' ? 'check' : 'plan',
          group: 'task',
          href: x.status === 'done' || x.status === 'cancelled' ? '/plan' : `/focus?task=${x.id}`,
        })),
        ...mats.items.slice(0, 6).map<Hit>((m) => ({
          id: `m-${m.id}`,
          label: m.title,
          sub: (m as { snippet?: string }).snippet || m.category || '',
          icon: 'materials',
          group: 'material',
          href: `/materials/${m.id}`,
        })),
      ]);
      setSel(0);
      setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const go = (h: Hit) => {
    setOpen(false);
    setExpanded(false);
    setQ('');
    router.push(h.href);
  };

  const showPanel = open && term.length >= 2;

  return (
    <div ref={wrap} className={`search ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="icon-btn topbar-icon search-toggle"
        aria-label={tr('Tìm kiếm')}
        onClick={() => {
          setExpanded(true);
          setTimeout(() => input.current?.focus(), 0);
        }}
      >
        <Icon name="search" size={19} />
      </button>
      <div className="search-box">
        <Icon name="search" size={16} />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((s) => Math.min(hits.length - 1, s + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((s) => Math.max(0, s - 1));
            } else if (e.key === 'Enter' && hits[sel]) {
              e.preventDefault();
              go(hits[sel]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setExpanded(false);
              input.current?.blur();
            }
          }}
          placeholder={tr('Tìm nhiệm vụ, tài liệu…')}
          aria-label={tr('Tìm nhiệm vụ, tài liệu…')}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        {q && (
          <button
            type="button"
            className="icon-btn"
            aria-label={tr('Xoá nội dung tìm')}
            onClick={() => {
              setQ('');
              input.current?.focus();
            }}
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="search-panel" id="search-results" role="listbox">
          {busy && hits.length === 0 && <div className="search-empty">{tr('Đang tìm…')}</div>}
          {!busy && hits.length === 0 && <div className="search-empty">{tr('Không tìm thấy kết quả cho “{0}”.', term)}</div>}
          {(['task', 'material'] as const).map((g) => {
            const list = hits.filter((h) => h.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="search-group">{g === 'task' ? tr('Nhiệm vụ') : tr('Tài liệu')}</div>
                {list.map((h) => {
                  const i = hits.indexOf(h);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      role="option"
                      aria-selected={i === sel}
                      className={`search-item ${i === sel ? 'sel' : ''}`}
                      onMouseMove={() => setSel(i)}
                      onClick={() => go(h)}
                    >
                      <Icon name={h.icon} size={16} />
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="truncate" style={{ display: 'block' }}>
                          {h.label}
                        </span>
                        {h.sub && <span className="truncate small muted" style={{ display: 'block' }}>{h.sub}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
