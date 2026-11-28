import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Linking, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { pickFile } from '../components/ImportFileSheet';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { api, errorMessage } from '../api/client';
import { useApi } from '../components/useApi';
import { onSocket } from '../socket';
import { useAuth } from '../store/auth';
import { colors } from '../theme';
import { Button, Chip, Chips, Empty, Field, H1, H3, KeyboardView, Loading, Muted, Row, s } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { tr } from '../i18n';
import { Avatar } from './SocialScreens';
import { setOpenChat } from '../push';
import { showAlert } from '../components/Dialog';
import { copyText, saveImageToPhone, shareMessage } from '../media';

type Nav = NativeStackNavigationProp<AppStackParams>;
interface Member {
  id: string;
  name: string;
  avatarUrl: string | null;
  admin: boolean;
  lastReadAt: string;
}
export interface ChatItem {
  id: string;
  type: 'direct' | 'group';
  name: string;
  avatarUrl: string | null;
  members: Member[];
  isAdmin: boolean;
  muted: boolean;
  unread: number;
  lastMessage: { text: string; at: string; mine: boolean; senderName: string } | null;
  /** 1-1: 'me' = mình đã chặn người kia, 'them' = người kia chặn mình */
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
  /** ảnh đang gửi: đường dẫn trên máy để xem trước / gửi lại */
  local?: { uri: string; name: string; type: string } | null;
  at: string;
  clientId?: string;
  pending?: boolean;
  failed?: boolean;
}

const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😭', '😡', '😴', '🥳', '🤯', '😱', '🙏', '👍', '👎', '👏', '💪', '🙌', '👋', '🤝', '❤️', '💔', '🔥', '✨', '🎉', '💯', '✅', '❌', '📚', '📝', '⏰', '☕', '🍀', '🌟', '🚀', '🎯'];
/** Tin chỉ gồm 1–3 biểu tượng cảm xúc -> hiện to (không dùng \\p{…} vì Hermes cũ không hỗ trợ) */
const isEmojiOnly = (t: string) => {
  const x = t.trim();
  if (!x || x.length > 12 || /[A-Za-z0-9À-ỹ\s.,!?'"()-]/.test(x)) return false;
  return Array.from(x).every((ch) => (ch.codePointAt(0) ?? 0) >= 0x2190 || ch === '\uFE0F' || ch === '\u200D');
};
interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: string;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'numeric' });
};

export function ChatAvatar({ chat, size = 44 }: { chat: ChatItem; size?: number }) {
  if (chat.type === 'direct') return <Avatar name={chat.name} url={chat.avatarUrl} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.text }}>
      <Icon name="users" size={size * 0.45} color={colors.onMarker} />
    </View>
  );
}

/** Số tin nhắn chưa đọc (cho nút ở màn Cá nhân) – cập nhật tức thì */
export function useUnreadChats() {
  const res = useApi<{ count: number }>('/chats/unread');
  useEffect(() => {
    const a = onSocket('chat:message', () => void res.reload());
    const b = onSocket('chat:read', () => void res.reload());
    return () => {
      a();
      b();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return res.data?.count ?? 0;
}

/** Một dòng cuộc trò chuyện (dùng ở màn Tin nhắn và tab Cùng nhau) */
export function ChatRow({ c, onPress }: { c: ChatItem; onPress: () => void }) {
  return (
          <Pressable
            onPress={onPress}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: pressed ? colors.surface2 : 'transparent' })}
          >
            <ChatAvatar chat={c} />
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Row style={{ flexWrap: 'nowrap', gap: 6 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontWeight: '700', color: colors.text, fontSize: 15 }}>
                  {c.name}
                </Text>
                {c.lastMessage && <Muted>{timeLabel(c.lastMessage.at)}</Muted>}
              </Row>
              <Row style={{ flexWrap: 'nowrap', gap: 6 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: c.unread ? colors.text : colors.muted, fontWeight: c.unread ? '700' : '400', fontSize: 13.5 }}>
                  {c.lastMessage ? `${c.lastMessage.mine ? tr('Bạn: ') : c.type === 'group' && c.lastMessage.senderName ? `${c.lastMessage.senderName.split(' ').pop()}: ` : ''}${c.lastMessage.text}` : tr('Chưa có tin nhắn')}
                </Text>
                {c.muted ? (
                  <Text>🔕</Text>
                ) : c.unread > 0 ? (
                  <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{c.unread > 99 ? '99+' : c.unread}</Text>
                  </View>
                ) : null}
              </Row>
            </View>
          </Pressable>
  );
}

