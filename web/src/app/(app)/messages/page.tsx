'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, del, errorMessage, get, patch, post } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useSocketEvent } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { tr } from '@/lib/i18n';
import { Avatar, Empty, Modal, Spinner, Toggle } from '@/components/ui';
import { Icon } from '@/components/Icon';

interface ChatMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  admin: boolean;
  lastReadAt: string;
}
interface ChatItem {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatarUrl: string | null;
  members: ChatMember[];
  isAdmin: boolean;
  muted: boolean;
  unread: number;
  lastMessage: { text: string; at: string; mine: boolean; senderName: string } | null;
}
interface Msg {
  id: string;
  sender: string | null;
  text: string;
  at: string;
  clientId?: string;
  pending?: boolean;
  failed?: boolean;
}
interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: string;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'numeric' });
};

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Messages />
    </Suspense>
  );
}

function Messages() {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get('chat');
  const list = useResource<{ items: ChatItem[] }>('/chats');
  const [newOpen, setNewOpen] = useState<'' | 'direct' | 'group'>('');
  const shellRef = useRef<HTMLDivElement>(null);

  // vừa khít màn hình như khung chat AI
  useEffect(() => {
    const fit = () => {
      const el = shellRef.current;
      if (!el) return;
      el.style.height = `${Math.max(440, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 20)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useSocketEvent('chat:message', () => void list.reload());
  useSocketEvent('chat:changed', () => void list.reload());
  useSocketEvent('chat:read', () => void list.reload());

  const open = (id: string) => router.replace(`/messages?chat=${id}`);
  const items = list.data?.items ?? [];

  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Tin nhắn')}</h1>
          <p className="muted">{tr('Nhắn riêng hoặc lập nhóm học với bạn bè. Trong phiên tập trung, tin nhắn không làm phiền bạn (đổi trong Cài đặt → Thông báo).')}</p>
        </div>
        <div className="row wrap">
          <button className="btn secondary" onClick={() => setNewOpen('direct')}>
            <Icon name="chat" size={16} /> {tr('Nhắn bạn bè')}
          </button>
          <button className="btn" onClick={() => setNewOpen('group')}>
            <Icon name="users" size={16} /> {tr('Tạo nhóm')}
          </button>
        </div>
      </div>

      <div className={`grid split-side chat-shell msg-shell ${active ? 'has-thread' : ''}`} ref={shellRef}>
        <div className="card col chat-list msg-list">
          {!list.data ? (
            <Spinner />
          ) : items.length === 0 ? (
            <Empty>
              {tr('Chưa có cuộc trò chuyện nào.')} <Link href="/friends">{tr('Kết bạn')}</Link>
            </Empty>
          ) : (
            items.map((c) => (
              <button key={c.id} className={`msg-row ${active === c.id ? 'active' : ''}`} onClick={() => open(c.id)}>
                <ChatAvatar chat={c} />
                <span className="grow col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="row between" style={{ gap: 6 }}>
                    <b className="truncate">{c.name}</b>
                    {c.lastMessage && <span className="small muted">{timeLabel(c.lastMessage.at)}</span>}
                  </span>
                  <span className="row between" style={{ gap: 6 }}>
                    <span className={`small truncate ${c.unread ? '' : 'muted'}`} style={{ fontWeight: c.unread ? 700 : 400 }}>
                      {c.lastMessage ? `${c.lastMessage.mine ? tr('Bạn: ') : c.type === 'group' && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(' ').pop()}: ` : ''}${c.lastMessage.text}` : tr('Chưa có tin nhắn')}
                    </span>
                    {c.muted ? <span title={tr('Đã tắt thông báo')}>🔕</span> : c.unread > 0 && <span className="nav-badge" style={{ order: 0 }}>{c.unread}</span>}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
        <div className="card col chat-panel msg-thread">
          {active ? (
            <Thread key={active} chatId={active} onBack={() => router.replace('/messages')} onChanged={() => list.reload()} />
          ) : (
            <div className="center-page col" style={{ gap: 10, textAlign: 'center' }}>
              <Icon name="chat" size={40} />
              <p className="muted">{tr('Chọn một cuộc trò chuyện hoặc nhắn cho bạn bè.')}</p>
            </div>
          )}
        </div>
      </div>

      <NewChatModal mode={newOpen} onClose={() => setNewOpen('')} onCreated={(id) => (setNewOpen(''), void list.reload(), open(id))} />
    </div>
  );
}

function ChatAvatar({ chat }: { chat: ChatItem }) {
  if (chat.type === 'direct') return <Avatar name={chat.name} url={chat.avatarUrl} />;
  return (
    <span className="group-avatar" aria-hidden>
      <Icon name="users" size={18} />
    </span>
  );
}

function Thread({ chatId, onBack, onChanged }: { chatId: string; onBack: () => void; onChanged: () => void }) {
  const me = useAuth((s) => s.user?.id);
  const [chat, setChat] = useState<ChatItem | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // đang ở cuối -> tự cuộn khi có tin mới

  const markRead = useCallback(() => {
    if (document.visibilityState === 'visible') void post(`/chats/${chatId}/read`).catch(() => undefined);
  }, [chatId]);

  const load = useCallback(async () => {
    try {
      const r = await get<{ chat: ChatItem; items: Msg[]; hasMore: boolean }>(`/chats/${chatId}/messages`);
      setChat(r.chat);
      setMsgs(r.items);
      setHasMore(r.hasMore);
      stick.current = true;
      markRead();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [chatId, markRead]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs.length]);
  useEffect(() => {
    const onVis = () => markRead();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [markRead]);

  useSocketEvent<{ chatId: string; message: Msg }>('chat:message', (e) => {
    if (e.chatId !== chatId) return;
    setMsgs((cur) => (cur.some((m) => m.id === e.message.id || (e.message.clientId && m.clientId === e.message.clientId)) ? cur.map((m) => (m.clientId && m.clientId === e.message.clientId ? e.message : m)) : [...cur, e.message]));
    if (e.message.sender !== me) markRead();
  });
  useSocketEvent<{ chatId: string; userId: string; at: string }>('chat:read', (e) => {
    if (e.chatId !== chatId) return;
    setChat((c) => (c ? { ...c, members: c.members.map((m) => (m.id === e.userId ? { ...m, lastReadAt: e.at } : m)) } : c));
  });
  useSocketEvent<{ chatId: string }>('chat:changed', (e) => e.chatId === chatId && void load());
  useSocketEvent<{ chatId: string; messageId: string }>('chat:deleted', (e) => e.chatId === chatId && setMsgs((cur) => cur.filter((m) => m.id !== e.messageId)));

  const older = async () => {
    const first = msgs[0];
    if (!first) return;
    const r = await get<{ items: Msg[]; hasMore: boolean }>(`/chats/${chatId}/messages?before=${encodeURIComponent(first.at)}`);
    stick.current = false;
    setMsgs((cur) => [...r.items, ...cur]);
    setHasMore(r.hasMore);
  };

  const send = async (body = text.trim(), retry?: Msg) => {
    if (!body) return;
    setError('');
    const clientId = retry?.clientId ?? `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const temp: Msg = { id: clientId, clientId, sender: me ?? null, text: body, at: new Date().toISOString(), pending: true };
    stick.current = true;
    setMsgs((cur) => (retry ? cur.map((m) => (m.clientId === clientId ? temp : m)) : [...cur, temp]));
    if (!retry) setText('');
    try {
      const r = await post<{ item: Msg }>(`/chats/${chatId}/messages`, { text: body, clientId });
      setMsgs((cur) => (cur.some((m) => m.id === r.item.id) ? cur.filter((m) => m.clientId !== clientId || m.id === r.item.id) : cur.map((m) => (m.clientId === clientId ? r.item : m))));
      onChanged();
    } catch (e) {
      setMsgs((cur) => cur.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
      setError(errorMessage(e));
    }
  };

  if (!chat) return error ? <p className="error-text">{error}</p> : <Spinner />;
  const others = chat.members.filter((m) => m.id !== me);
  const byId = new Map(chat.members.map((m) => [m.id, m]));
  const lastMine = [...msgs].reverse().find((m) => m.sender === me && !m.pending && !m.failed);
  const seenBy = lastMine ? others.filter((o) => new Date(o.lastReadAt) >= new Date(lastMine.at)) : [];

  return (
    <>
      <div className="row msg-head">
        <button className="icon-btn msg-back" onClick={onBack} aria-label={tr('Quay lại danh sách')}>
          ←
        </button>
        <ChatAvatar chat={chat} />
        <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
          <b className="truncate">{chat.name}</b>
          <span className="small muted truncate">{chat.type === 'group' ? tr('{0} thành viên', chat.members.length) : tr('Bạn bè')}</span>
        </span>
        <button className="btn ghost sm" onClick={() => setSettings(true)} title={tr('Tuỳ chọn')}>
          <Icon name="settings" size={16} />
        </button>
      </div>

      <div className="chat chat-scroll msg-scroll" ref={box} onScroll={(e) => (stick.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 60)}>
        {hasMore && (
          <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={older}>
            {tr('Tải tin cũ hơn')}
          </button>
        )}
        {msgs.length === 0 && <p className="muted small" style={{ textAlign: 'center' }}>{tr('Gửi lời chào đầu tiên 👋')}</p>}
        {msgs.map((m, i) => {
          if (!m.sender) return <div key={m.id} className="msg-system">{m.text}</div>;
          const mine = m.sender === me;
          const prev = msgs[i - 1];
          const showName = chat.type === 'group' && !mine && prev?.sender !== m.sender;
          const gap = !prev || new Date(m.at).getTime() - new Date(prev.at).getTime() > 15 * 60_000;
          return (
            <div key={m.id} className="col" style={{ gap: 2 }}>
              {gap && <div className="msg-time">{new Date(m.at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}</div>}
              {showName && <span className="small muted" style={{ marginLeft: 6 }}>{byId.get(m.sender)?.name ?? '?'}</span>}
              <div className={`bubble ${mine ? 'user' : 'assistant'} ${m.pending ? 'pending' : ''}`} title={new Date(m.at).toLocaleString()}>
                {m.text}
              </div>
              {m.failed && (
                <button className="small error-text" style={{ alignSelf: 'flex-end', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => send(m.text, m)}>
                  {tr('Chưa gửi được – bấm để gửi lại')}
                </button>
              )}
              {lastMine?.id === m.id && seenBy.length > 0 && (
                <span className="small muted" style={{ alignSelf: 'flex-end' }}>
                  {chat.type === 'direct' ? tr('Đã xem') : tr('Đã xem bởi {0}', seenBy.map((s) => s.name.split(' ').pop()).join(', '))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="error-text small">{error}</p>}
      <form
        className="row chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          rows={1}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={tr('Nhập tin nhắn… (Enter để gửi)')}
          style={{ minHeight: 44, maxHeight: 140 }}
        />
        <button className="btn" disabled={!text.trim()}>
          <Icon name="send" size={16} /> {tr('Gửi')}
        </button>
      </form>

      <ChatSettings open={settings} onClose={() => setSettings(false)} chat={chat} me={me ?? ''} onChanged={(c) => (setChat(c), onChanged())} onLeft={() => (onChanged(), onBack())} />
    </>
  );
}

function ChatSettings({ open, onClose, chat, me, onChanged, onLeft }: { open: boolean; onClose: () => void; chat: ChatItem; me: string; onChanged: (c: ChatItem) => void; onLeft: () => void }) {
  const [name, setName] = useState(chat.name);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const friends = useResource<{ items: Friend[] }>(open && chat.type === 'group' ? '/social/friends' : null);
  const run = async (fn: () => Promise<{ item?: ChatItem } | unknown>) => {
    setError('');
    try {
      const r = (await fn()) as { item?: ChatItem };
      if (r?.item) onChanged(r.item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const candidates = (friends.data?.items ?? []).filter((f) => f.status === 'accepted' && !chat.members.some((m) => m.id === f.id));
  return (
    <Modal open={open} onClose={onClose} title={chat.type === 'group' ? tr('Tuỳ chọn nhóm') : tr('Tuỳ chọn trò chuyện')}>
      <div className="col" style={{ gap: 14 }}>
        <label className="row between">
          <span>
            <b>{tr('Tắt thông báo')}</b>
            <span className="small muted" style={{ display: 'block' }}>{tr('Không đẩy thông báo cho cuộc trò chuyện này')}</span>
          </span>
          <Toggle on={chat.muted} onChange={(v) => run(() => patch(`/chats/${chat.id}`, { muted: v }))} label={tr('Tắt thông báo')} />
        </label>
        {chat.type === 'group' && (
          <>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() && name.trim() !== chat.name) void run(() => patch(`/chats/${chat.id}`, { name: name.trim() }));
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label={tr('Tên nhóm')} />
              <button className="btn secondary">{tr('Đổi tên')}</button>
            </form>
            <div className="col" style={{ gap: 6 }}>
              <div className="row between">
                <b>{tr('Thành viên ({0})', chat.members.length)}</b>
                <button className="btn ghost sm" onClick={() => setAdding(!adding)}>
                  <Icon name="plus" size={14} /> {tr('Thêm')}
                </button>
              </div>
              {adding && (
                <div className="chips">
                  {candidates.length === 0 && <span className="small muted">{tr('Không còn bạn bè nào để thêm.')}</span>}
                  {candidates.map((f) => (
                    <button key={f.id} className="chip" onClick={() => run(() => post(`/chats/${chat.id}/members`, { userIds: [f.id] }))}>
                      + {f.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="list">
                {chat.members.map((m) => (
                  <div key={m.id} className="list-item">
                    <Avatar name={m.name} url={m.avatarUrl} />
                    <span className="grow">
                      {m.id === me ? tr('Bạn') : m.name} {m.admin && <span className="small muted">({tr('quản trị')})</span>}
                    </span>
                    {chat.isAdmin && m.id !== me && (
                      <button className="icon-btn" title={tr('Xoá khỏi nhóm')} onClick={() => confirm(tr('Xoá {0} khỏi nhóm?', m.name)) && run(async () => (await del(`/chats/${chat.id}/members/${m.id}`), await get(`/chats/${chat.id}/messages?limit=1`).then((r) => ({ item: (r as { chat: ChatItem }).chat }))))}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn danger" onClick={() => confirm(tr('Rời nhóm này?')) && api(`/chats/${chat.id}/members/${me}`, { method: 'DELETE' }).then(() => (onClose(), onLeft()))}>
              {tr('Rời nhóm')}
            </button>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}

function NewChatModal({ mode, onClose, onCreated }: { mode: '' | 'direct' | 'group'; onClose: () => void; onCreated: (id: string) => void }) {
  const friends = useResource<{ items: Friend[] }>(mode ? '/social/friends' : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPicked([]);
    setName('');
    setError('');
  }, [mode]);
  const list = (friends.data?.items ?? []).filter((f) => f.status === 'accepted');
  const go = async (fn: () => Promise<{ item: { id: string } }>) => {
    setBusy(true);
    setError('');
    try {
      onCreated((await fn()).item.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!mode} onClose={onClose} title={mode === 'group' ? tr('Tạo nhóm học') : tr('Nhắn cho bạn bè')}>
      <div className="col" style={{ gap: 12 }}>
        {!friends.data ? (
          <Spinner />
        ) : list.length === 0 ? (
          <p className="muted">
            {tr('Bạn chưa có bạn bè.')} <Link href="/friends">{tr('Kết bạn')}</Link>
          </p>
        ) : mode === 'direct' ? (
          <div className="list">
            {list.map((f) => (
              <button key={f.id} className="list-item msg-pick" disabled={busy} onClick={() => go(() => post('/chats/direct', { friendId: f.id }))}>
                <Avatar name={f.name} url={f.avatarUrl} />
                <span className="grow">{f.name}</span>
                <Icon name="chat" size={16} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <label className="field">
              {tr('Tên nhóm')}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('VD: Nhóm ôn Hoá 12')} maxLength={80} autoFocus />
            </label>
            <span className="small muted">{tr('Chọn thành viên ({0})', picked.length)}</span>
            <div className="list" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {list.map((f) => (
                <label key={f.id} className="list-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={picked.includes(f.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))} />
                  <Avatar name={f.name} url={f.avatarUrl} />
                  <span className="grow">{f.name}</span>
                </label>
              ))}
            </div>
            <button className="btn" disabled={busy || !name.trim() || !picked.length} onClick={() => go(() => post('/chats/groups', { name: name.trim(), memberIds: picked }))}>
              {tr('Tạo nhóm')}
            </button>
          </>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}
