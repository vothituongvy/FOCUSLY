'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { errorMessage, get, post } from '@/lib/api';
import { useNow, useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { tr } from '@/lib/i18n';
import { Avatar, Modal, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface Room {
  id: string;
  code: string;
  name: string;
  isOwner: boolean;
  focusMinutes: number;
  breakMinutes: number;
  runningSince: string | null;
  serverTime: string;
  members: { id: string; name: string; avatarUrl: string | null; online: boolean; owner: boolean; weekMinutes: number }[];
  messages: { user: string; name: string; text: string; at: string }[];
}

/** Giai đoạn đồng hồ tính ở máy khách (giống hệt công thức máy chủ) */
function phaseAt(runningSince: string | null, f: number, b: number, now: number) {
  if (!runningSince) return { phase: 'idle' as const, remaining: f * 60, round: 0, total: f * 60 };
  const elapsed = Math.max(0, Math.floor((now - new Date(runningSince).getTime()) / 1000));
  const cycle = (f + b) * 60;
  const pos = elapsed % cycle;
  const inFocus = pos < f * 60;
  return { phase: inFocus ? ('focus' as const) : ('break' as const), remaining: inFocus ? f * 60 - pos : cycle - pos, round: Math.floor(elapsed / cycle) + 1, total: inFocus ? f * 60 : b * 60 };
}
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const skew = useRef(0); // lệch giờ máy khách so với máy chủ
  const now = useNow(500);
  const lastPhase = useRef<string>('');

  const apply = useCallback((r: Room) => {
    skew.current = new Date(r.serverTime).getTime() - Date.now();
    setRoom(r);
  }, []);
  const load = useCallback(async () => {
    try {
      apply((await get<{ item: Room }>(`/social/rooms/${id}`)).item);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, apply]);

  useEffect(() => {
    void load();
    // báo "đang có mặt" mỗi 30 giây
    const ping = () => post<{ item: Room }>(`/social/rooms/${id}/ping`).then((r) => apply(r.item)).catch(() => undefined);
    void ping();
    const t = setInterval(ping, 30_000);
    return () => clearInterval(t);
  }, [id, load, apply]);
  useSocketEvent<{ id: string }>('room:update', (e) => e.id === id && void load());

  const p = room ? phaseAt(room.runningSince, room.focusMinutes, room.breakMinutes, now + skew.current) : null;

  // chuông + thông báo trình duyệt khi đổi giai đoạn
  useEffect(() => {
    if (!p) return;
    const key = `${p.phase}:${p.round}`;
    if (lastPhase.current && lastPhase.current !== key && p.phase !== 'idle') {
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.frequency.value = p.phase === 'focus' ? 660 : 880;
        o.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.25);
      } catch {
        /* trình duyệt chặn âm thanh */
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification(p.phase === 'focus' ? tr('Vào giờ tập trung!') : tr('Giờ nghỉ – đứng dậy vận động nhé'));
      }
    }
    lastPhase.current = key;
  }, [p?.phase, p?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, body?: unknown) => {
    setError('');
    try {
      apply((await post<{ item: Room }>(path, body)).item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!room) return error ? <p className="error-text">{error}</p> : <Spinner />;
  const pct = p ? 1 - p.remaining / p.total : 0;

  return (
    <div className="col" style={{ gap: 20 }}>
      <div className="page-header">
        <div>
          <Link href="/rooms" className="small">
            ← {tr('Phòng học chung')}
          </Link>
          <h1>{room.name}</h1>
          <p className="muted">
            {tr('Mã phòng')} <b className="tabular" style={{ letterSpacing: '.12em' }}>{room.code}</b> · {tr('{0} phút tập trung / {1} phút nghỉ', room.focusMinutes, room.breakMinutes)}
          </p>
        </div>
        <div className="row wrap">
          <button className="btn secondary" onClick={() => navigator.clipboard?.writeText(`${location.origin}/rooms?code=${room.code}`)}>
            <Icon name="link" size={16} /> {tr('Sao chép link mời')}
          </button>
          <button className="btn secondary" onClick={() => setInviteOpen(true)}>
            <Icon name="users" size={16} /> {tr('Mời bạn bè')}
          </button>
          <button className="btn ghost" onClick={() => confirm(tr('Rời phòng này?')) && post(`/social/rooms/${id}/leave`).then(() => router.push('/rooms'))}>
            {tr('Rời phòng')}
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div className="grid split-aside">
        <section className={`card room-timer ${p?.phase}`}>
          <div className="room-phase">{p?.phase === 'focus' ? tr('Đang tập trung · vòng {0}', p.round) : p?.phase === 'break' ? tr('Giờ nghỉ · vòng {0}', p.round) : tr('Đồng hồ chưa chạy')}</div>
          <div className="room-clock tabular" aria-live="polite">
            {mmss(p?.remaining ?? 0)}
          </div>
          <div className="progress" style={{ maxWidth: 420, width: '100%' }}>
            <span style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {room.runningSince ? (
              <button className="btn secondary" onClick={() => act(`/social/rooms/${id}/timer`, { action: 'stop' })}>
                <Icon name="stop" size={14} /> {tr('Dừng đồng hồ chung')}
              </button>
            ) : (
              <button
                className="btn marker lg"
                onClick={() => {
                  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
                  void act(`/social/rooms/${id}/timer`, { action: 'start' });
                }}
              >
                <Icon name="play" size={14} /> {tr('Bắt đầu cùng cả phòng')}
              </button>
            )}
            <Link href="/focus" className="btn ghost">
              {tr('Mở phiên tập trung của tôi')}
            </Link>
          </div>
          <p className="small muted" style={{ textAlign: 'center' }}>
            {tr('Mở thêm phiên tập trung của riêng bạn để phút học được tính vào chuỗi ngày và bảng xếp hạng.')}
          </p>
        </section>

        <section className="card col">
          <h3>{tr('Thành viên ({0})', room.members.length)}</h3>
          <div className="list">
            {room.members.map((m) => (
              <div key={m.id} className="list-item">
                <span className="presence-wrap">
                  <Avatar name={m.name} url={m.avatarUrl} />
                  <span className={`presence ${m.online ? 'on' : ''}`} aria-label={m.online ? tr('đang online') : tr('offline')} />
                </span>
                <span className="grow truncate">
                  {m.name} {m.owner && <span className="small muted">({tr('chủ phòng')})</span>}
                </span>
                <span className="small muted tabular">{tr('{0} phút/tuần', m.weekMinutes)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card col">
        <h3>{tr('Trò chuyện')}</h3>
        <div className="room-chat">
          {room.messages.length === 0 && <p className="small muted">{tr('Chào cả phòng một câu nhé!')}</p>}
          {room.messages.map((m, i) =>
            m.name ? (
              <div key={i} className="small">
                <b>{m.name}:</b> {m.text}
              </div>
            ) : (
              <div key={i} className="small muted">
                • {m.text}
              </div>
            ),
          )}
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void act(`/social/rooms/${id}/messages`, { text: text.trim() });
            setText('');
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Nhắn cho cả phòng… (giữ ngắn để không mất tập trung)')} maxLength={300} />
          <button className="btn" disabled={!text.trim()}>
            {tr('Gửi')}
          </button>
        </form>
      </section>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} roomId={id} />
    </div>
  );
}

function InviteModal({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId: string }) {
  const friends = useResource<{ items: { id: string; name: string; avatarUrl: string | null; status: string }[] }>(open ? '/social/friends' : null);
  const [sent, setSent] = useState<string[]>([]);
  const list = (friends.data?.items ?? []).filter((f) => f.status === 'accepted');
  return (
    <Modal open={open} onClose={onClose} title={tr('Mời bạn bè vào phòng')}>
      {list.length === 0 ? (
        <p className="muted">
          {tr('Bạn chưa có bạn bè.')} <Link href="/friends">{tr('Kết bạn')}</Link>
        </p>
      ) : (
        <div className="list">
          {list.map((f) => (
            <div key={f.id} className="list-item">
              <Avatar name={f.name} url={f.avatarUrl} />
              <span className="grow">{f.name}</span>
              <button className="btn sm" disabled={sent.includes(f.id)} onClick={() => post(`/social/rooms/${roomId}/invite`, { friendId: f.id }).then(() => setSent((s) => [...s, f.id]))}>
                {sent.includes(f.id) ? tr('Đã mời') : tr('Mời')}
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