/* ======================= Danh sách cuộc trò chuyện ======================= */
export function ChatsScreen() {
  const nav = useNavigation<Nav>();
  const list = useApi<{ items: ChatItem[] }>('/chats');
  const [newMode, setNewMode] = useState<'' | 'direct' | 'group'>('');
  useEffect(() => {
    const offs = ['chat:message', 'chat:changed', 'chat:read'].map((e) => onSocket(e, () => void list.reload()));
    return () => offs.forEach((f) => f());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, gap: 4 }}
        onRefresh={() => void list.reload()}
        refreshing={false}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 8 }}>
            <Muted>{tr('Nhắn riêng hoặc lập nhóm học với bạn bè. Trong phiên tập trung, tin nhắn không làm phiền bạn (đổi trong Cài đặt → Thông báo).')}</Muted>
            <Row style={{ flexWrap: 'nowrap' }}>
              <Button small variant="secondary" icon="chat" title={tr('Nhắn bạn bè')} onPress={() => setNewMode('direct')} style={{ flex: 1 }} />
              <Button small icon="users" title={tr('Tạo nhóm')} onPress={() => setNewMode('group')} style={{ flex: 1 }} />
            </Row>
          </View>
        }
        ListEmptyComponent={list.data ? <Empty text={tr('Chưa có cuộc trò chuyện nào.')} /> : <ActivityIndicator color={colors.text} />}
        renderItem={({ item: c }) => <ChatRow c={c} onPress={() => nav.navigate('ChatThread', { chatId: c.id })} />}
      />
      <NewChatSheet
        mode={newMode}
        onClose={() => setNewMode('')}
        onCreated={(id) => {
          setNewMode('');
          void list.reload();
          nav.navigate('ChatThread', { chatId: id });
        }}
      />
    </SafeAreaView>
  );
}

