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
import { uiConfirm } from '@/lib/dialog';

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
  /** trò chuyện 1-1: 'me' = mình đã chặn người kia, 'them' = người kia chặn mình */
  blocked?: 'me' | 'them' | null;
  otherId?: string | null;
}
interface Msg {
  recalled?: boolean;
  forwarded?: boolean;
  id: string;
  sender: string | null;
  text: string;
  image?: { url: string; width: number | null; height: number | null } | null;
  /** ảnh đang gửi (xem trước trên máy) */
  localUrl?: string;
  file?: File;
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

const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😭', '😡', '😴', '🥳', '🤯', '😱', '🙏', '👍', '👎', '👏', '💪', '🙌', '👋', '🤝', '❤️', '💔', '🔥', '✨', '🎉', '💯', '✅', '❌', '📚', '📝', '⏰', '☕', '🍀', '🌟', '🚀', '🎯'];

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [notice, setNotice] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
  useSocketEvent<{ chatId: string; message: Msg }>('chat:recalled', (e) => e.chatId === chatId && setMsgs((cur) => cur.map((m) => (m.id === e.message.id ? e.message : m))));

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

  /** Gửi ảnh (kèm chữ nếu có). Hiện ngay bản xem trước, lỗi thì bấm để gửi lại */
  const sendImage = async (file: File, retry?: Msg) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return setError(tr('Chỉ gửi được ảnh JPG, PNG, WEBP hoặc GIF'));
    if (file.size > 8 * 1024 * 1024) return setError(tr('Ảnh tối đa 8 MB'));
    setError('');
    const clientId = retry?.clientId ?? `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const localUrl = retry?.localUrl ?? URL.createObjectURL(file);
    const temp: Msg = { id: clientId, clientId, sender: me ?? null, text: '', localUrl, file, at: new Date().toISOString(), pending: true };
    stick.current = true;
    setMsgs((cur) => (retry ? cur.map((m) => (m.clientId === clientId ? temp : m)) : [...cur, temp]));
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('clientId', clientId);
      const r = await api<{ item: Msg }>(`/chats/${chatId}/images`, { method: 'POST', body: fd });
      setMsgs((cur) => (cur.some((m) => m.id === r.item.id) ? cur.filter((m) => m.clientId !== clientId || m.id === r.item.id) : cur.map((m) => (m.clientId === clientId ? r.item : m))));
      onChanged();
    } catch (e) {
      setMsgs((cur) => cur.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
      setError(errorMessage(e));
    }
  };

  const flash = (t: string) => {
    setNotice(t);
    setTimeout(() => setNotice(''), 2500);
  };
  const hideForMe = async (m: Msg) => {
    setMenuFor(null);
    if (!(await uiConfirm(tr('Xoá tin nhắn ở phía bạn? Người kia vẫn thấy tin này.'), { okLabel: tr('Xoá ở phía tôi'), danger: true }))) return;
    try {
      await del(`/chats/${chatId}/messages/${m.id}?for=me`);
      setMsgs((cur) => cur.filter((x) => x.id !== m.id));
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const recall = async (m: Msg) => {
    setMenuFor(null);
    if (!(await uiConfirm(tr('Thu hồi tin nhắn với mọi người? Mọi người sẽ thấy “Tin nhắn đã được thu hồi”.'), { okLabel: tr('Thu hồi'), danger: true }))) return;
    try {
      await del(`/chats/${chatId}/messages/${m.id}?for=all`);
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, recalled: true, text: '', image: null } : x)));
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const imageFile = async (url: string) => {
    const blob = await (await fetch(url)).blob();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    return new File([blob], `focusly-${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
  };
  const saveImage = async (url: string) => {
    setMenuFor(null);
    try {
      const f = await imageFile(url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };
  const share = async (m: Msg) => {
    setMenuFor(null);
    try {
      if (m.image?.url) {
        const f = await imageFile(m.image.url).catch(() => null);
        if (f && navigator.canShare?.({ files: [f] })) return void (await navigator.share({ files: [f], text: m.text || undefined }));
        if (navigator.share) return void (await navigator.share({ url: m.image.url, text: m.text || undefined }));
        await navigator.clipboard.writeText(m.image.url);
      } else {
        if (navigator.share) return void (await navigator.share({ text: m.text }));
        await navigator.clipboard.writeText(m.text);
      }
      flash(tr('Trình duyệt chưa hỗ trợ chia sẻ – đã sao chép để bạn dán vào ứng dụng khác'));
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(errorMessage(e));
    }
  };
  const copy = async (m: Msg) => {
    setMenuFor(null);
    await navigator.clipboard.writeText(m.text).catch(() => undefined);
    flash(tr('Đã sao chép'));
  };

  const addEmoji = (e: string) => {
    const el = input.current;
    const at = el?.selectionStart ?? text.length;
    const next = text.slice(0, at) + e + text.slice(el?.selectionEnd ?? at);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
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
              {m.recalled ? (
                <div className={`bubble ${mine ? 'user' : 'assistant'} recalled`}>{mine ? tr('Bạn đã thu hồi một tin nhắn') : tr('Tin nhắn đã được thu hồi')}</div>
              ) : (
              <div className={`msg-line ${mine ? 'mine' : ''} ${menuFor === m.id ? 'menu-open' : ''}`}>
              <div className="col msg-content">
              {m.forwarded && <span className="msg-fwd">↪ {tr('Đã chuyển tiếp')}</span>}
              {(m.image || m.localUrl) && (
                <a href={m.image?.url ?? m.localUrl} target="_blank" rel="noreferrer" className={`msg-image ${mine ? 'mine' : ''} ${m.pending ? 'pending' : ''}`} title={new Date(m.at).toLocaleString()}>
                  <img src={m.image?.url ?? m.localUrl} alt={tr('Ảnh')} loading="lazy" width={m.image?.width ?? undefined} height={m.image?.height ?? undefined} />
                </a>
              )}
              {!!m.text && (
                <div className={`bubble ${mine ? 'user' : 'assistant'} ${m.pending ? 'pending' : ''} ${/^\p{Extended_Pictographic}{1,3}$/u.test(m.text.trim()) ? 'emoji-only' : ''}`} title={new Date(m.at).toLocaleString()}>
                  {m.text}
                </div>
              )}
              </div>
              {!m.pending && !m.failed && (
                <span className="msg-actions">
                  <button className="icon-btn" onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} aria-label={tr('Tuỳ chọn tin nhắn')} aria-expanded={menuFor === m.id} title={tr('Tuỳ chọn')}>
                    ⋯
                  </button>
                  {menuFor === m.id && (
                    <>
                      <div className="emoji-backdrop" onClick={() => setMenuFor(null)} />
                      <div className={`msg-menu ${mine ? 'left' : 'right'}`} role="menu">
                        <button role="menuitem" onClick={() => (setMenuFor(null), setForwarding(m))}>↪ {tr('Chuyển tiếp')}</button>
                        {!!m.text && <button role="menuitem" onClick={() => void copy(m)}>⧉ {tr('Sao chép')}</button>}
                        {m.image && <button role="menuitem" onClick={() => void saveImage(m.image!.url)}>⬇ {tr('Lưu ảnh')}</button>}
                        <button role="menuitem" onClick={() => void share(m)}>⤴ {tr('Chia sẻ')}</button>
                        <button role="menuitem" className="danger" onClick={() => void hideForMe(m)}>🗑 {tr('Xoá ở phía tôi')}</button>
                        {mine && <button role="menuitem" className="danger" onClick={() => void recall(m)}>↺ {tr('Thu hồi (xoá cả 2 phía)')}</button>}
                      </div>
                    </>
                  )}
                </span>
              )}
              </div>
              )}
              {m.failed && (
                <button className="small error-text" style={{ alignSelf: 'flex-end', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => (m.file ? sendImage(m.file, m) : send(m.text, m))}>
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
      {notice && <p className="small muted" role="status">{notice}</p>}
      {chat.blocked ? (
        <div className="msg-blocked">
          {chat.blocked === 'me' ? (
            <>
              <span>{tr('Bạn đã chặn người này. Hai bạn không nhắn tin cho nhau được.')}</span>
              <button className="btn secondary sm" onClick={async () => {
                try {
                  await del(`/social/blocks/${chat.otherId}`);
                  await load();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}>{tr('Bỏ chặn')}</button>
            </>
          ) : (
            <span>{tr('Bạn không thể trả lời cuộc trò chuyện này.')}</span>
          )}
        </div>
      ) : (
      <form
        className="row chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            Array.from(e.target.files ?? []).slice(0, 6).forEach((f) => void sendImage(f));
            e.target.value = '';
          }}
        />
        <button type="button" className="icon-btn msg-tool" onClick={() => fileInput.current?.click()} title={tr('Gửi ảnh')} aria-label={tr('Gửi ảnh')}>
          <Icon name="image" size={18} />
        </button>
        <span className="emoji-wrap">
          <button type="button" className="icon-btn msg-tool" onClick={() => setEmojiOpen((o) => !o)} title={tr('Biểu tượng cảm xúc')} aria-label={tr('Biểu tượng cảm xúc')} aria-expanded={emojiOpen}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>😊</span>
          </button>
          {emojiOpen && (
            <>
              <div className="emoji-backdrop" onClick={() => setEmojiOpen(false)} />
              <div className="emoji-pop" role="dialog" aria-label={tr('Biểu tượng cảm xúc')}>
                {EMOJIS.map((e) => (
                  <button type="button" key={e} onClick={() => addEmoji(e)} aria-label={e}>
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
        </span>
        <textarea
          ref={input}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (files.length) {
              e.preventDefault();
              files.slice(0, 6).forEach((f) => void sendImage(f));
            }
          }}
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
      )}
      {forwarding && <ForwardModal msg={forwarding} fromChatId={chatId} onClose={() => setForwarding(null)} onDone={(n) => (setForwarding(null), flash(tr('Đã chuyển tiếp tới {0} cuộc trò chuyện', n)), onChanged())} />}

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
                      <button className="icon-btn" title={tr('Xoá khỏi nhóm')} onClick={async () => (await uiConfirm(tr('Xoá {0} khỏi nhóm?', m.name))) && run(async () => (await del(`/chats/${chat.id}/members/${m.id}`), await get(`/chats/${chat.id}/messages?limit=1`).then((r) => ({ item: (r as { chat: ChatItem }).chat }))))}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn danger" onClick={async () => (await uiConfirm(tr('Rời nhóm này?'))) && api(`/chats/${chat.id}/members/${me}`, { method: 'DELETE' }).then(() => (onClose(), onLeft()))}>
              {tr('Rời nhóm')}
            </button>
          </>
        )}
        {chat.type === 'direct' && chat.otherId && chat.blocked !== 'them' && (
          <button
            className={`btn ${chat.blocked === 'me' ? 'secondary' : 'danger'}`}
            onClick={async () => {
              if (chat.blocked === 'me') return void run(async () => (await del(`/social/blocks/${chat.otherId}`), onClose(), onLeft()));
              if (!(await uiConfirm(tr('Chặn {0}? Hai bạn sẽ không còn là bạn bè, không nhắn tin và không gửi lời mời kết bạn cho nhau được. Bạn có thể bỏ chặn bất cứ lúc nào.', chat.name), { okLabel: tr('Chặn'), danger: true }))) return;
              void run(async () => (await post('/social/blocks', { userId: chat.otherId }), onClose(), onLeft()));
            }}
          >
            {chat.blocked === 'me' ? tr('Bỏ chặn {0}', chat.name) : tr('Chặn {0}', chat.name)}
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Modal>
  );
}

/** Chọn cuộc trò chuyện để chuyển tiếp tin */
function ForwardModal({ msg, fromChatId, onClose, onDone }: { msg: Msg; fromChatId: string; onClose: () => void; onDone: (n: number) => void }) {
  const chats = useResource<{ items: ChatItem[] }>('/chats');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = (chats.data?.items ?? []).filter((c) => !c.blocked && c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await post<{ sent: string[]; failed: { error: string }[] }>('/chats/forward', { fromChatId, messageId: msg.id, toChatIds: picked });
      if (!r.sent.length) throw new Error(r.failed[0]?.error ?? tr('Chưa chuyển tiếp được'));
      onDone(r.sent.length);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={tr('Chuyển tiếp tin nhắn')}>
      <div className="col" style={{ gap: 12 }}>
        <div className="fb-quote small">{msg.image ? `📷 ${tr('Ảnh')}${msg.text ? ' · ' : ''}` : ''}{msg.text}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Tìm cuộc trò chuyện…')} aria-label={tr('Tìm cuộc trò chuyện…')} />
        <div className="col" style={{ gap: 2, maxHeight: 320, overflowY: 'auto' }}>
          {!chats.data ? (
            <Spinner />
          ) : list.length === 0 ? (
            <p className="muted small">{tr('Không có cuộc trò chuyện nào.')}</p>
          ) : (
            list.map((c) => {
              const on = picked.includes(c.id);
              return (
                <label key={c.id} className={`msg-row ${on ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : p.length < 10 ? [...p, c.id] : p))} style={{ width: 18, height: 18 }} />
                  <ChatAvatar chat={c} />
                  <span className="grow truncate">{c.name}</span>
                </label>
              );
            })
          )}
        </div>
        {error && <p className="error-text small">{error}</p>}
        <button className="btn marker" disabled={!picked.length || busy} onClick={go}>
          ↪ {picked.length ? tr('Gửi tới {0} cuộc trò chuyện', picked.length) : tr('Chọn nơi nhận')}
        </button>
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
