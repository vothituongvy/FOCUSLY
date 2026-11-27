import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
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
import { Icon } from '../components/Icon';
import { tr } from '../i18n';
import { Avatar } from './SocialScreens';

type Nav = NativeStackNavigationProp<AppStackParams>;
interface Member {
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
  members: Member[];
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
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'numeric' });
};

function ChatAvatar({ chat, size = 44 }: { chat: ChatItem; size?: number }) {
  if (chat.type === 'direct') return <Avatar name={chat.name} url={chat.avatarUrl} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.text }}>
      <Icon name="users" size={size * 0.45} color={colors.text} />
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
        renderItem={({ item: c }) => (
          <Pressable
            onPress={() => nav.navigate('ChatThread', { chatId: c.id })}
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
        )}
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

function NewChatSheet({ mode, onClose, onCreated }: { mode: '' | 'direct' | 'group'; onClose: () => void; onCreated: (id: string) => void }) {
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
                      {on && <Text style={{ fontWeight: '800', color: colors.text }}>✓</Text>}
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
          ListEmptyComponent={<Muted style={{ textAlign: 'center', transform: [{ scaleY: -1 }] }}>{tr('Gửi lời chào đầu tiên 👋')}</Muted>}
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
                <Pressable
                  onLongPress={() =>
                    mine && !m.pending
                      ? Alert.alert(tr('Xoá tin nhắn này?'), m.text.slice(0, 80), [
                          { text: tr('Huỷ'), style: 'cancel' },
                          { text: tr('Xoá'), style: 'destructive', onPress: () => void api(`/chats/${chatId}/messages/${m.id}`, { method: 'DELETE' }).catch(() => undefined) },
                        ])
                      : undefined
                  }
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
                  <Text selectable style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>
                    {m.text}
                  </Text>
                </Pressable>
                {m.failed && (
                  <Text onPress={() => send(m.text, m)} style={{ alignSelf: 'flex-end', color: colors.danger, fontSize: 12 }}>
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
        {!!error && <Text style={[s.error, { paddingHorizontal: 12 }]}>{error}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TextInput value={text} onChangeText={setText} placeholder={tr('Nhập tin nhắn…')} placeholderTextColor="#a0a5c0" multiline maxLength={2000} style={[s.input, { flex: 1, maxHeight: 120, paddingVertical: 10 }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Gửi')}
            disabled={!text.trim()}
            onPress={() => send()}
            style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.45 }}
          >
            <Icon name="send" size={20} color={colors.text} />
          </Pressable>
        </View>
      </KeyboardView>
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
                        Alert.alert(tr('Xoá {0} khỏi nhóm?', m.name), '', [
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
                  Alert.alert(tr('Rời nhóm này?'), '', [
                    { text: tr('Huỷ'), style: 'cancel' },
                    { text: tr('Rời nhóm'), style: 'destructive', onPress: () => void api(`/chats/${chat.id}/members/${me}`, { method: 'DELETE' }).then(onLeft) },
                  ])
                }
              />
            </>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