export function NewChatSheet({ mode, onClose, onCreated }: { mode: '' | 'direct' | 'group'; onClose: () => void; onCreated: (id: string) => void }) {
  const friends = useApi<{ items: Friend[] }>(mode ? '/social/friends' : null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPicked([]);
    setName('');
    setError('');
  }, [mode]);
  const list = (friends.data?.items ?? []).filter((f) => f.status === 'accepted');
  const go = async (path: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      onCreated((await api<{ item: { id: string } }>(path, { method: 'POST', body })).item.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!mode} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <H1>{mode === 'group' ? tr('Tạo nhóm học') : tr('Nhắn cho bạn bè')}</H1>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={tr('Đóng')}>
              <Icon name="x" size={24} color={colors.text} />
            </Pressable>
          </Row>
          {!friends.data ? (
            <ActivityIndicator color={colors.text} />
          ) : list.length === 0 ? (
            <Empty text={tr('Bạn chưa có bạn bè. Kết bạn ở mục Bạn bè & xếp hạng trước nhé.')} />
          ) : mode === 'direct' ? (
            list.map((f) => (
              <Pressable key={f.id} disabled={busy} onPress={() => go('/chats/direct', { friendId: f.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Avatar name={f.name} url={f.avatarUrl} />
                <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{f.name}</Text>
                <Icon name="chat" size={18} color={colors.text} />
              </Pressable>
            ))
          ) : (
            <>
              <Field label={tr('Tên nhóm')} value={name} onChangeText={setName} placeholder={tr('VD: Nhóm ôn Hoá 12')} maxLength={80} />
              <Muted>{tr('Chọn thành viên ({0})', picked.length)}</Muted>
              {list.map((f) => {
                const on = picked.includes(f.id);
                return (
                  <Pressable key={f.id} onPress={() => setPicked((cur) => (on ? cur.filter((x) => x !== f.id) : [...cur, f.id]))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: on ? colors.text : colors.borderStrong, backgroundColor: on ? colors.marker : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ fontWeight: '800', color: colors.onMarker }}>✓</Text>}
                    </View>
                    <Avatar name={f.name} url={f.avatarUrl} size={32} />
                    <Text style={{ flex: 1, color: colors.text }}>{f.name}</Text>
                  </Pressable>
                );
              })}
              <Button title={tr('Tạo nhóm')} loading={busy} disabled={!name.trim() || !picked.length} onPress={() => go('/chats/groups', { name: name.trim(), memberIds: picked })} />
            </>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ======================= Một cuộc trò chuyện ======================= */
export function ChatThreadScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'ChatThread'>) {
  const chatId = route.params.chatId;
  const me = useAuth((st) => st.user?.id);
  const [chat, setChat] = useState<ChatItem | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Msg | null>(null);
  const [forwarding, setForwarding] = useState<Msg | null>(null);
  const [notice, setNotice] = useState('');
  const flash = (t: string) => {
    setNotice(t);
    setTimeout(() => setNotice(''), 2500);
  };
  const listRef = useRef<FlatList<Msg>>(null);

  const markRead = useCallback(() => {
    if (AppState.currentState === 'active') void api(`/chats/${chatId}/read`, { method: 'POST', body: {} }).catch(() => undefined);
  }, [chatId]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ chat: ChatItem; items: Msg[]; hasMore: boolean }>(`/chats/${chatId}/messages`);
      setChat(r.chat);
      setMsgs(r.items);
      setHasMore(r.hasMore);
      markRead();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [chatId, markRead]);

  // đang xem cuộc trò chuyện này -> không bật thông báo cho tin của nó
  useEffect(() => {
    setOpenChat(chatId);
    return () => setOpenChat(null);
  }, [chatId]);

  useEffect(() => {
    void load();
    const offs = [
      onSocket('chat:message', (p) => {
        const e = p as { chatId: string; message: Msg };
        if (e.chatId !== chatId) return;
        setMsgs((cur) => (cur.some((m) => m.id === e.message.id || (e.message.clientId && m.clientId === e.message.clientId)) ? cur.map((m) => (m.clientId && m.clientId === e.message.clientId ? e.message : m)) : [...cur, e.message]));
        if (e.message.sender !== me) markRead();
      }),
      onSocket('chat:read', (p) => {
        const e = p as { chatId: string; userId: string; at: string };
        if (e.chatId !== chatId) return;
        setChat((c) => (c ? { ...c, members: c.members.map((m) => (m.id === e.userId ? { ...m, lastReadAt: e.at } : m)) } : c));
      }),
      onSocket('chat:changed', (p) => (p as { chatId: string }).chatId === chatId && void load()),
      onSocket('chat:deleted', (p) => {
        const e = p as { chatId: string; messageId: string };
        if (e.chatId === chatId) setMsgs((cur) => cur.filter((m) => m.id !== e.messageId));
      }),
      onSocket('chat:recalled', (p) => {
        const e = p as { chatId: string; message: Msg };
        if (e.chatId === chatId) setMsgs((cur) => cur.map((m) => (m.id === e.message.id ? e.message : m)));
      }),
    ];
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void load());
    return () => {
      offs.forEach((f) => f());
      sub.remove();
    };
  }, [chatId, load, markRead, me]);

  useLayoutEffect(() => {
    if (!chat) return;
    navigation.setOptions({
      title: chat.name,
      headerRight: () => (
        <Pressable onPress={() => setSettings(true)} hitSlop={10} accessibilityLabel={tr('Tuỳ chọn')}>
          <Icon name="settings" size={22} color={colors.text} />
        </Pressable>
      ),
    });
  }, [chat?.name, navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  const older = async () => {
    const first = msgs[0];
    if (!first || !hasMore) return;
    const r = await api<{ items: Msg[]; hasMore: boolean }>(`/chats/${chatId}/messages?before=${encodeURIComponent(first.at)}`);
    setMsgs((cur) => [...r.items, ...cur]);
    setHasMore(r.hasMore);
  };

  const send = async (body = text.trim(), retry?: Msg) => {
    if (!body) return;
    setError('');
    const clientId = retry?.clientId ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const temp: Msg = { id: clientId, clientId, sender: me ?? null, text: body, at: new Date().toISOString(), pending: true };
    setMsgs((cur) => (retry ? cur.map((m) => (m.clientId === clientId ? temp : m)) : [...cur, temp]));
    if (!retry) setText('');
    try {
      const r = await api<{ item: Msg }>(`/chats/${chatId}/messages`, { method: 'POST', body: { text: body, clientId } });
      setMsgs((cur) => (cur.some((m) => m.id === r.item.id) ? cur.filter((m) => m.clientId !== clientId || m.id === r.item.id) : cur.map((m) => (m.clientId === clientId ? r.item : m))));
    } catch (e) {
      setMsgs((cur) => cur.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
      setError(errorMessage(e));
    }
  };

  /** Gửi ảnh: hiện xem trước ngay, lỗi thì chạm để gửi lại */
  const sendImage = async (file: { uri: string; name: string; type: string }, retry?: Msg) => {
    setError('');
    const clientId = retry?.clientId ?? `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const temp: Msg = { id: clientId, clientId, sender: me ?? null, text: '', local: file, at: new Date().toISOString(), pending: true };
    setMsgs((cur) => (retry ? cur.map((m) => (m.clientId === clientId ? temp : m)) : [...cur, temp]));
    try {
      const fd = new FormData();
      fd.append('image', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      fd.append('clientId', clientId);
      const r = await api<{ item: Msg }>(`/chats/${chatId}/images`, { method: 'POST', body: fd, timeoutMs: 90000 });
      setMsgs((cur) => (cur.some((m) => m.id === r.item.id) ? cur.filter((m) => m.clientId !== clientId || m.id === r.item.id) : cur.map((m) => (m.clientId === clientId ? r.item : m))));
    } catch (e) {
      setMsgs((cur) => cur.map((m) => (m.clientId === clientId ? { ...m, pending: false, failed: true } : m)));
      setError(errorMessage(e));
    }
  };
  const pickImage = async () => {
    try {
      const f = await pickFile(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
      if (!f) return;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) return setError(tr('Chỉ gửi được ảnh JPG, PNG, WEBP hoặc GIF'));
      if (f.size > 8 * 1024 * 1024) return setError(tr('Ảnh tối đa 8 MB'));
      void sendImage({ uri: f.uri, name: f.name || 'photo.jpg', type: f.type });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!chat) return error ? <View style={{ padding: 16 }}><Text style={s.error}>{error}</Text></View> : <Loading />;
  const others = chat.members.filter((m) => m.id !== me);
  const byId = new Map(chat.members.map((m) => [m.id, m]));
  const lastMine = [...msgs].reverse().find((m) => m.sender === me && !m.pending && !m.failed);
  const seenBy = lastMine ? others.filter((o) => new Date(o.lastReadAt) >= new Date(lastMine.at)) : [];
  // FlatList đảo ngược: tin mới nhất ở dưới, cuộn lên để xem tin cũ
  const data = [...msgs].reverse();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <KeyboardView>
        {data.length === 0 ? (
          // danh sách đảo ngược làm lật ngược chữ của phần "trống" trên Android -> hiện riêng bên ngoài
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', padding: 24 }}>
            <Muted style={{ textAlign: 'center' }}>{tr('Gửi lời chào đầu tiên 👋')}</Muted>
          </View>
        ) : (
        <FlatList
          ref={listRef}
          data={data}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={older}
          onEndReachedThreshold={0.2}
          renderItem={({ item: m, index }) => {
            if (!m.sender)
              return (
                <Text style={{ alignSelf: 'center', fontSize: 12, color: colors.muted, backgroundColor: colors.surface2, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, textAlign: 'center' }}>{m.text}</Text>
              );
            const mine = m.sender === me;
            const prev = data[index + 1]; // tin trước đó (vì danh sách đảo ngược)
            const showName = chat.type === 'group' && !mine && prev?.sender !== m.sender;
            const gap = !prev || new Date(m.at).getTime() - new Date(prev.at).getTime() > 15 * 60_000;
            return (
              <View style={{ gap: 2 }}>
                {gap && <Muted style={{ alignSelf: 'center', fontSize: 11.5, marginVertical: 4 }}>{new Date(m.at).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })}</Muted>}
                {showName && <Muted style={{ marginLeft: 6, fontSize: 12 }}>{byId.get(m.sender)?.name ?? '?'}</Muted>}
                {m.recalled && (
                  <Text
                    onLongPress={() => setActionsFor(m)}
                    style={{ alignSelf: mine ? 'flex-end' : 'flex-start', fontStyle: 'italic', color: colors.muted, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' }}
                  >
                    {mine ? tr('Bạn đã thu hồi một tin nhắn') : tr('Tin nhắn đã được thu hồi')}
                  </Text>
                )}
                {m.forwarded && !m.recalled && <Muted style={{ alignSelf: mine ? 'flex-end' : 'flex-start', fontSize: 11.5, fontStyle: 'italic' }}>↪ {tr('Đã chuyển tiếp')}</Muted>}
                {(m.image || m.local) && (
                  <Pressable
                    onPress={() => m.image && void Linking.openURL(m.image.url)}
                    onLongPress={() => !m.pending && !m.failed && setActionsFor(m)}
                    delayLongPress={300}
                    accessibilityLabel={tr('Ảnh')}
                    style={{ alignSelf: mine ? 'flex-end' : 'flex-start', opacity: m.pending ? 0.55 : 1 }}
                  >
                    <Image
                      source={{ uri: m.image?.url ?? m.local?.uri }}
                      style={{ width: 220, height: m.image?.width && m.image.height ? Math.min(300, (220 * m.image.height) / m.image.width) : 220, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}
                      resizeMode="cover"
                    />
                  </Pressable>
                )}
                {!!m.text && isEmojiOnly(m.text) ? (
                  <Text onLongPress={() => !m.pending && !m.failed && setActionsFor(m)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', fontSize: 38, lineHeight: 46, opacity: m.pending ? 0.55 : 1 }}>{m.text}</Text>
                ) : !!m.text && (
                <Pressable
                  onLongPress={() => !m.pending && !m.failed && setActionsFor(m)}
                  delayLongPress={300}
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 16,
                    borderBottomRightRadius: mine ? 4 : 16,
                    borderBottomLeftRadius: mine ? 16 : 4,
                    backgroundColor: mine ? colors.marker : colors.surface,
                    borderWidth: 1,
                    borderColor: mine ? colors.marker : colors.border,
                    opacity: m.pending ? 0.55 : 1,
                  }}
                >
                  <Text style={{ color: mine ? colors.onMarker : colors.text, fontSize: 15, lineHeight: 21 }}>
                    {m.text}
                  </Text>
                </Pressable>
                )}
                {m.failed && (
                  <Text onPress={() => (m.local ? sendImage(m.local, m) : send(m.text, m))} style={{ alignSelf: 'flex-end', color: colors.danger, fontSize: 12 }}>
                    {tr('Chưa gửi được – chạm để gửi lại')}
                  </Text>
                )}
                {lastMine?.id === m.id && seenBy.length > 0 && (
                  <Muted style={{ alignSelf: 'flex-end', fontSize: 11.5 }}>{chat.type === 'direct' ? tr('Đã xem') : tr('Đã xem bởi {0}', seenBy.map((x) => x.name.split(' ').pop()).join(', '))}</Muted>
                )}
              </View>
            );
          }}
        />
        )}
        {!!error && <Text style={[s.error, { paddingHorizontal: 12 }]}>{error}</Text>}
        {!!notice && <Muted style={{ paddingHorizontal: 12, paddingBottom: 4 }}>{notice}</Muted>}
        {chat.blocked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 }}>
            <Text style={{ flex: 1, color: colors.text2 }}>{chat.blocked === 'me' ? tr('Bạn đã chặn người này. Hai bạn không nhắn tin cho nhau được.') : tr('Bạn không thể trả lời cuộc trò chuyện này.')}</Text>
            {chat.blocked === 'me' && (
              <Button
                small
                variant="secondary"
                title={tr('Bỏ chặn')}
                onPress={() =>
                  void api(`/social/blocks/${chat.otherId}`, { method: 'DELETE' })
                    .then(load)
                    .catch((e) => setError(errorMessage(e)))
                }
              />
            )}
          </View>
        ) : (
        <>
        {emojiOpen && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            {EMOJIS.map((e) => (
              <Pressable key={e} onPress={() => setText((t) => t + e)} onLongPress={() => void send(e)} accessibilityLabel={e} style={({ pressed }) => ({ width: '12.5%', alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: pressed ? colors.markerSoft : 'transparent' })}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
            <Muted style={{ width: '100%', textAlign: 'center', fontSize: 11.5, paddingBottom: 4 }}>{tr('Chạm để thêm vào tin · giữ để gửi ngay')}</Muted>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 10, borderTopWidth: emojiOpen ? 0 : 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <Pressable onPress={pickImage} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('Gửi ảnh')} style={{ width: 38, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="image" size={24} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setEmojiOpen((o) => !o)} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('Biểu tượng cảm xúc')} style={{ width: 38, height: 46, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="smile" size={24} color={emojiOpen ? colors.primary : colors.text} />
          </Pressable>
          <TextInput onFocus={() => setEmojiOpen(false)} value={text} onChangeText={setText} placeholder={tr('Nhập tin nhắn…')} placeholderTextColor="#a0a5c0" multiline maxLength={2000} style={[s.input, { flex: 1, maxHeight: 120, paddingVertical: 10 }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Gửi')}
            disabled={!text.trim()}
            onPress={() => send()}
            style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.45 }}
          >
            <Icon name="send" size={20} color={colors.onMarker} />
          </Pressable>
        </View>
        </>
        )}
      </KeyboardView>
      <MessageActions
        msg={actionsFor}
        mine={actionsFor?.sender === me}
        onClose={() => setActionsFor(null)}
        onForward={(m) => setForwarding(m)}
        onCopy={(m) => (copyText(m.text), flash(tr('Đã sao chép')))}
        onSave={(m) =>
          void saveImageToPhone(m.image!.url)
            .then(() => flash(tr('Đã lưu ảnh vào Thư viện ảnh (FOCUSLY)')))
            .catch((e) => setError(errorMessage(e)))
        }
        onShare={(m) => void shareMessage(m).catch((e) => setError(errorMessage(e)))}
        onHide={(m) =>
          showAlert(tr('Xoá ở phía bạn?'), tr('Tin nhắn chỉ mất ở máy bạn, người kia vẫn thấy.'), [
            { text: tr('Huỷ'), style: 'cancel' },
            {
              text: tr('Xoá ở phía tôi'),
              style: 'destructive',
              onPress: () =>
                void api(`/chats/${chatId}/messages/${m.id}?for=me`, { method: 'DELETE' })
                  .then(() => setMsgs((cur) => cur.filter((x) => x.id !== m.id)))
                  .catch((e) => setError(errorMessage(e))),
            },
          ])
        }
        onRecall={(m) =>
          showAlert(tr('Thu hồi tin nhắn?'), tr('Tin sẽ bị xoá ở cả hai phía. Mọi người sẽ thấy “Tin nhắn đã được thu hồi”.'), [
            { text: tr('Huỷ'), style: 'cancel' },
            {
              text: tr('Thu hồi'),
              style: 'destructive',
              onPress: () =>
                void api(`/chats/${chatId}/messages/${m.id}?for=all`, { method: 'DELETE' })
                  .then(() => setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, recalled: true, text: '', image: null } : x))))
                  .catch((e) => setError(errorMessage(e))),
            },
          ])
        }
      />
      {forwarding && <ForwardSheet msg={forwarding} fromChatId={chatId} onClose={() => setForwarding(null)} onDone={(n) => (setForwarding(null), flash(tr('Đã chuyển tiếp tới {0} cuộc trò chuyện', n)))} />}
      <ChatSettingsSheet
        visible={settings}
        onClose={() => setSettings(false)}
        chat={chat}
        me={me ?? ''}
        onChanged={setChat}
        onLeft={() => {
          setSettings(false);
          navigation.goBack();
        }}
      />
    </SafeAreaView>
  );
}

function ChatSettingsSheet({ visible, onClose, chat, me, onChanged, onLeft }: { visible: boolean; onClose: () => void; chat: ChatItem; me: string; onChanged: (c: ChatItem) => void; onLeft: () => void }) {
  const [name, setName] = useState(chat.name);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const friends = useApi<{ items: Friend[] }>(visible && chat.type === 'group' ? '/social/friends' : null);
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      const r = (await fn()) as { item?: ChatItem };
      if (r?.item) onChanged(r.item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const reloadChat = () => api<{ chat: ChatItem }>(`/chats/${chat.id}/messages?limit=1`).then((r) => ({ item: r.chat }));
  const candidates = (friends.data?.items ?? []).filter((f) => f.status === 'accepted' && !chat.members.some((m) => m.id === f.id));
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <H1>{chat.type === 'group' ? tr('Tuỳ chọn nhóm') : tr('Tuỳ chọn trò chuyện')}</H1>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={tr('Đóng')}>
              <Icon name="x" size={24} color={colors.text} />
            </Pressable>
          </Row>
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{tr('Tắt thông báo')}</Text>
              <Muted>{tr('Không đẩy thông báo cho cuộc trò chuyện này')}</Muted>
            </View>
            <Switch value={chat.muted} onValueChange={(v) => run(() => api(`/chats/${chat.id}`, { method: 'PATCH', body: { muted: v } }))} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={colors.text} />
          </Row>
          {chat.type === 'group' && (
            <>
              <Field label={tr('Tên nhóm')} value={name} onChangeText={setName} maxLength={80} />
              <Button small variant="secondary" title={tr('Đổi tên')} disabled={!name.trim() || name.trim() === chat.name} onPress={() => run(() => api(`/chats/${chat.id}`, { method: 'PATCH', body: { name: name.trim() } }))} />
              <Row style={{ flexWrap: 'nowrap' }}>
                <View style={{ flex: 1 }}>
                  <H3>{tr('Thành viên ({0})', chat.members.length)}</H3>
                </View>
                <Button small variant="ghost" icon="plus" title={tr('Thêm')} onPress={() => setAdding(!adding)} />
              </Row>
              {adding && (
                <Chips wrap>
                  {candidates.length === 0 && <Muted>{tr('Không còn bạn bè nào để thêm.')}</Muted>}
                  {candidates.map((f) => (
                    <Chip key={f.id} label={`+ ${f.name}`} onPress={() => run(() => api(`/chats/${chat.id}/members`, { method: 'POST', body: { userIds: [f.id] } }))} />
                  ))}
                </Chips>
              )}
              {chat.members.map((m) => (
                <Row key={m.id} style={{ flexWrap: 'nowrap' }}>
                  <Avatar name={m.name} url={m.avatarUrl} size={32} />
                  <Text style={{ flex: 1, color: colors.text }}>
                    {m.id === me ? tr('Bạn') : m.name}
                    {m.admin ? ` (${tr('quản trị')})` : ''}
                  </Text>
                  {chat.isAdmin && m.id !== me && (
                    <Pressable
                      hitSlop={8}
                      accessibilityLabel={tr('Xoá khỏi nhóm')}
                      onPress={() =>
                        showAlert(tr('Xoá {0} khỏi nhóm?', m.name), '', [
                          { text: tr('Huỷ'), style: 'cancel' },
                          { text: tr('Xoá'), style: 'destructive', onPress: () => void run(async () => (await api(`/chats/${chat.id}/members/${m.id}`, { method: 'DELETE' }), await reloadChat())) },
                        ])
                      }
                    >
                      <Icon name="x" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </Row>
              ))}
              <Button
                variant="danger"
                title={tr('Rời nhóm')}
                onPress={() =>
                  showAlert(tr('Rời nhóm này?'), '', [
                    { text: tr('Huỷ'), style: 'cancel' },
                    { text: tr('Rời nhóm'), style: 'destructive', onPress: () => void api(`/chats/${chat.id}/members/${me}`, { method: 'DELETE' }).then(onLeft) },
                  ])
                }
              />
            </>
          )}
          {chat.type === 'direct' && chat.otherId && chat.blocked !== 'them' && (
            <Button
              variant={chat.blocked === 'me' ? 'secondary' : 'danger'}
              title={chat.blocked === 'me' ? tr('Bỏ chặn {0}', chat.name) : tr('Chặn {0}', chat.name)}
              onPress={() =>
                chat.blocked === 'me'
                  ? void run(() => api(`/social/blocks/${chat.otherId}`, { method: 'DELETE' }).then(reloadChat))
                  : showAlert(tr('Chặn {0}?', chat.name), tr('Hai bạn sẽ không còn là bạn bè, không nhắn tin và không gửi lời mời kết bạn cho nhau được. Bạn có thể bỏ chặn bất cứ lúc nào.'), [
                      { text: tr('Huỷ'), style: 'cancel' },
                      { text: tr('Chặn'), style: 'destructive', onPress: () => void run(() => api('/social/blocks', { method: 'POST', body: { userId: chat.otherId } }).then(reloadChat)) },
                    ])
              }
            />
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** Bảng thao tác khi giữ lâu một tin nhắn */
function MessageActions({
  msg,
  mine,
  onClose,
  onForward,
  onCopy,
  onSave,
  onShare,
  onHide,
  onRecall,
}: {
  msg: Msg | null;
  mine: boolean;
  onClose: () => void;
  onForward: (m: Msg) => void;
  onCopy: (m: Msg) => void;
  onSave: (m: Msg) => void;
  onShare: (m: Msg) => void;
  onHide: (m: Msg) => void;
  onRecall: (m: Msg) => void;
}) {
  if (!msg) return null;
  const items: [IconName, string, (m: Msg) => void, boolean?][] = msg.recalled
    ? [['trash', tr('Xoá ở phía tôi'), onHide, true]]
    : [
        ['share', tr('Chuyển tiếp'), onForward],
        ...(msg.text ? [['copy', tr('Sao chép'), onCopy] as [IconName, string, (m: Msg) => void]] : []),
        ...(msg.image ? [['download', tr('Lưu ảnh vào máy'), onSave] as [IconName, string, (m: Msg) => void]] : []),
        ['send', tr('Chia sẻ sang ứng dụng khác'), onShare],
        ['trash', tr('Xoá ở phía tôi'), onHide, true],
        ...(mine ? [['undo', tr('Thu hồi (xoá cả 2 phía)'), onRecall, true] as [IconName, string, (m: Msg) => void, boolean]] : []),
      ];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(12,10,6,0.45)', justifyContent: 'flex-end' }}>
        <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingBottom: 26, paddingHorizontal: 12 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 10 }} />
          {!!(msg.text || msg.image) && !msg.recalled && (
            <Text numberOfLines={2} style={{ color: colors.muted, paddingHorizontal: 8, paddingBottom: 8 }}>
              {msg.image ? `📷 ${tr('Ảnh')}${msg.text ? ' · ' : ''}` : ''}
              {msg.text}
            </Text>
          )}
          {items.map(([icon, label, fn, danger]) => (
            <Pressable
              key={label}
              onPress={() => {
                onClose();
                setTimeout(() => fn(msg), 120);
              }}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 10, borderRadius: 12, backgroundColor: pressed ? colors.surface2 : 'transparent' })}
            >
              <Icon name={icon} size={21} color={danger ? colors.danger : colors.text} />
              <Text style={{ fontSize: 16, color: danger ? colors.danger : colors.text, fontWeight: '600' }}>{label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Chọn cuộc trò chuyện để chuyển tiếp */
function ForwardSheet({ msg, fromChatId, onClose, onDone }: { msg: Msg; fromChatId: string; onClose: () => void; onDone: (n: number) => void }) {
  const chats = useApi<{ items: ChatItem[] }>('/chats');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = (chats.data?.items ?? []).filter((c) => !c.blocked);
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ sent: string[]; failed: { error: string }[] }>('/chats/forward', { method: 'POST', body: { fromChatId, messageId: msg.id, toChatIds: picked } });
      if (!r.sent.length) throw new Error(r.failed[0]?.error ?? tr('Chưa chuyển tiếp được'));
      onDone(r.sent.length);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Row style={{ flexWrap: 'nowrap', padding: 16 }}>
          <View style={{ flex: 1 }}>
            <H1>{tr('Chuyển tiếp')}</H1>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={tr('Đóng')}>
            <Icon name="x" size={24} color={colors.text} />
          </Pressable>
        </Row>
        <Text numberOfLines={3} style={{ marginHorizontal: 16, padding: 12, borderRadius: 12, backgroundColor: colors.surface2, color: colors.text2, overflow: 'hidden' }}>
          {msg.image ? `📷 ${tr('Ảnh')}${msg.text ? ' · ' : ''}` : ''}
          {msg.text}
        </Text>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 2 }}>
          {!chats.data ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty text={tr('Không có cuộc trò chuyện nào.')} />
          ) : (
            list.map((c) => {
              const on = picked.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : p.length < 10 ? [...p, c.id] : p))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, backgroundColor: on ? colors.markerSoft : 'transparent' }}
                >
                  <ChatAvatar chat={c} size={40} />
                  <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.marker : colors.borderStrong, backgroundColor: on ? colors.marker : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Icon name="check" size={14} color={colors.onMarker} />}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
        <View style={{ padding: 16, gap: 8 }}>
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button variant="marker" title={picked.length ? tr('Gửi tới {0} cuộc trò chuyện', picked.length) : tr('Chọn nơi nhận')} disabled={!picked.length} loading={busy} onPress={go} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
