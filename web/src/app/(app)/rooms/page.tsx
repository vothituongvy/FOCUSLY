'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { errorMessage, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Empty, Spinner } from '@/components/ui';

interface RoomItem {
  id: string;
  name: string;
  code: string;
  members: number;
  online: number;
  timer: { phase: 'idle' | 'focus' | 'break'; remainingSec: number };
}

export default function RoomsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Rooms />
    </Suspense>
  );
}

function Rooms() {
  const router = useRouter();
  const params = useSearchParams();
  const list = useResource<{ items: RoomItem[] }>('/social/rooms');
  const [name, setName] = useState('');
  const [focus, setFocus] = useState(25);
  const [brk, setBrk] = useState(5);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<{ item: { id: string } }>) => {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      router.push(`/rooms/${r.item.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  // mở từ thông báo mời: /rooms?code=ABC123 -> vào phòng luôn
  useEffect(() => {
    const c = params.get('code');
    if (c) void go(() => post('/social/rooms/join', { code: c }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Phòng học chung')}</h1>
          <p className="muted">{tr('Cả phòng chạy chung một đồng hồ Pomodoro: cùng tập trung, cùng nghỉ. Gửi mã phòng cho bạn bè để học cùng.')}</p>
        </div>
      </div>

      <div className="grid grid-2">
        <form
          className="card col"
          onSubmit={(e) => {
            e.preventDefault();
            void go(() => post('/social/rooms', { name: name.trim() || tr('Phòng học'), focusMinutes: focus, breakMinutes: brk }));
          }}
        >
          <h3>{tr('Tạo phòng mới')}</h3>
          <label className="field">
            {tr('Tên phòng')}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('VD: Ôn thi Toán 12A1')} maxLength={80} />
          </label>
          <div className="row">
            <label className="field grow">
              {tr('Tập trung (phút)')}
              <input type="number" min={5} max={120} value={focus} onChange={(e) => setFocus(Number(e.target.value))} />
            </label>
            <label className="field grow">
              {tr('Nghỉ (phút)')}
              <input type="number" min={1} max={60} value={brk} onChange={(e) => setBrk(Number(e.target.value))} />
            </label>
          </div>
          <button className="btn" disabled={busy}>
            {tr('Tạo phòng')}
          </button>
        </form>

        <form
          className="card col"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void go(() => post('/social/rooms/join', { code: code.trim() }));
          }}
        >
          <h3>{tr('Vào phòng bằng mã')}</h3>
          <label className="field">
            {tr('Mã phòng')}
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={12} className="code-input" />
          </label>
          <button className="btn secondary" disabled={busy || !code.trim()}>
            {tr('Vào phòng')}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>

      <section className="card col">
        <h3>{tr('Phòng của bạn')}</h3>
        {!list.data ? (
          <Spinner />
        ) : list.data.items.length === 0 ? (
          <Empty>{tr('Bạn chưa ở phòng nào. Tạo một phòng hoặc nhập mã bạn bè gửi.')}</Empty>
        ) : (
          <div className="list">
            {list.data.items.map((r) => (
              <Link key={r.id} href={`/rooms/${r.id}`} className="list-item" style={{ color: 'inherit' }}>
                <span className="grow col" style={{ gap: 2 }}>
                  <b>{r.name}</b>
                  <span className="small muted">
                    {tr('Mã {0}', r.code)} · {tr('{0} thành viên', r.members)} · {tr('{0} đang online', r.online)}
                  </span>
                </span>
                <span className={`badge ${r.timer.phase === 'focus' ? 'in_progress' : r.timer.phase === 'break' ? 'done' : ''}`}>
                  {r.timer.phase === 'focus' ? tr('đang tập trung') : r.timer.phase === 'break' ? tr('đang nghỉ') : tr('chưa chạy')}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
