'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { del, errorMessage, patch, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { tr } from '@/lib/i18n';
import { Avatar, Empty, Spinner, Toggle } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: 'outgoing' | 'incoming' | 'accepted';
  buddy: boolean;
  buddyOfMe: boolean;
}
interface Board {
  weekStart: string;
  rows: { id: string; name: string; avatarUrl: string | null; me: boolean; minutes: number; streak: number; studyingNow: boolean; rank: number }[];
}

const CHEERS = ['Cố lên nhé! 💪', 'Vào phòng học chung không?', 'Học 25 phút cùng mình nhé!', 'Giỏi lắm, giữ chuỗi nha 🔥'];

export default function FriendsPage() {
  const router = useRouter();
  const friends = useResource<{ code: string; items: Friend[] }>('/social/friends');
  const board = useResource<Board>('/social/leaderboard', ['sessions']);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [cheerFor, setCheerFor] = useState<string | null>(null);
  useSocketEvent('friends:changed', () => {
    void friends.reload();
    void board.reload();
  });

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError('');
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
      await Promise.all([friends.reload(), board.reload()]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const items = friends.data?.items ?? [];
  const accepted = items.filter((f) => f.status === 'accepted');
  const incoming = items.filter((f) => f.status === 'incoming');
  const outgoing = items.filter((f) => f.status === 'outgoing');
  const max = Math.max(1, ...(board.data?.rows.map((r) => r.minutes) ?? [1]));

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Bạn bè & xếp hạng')}</h1>
          <p className="muted">{tr('Học cùng bạn bè: so phút tập trung mỗi tuần, chọn bạn đồng hành để được nhắc khi bỏ dở phiên.')}</p>
        </div>
        <Link href="/rooms" className="btn secondary">
          <Icon name="room" size={16} /> {tr('Phòng học chung')}
        </Link>
      </div>

      <div className="grid split-aside">
        <section className="card col" aria-label={tr('Bảng xếp hạng tuần')}>
          <div className="card-title">
            <h3>{tr('Bảng xếp hạng tuần này')}</h3>
            {board.data && <span className="small muted">{tr('Từ thứ Hai {0}', board.data.weekStart)}</span>}
          </div>
          {!board.data ? (
            <Spinner />
          ) : board.data.rows.length <= 1 ? (
            <Empty>{tr('Kết bạn bằng mã bên cạnh để cùng thi đua phút tập trung mỗi tuần.')}</Empty>
          ) : (
            <ol className="leaderboard">
              {board.data.rows.map((r) => (
                <li key={r.id} className={r.me ? 'me' : ''}>
                  <span className={`rank r${r.rank}`}>{r.rank}</span>
                  <Avatar name={r.name} url={r.avatarUrl} />
                  <span className="grow col" style={{ gap: 4, minWidth: 0 }}>
                    <span className="row" style={{ gap: 6 }}>
                      <b className="truncate">{r.me ? tr('Bạn') : r.name}</b>
                      {r.studyingNow && <span className="badge in_progress">{tr('đang học')}</span>}
                    </span>
                    <span className="bar">
                      <span style={{ width: `${(r.minutes / max) * 100}%` }} />
                    </span>
                  </span>
                  <span className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
                    <b className="tabular">{tr('{0} phút', r.minutes)}</b>
                    <span className="small muted">🔥 {r.streak}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="col" style={{ gap: 16 }}>
          <section className="card col">
            <h3>{tr('Kết bạn')}</h3>
            <div className="small muted">{tr('Mã của bạn – gửi cho bạn bè để họ thêm bạn:')}</div>
            <div className="row">
              <code className="friend-code">{friends.data?.code ?? '······'}</code>
              <button className="btn secondary sm" onClick={() => friends.data && navigator.clipboard?.writeText(friends.data.code).then(() => setMsg(tr('Đã sao chép mã')))}>
                <Icon name="copy" size={14} /> {tr('Sao chép')}
              </button>
            </div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) void run(() => post('/social/friends', { code: code.trim() }).then(() => setCode('')), tr('Đã gửi lời mời kết bạn'));
              }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={tr('Nhập mã của bạn bè')} maxLength={12} />
              <button className="btn" disabled={!code.trim()}>
                {tr('Thêm')}
              </button>
            </form>
            {msg && <p className="success-text">{msg}</p>}
            {error && <p className="error-text">{error}</p>}
          </section>

          {incoming.length > 0 && (
            <section className="card col">
              <h3>{tr('Lời mời kết bạn')}</h3>
              {incoming.map((f) => (
                <div key={f.id} className="row">
                  <Avatar name={f.name} url={f.avatarUrl} />
                  <span className="grow truncate">{f.name}</span>
                  <button className="btn sm" onClick={() => run(() => post(`/social/friends/${f.id}/accept`))}>
                    {tr('Đồng ý')}
                  </button>
                  <button className="btn ghost sm" onClick={() => run(() => del(`/social/friends/${f.id}`))}>
                    {tr('Bỏ qua')}
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      <section className="card col">
        <div className="card-title">
          <h3>{tr('Bạn bè ({0})', accepted.length)}</h3>
          <span className="small muted">
            {tr('Bật “Bạn đồng hành”: người đó nhận thông báo khi bạn bỏ dở một phiên học – để họ kéo bạn quay lại.')}
          </span>
        </div>
        {!friends.data ? (
          <Spinner />
        ) : accepted.length === 0 && outgoing.length === 0 ? (
          <Empty>{tr('Chưa có bạn bè. Gửi mã của bạn để bắt đầu.')}</Empty>
        ) : (
          <div className="list">
            {accepted.map((f) => (
              <div key={f.id} className="list-item wrap">
                <Avatar name={f.name} url={f.avatarUrl} />
                <span className="grow col" style={{ gap: 2, minWidth: 140 }}>
                  <b className="truncate">{f.name}</b>
                  {f.buddyOfMe && <span className="small muted">{tr('Đang là bạn đồng hành của bạn')}</span>}
                </span>
                <label className="row small" style={{ gap: 8 }}>
                  {tr('Bạn đồng hành')}
                  <Toggle on={f.buddy} onChange={(v) => run(() => patch(`/social/friends/${f.id}`, { buddy: v }))} label={tr('Bạn đồng hành')} />
                </label>
                <button className="btn sm" onClick={() => run(() => post<{ item: { id: string } }>('/chats/direct', { friendId: f.id }).then((r) => router.push(`/messages?chat=${r.item.id}`)))}>
                  <Icon name="chat" size={14} /> {tr('Nhắn tin')}
                </button>
                <button className="btn secondary sm" onClick={() => setCheerFor(cheerFor === f.id ? null : f.id)}>
                  {tr('Động viên')}
                </button>
                <button className="icon-btn" title={tr('Huỷ kết bạn')} onClick={() => confirm(tr('Huỷ kết bạn với {0}?', f.name)) && run(() => del(`/social/friends/${f.id}`))}>
                  ✕
                </button>
                {cheerFor === f.id && (
                  <div className="chips" style={{ width: '100%' }}>
                    {CHEERS.map((c) => (
                      <button key={c} className="chip" onClick={() => run(() => post(`/social/friends/${f.id}/cheer`, { text: tr(c) }).then(() => setCheerFor(null)), tr('Đã gửi tới {0}', f.name))}>
                        {tr(c)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {outgoing.map((f) => (
              <div key={f.id} className="list-item">
                <Avatar name={f.name} url={f.avatarUrl} />
                <span className="grow truncate">{f.name}</span>
                <span className="badge">{tr('đã gửi lời mời')}</span>
                <button className="icon-btn" title={tr('Huỷ lời mời')} onClick={() => run(() => del(`/social/friends/${f.id}`))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
