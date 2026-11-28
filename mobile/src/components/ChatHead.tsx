import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, View } from 'react-native';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { onSocket } from '../socket';
import { getOpenChat } from '../push';
import { useAuth } from '../store/auth';
import { useSession } from '../store/session';
import { colors } from '../theme';
import { tr } from '../i18n';
import { ChatAvatar, type ChatItem } from '../screens/ChatScreens';

const SIZE = 58;
const HIDE_ON = new Set(['ChatThread', 'Chats', 'Community']);

/**
 * "Bong bóng chat" kiểu Messenger/Zalo: khi có tin nhắn mới, ảnh đại diện người gửi nổi trên màn hình.
 * Chạm để mở cuộc trò chuyện, kéo đi đâu cũng được (tự bám mép), kéo xuống vòng ✕ ở dưới để tắt.
 * Không hiện trong màn tin nhắn và khi đang trong phiên tập trung (Focus Shield).
 */
export function ChatHead({ route, onOpen }: { route: string; onOpen: (chatId: string) => void }) {
  const me = useAuth((s) => s.user?.id);
  const focusing = useSession((s) => Boolean(s.session));
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<ChatItem | null>(null);
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [overClose, setOverClose] = useState(false);
  const { width: W, height: H } = Dimensions.get('window');
  const pos = useRef(new Animated.ValueXY({ x: W - SIZE - 10, y: insets.top + 120 })).current;
  const last = useRef({ x: W - SIZE - 10, y: insets.top + 120 });
  const pop = useRef(new Animated.Value(0)).current;
  const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeY = H - insets.bottom - 110;
  const nearClose = (x: number, y: number) => Math.abs(x + SIZE / 2 - W / 2) < 70 && y + SIZE / 2 > closeY - 40;

  // tin mới đến -> hiện bong bóng của cuộc trò chuyện đó
  useEffect(() => {
    return onSocket('chat:message', async (raw) => {
      const p = raw as { chatId: string; message: { sender: string | null; text: string } };
      if (!p?.message?.sender || p.message.sender === me || p.chatId === getOpenChat()) return;
      try {
        const r = await api<{ items: ChatItem[] }>('/chats');
        const c = r.items.find((x) => x.id === p.chatId);
        if (!c || c.muted) return;
        setChat(c);
        setPreview(p.message.text);
        clearTimeout(previewTimer.current);
        previewTimer.current = setTimeout(() => setPreview(''), 4000);
        pop.setValue(0.6);
        Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: false }).start();
      } catch {
        /* mạng chập chờn: bỏ qua */
      }
    });
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // đã đọc ở nơi khác -> cập nhật số chưa đọc / ẩn
  useEffect(
    () =>
      onSocket('chat:read', (raw) => {
        const p = raw as { chatId: string; userId?: string };
        if (!chat || p?.chatId !== chat.id || (p.userId && p.userId !== me)) return;
        setChat(null);
      }),
    [chat, me],
  );

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        setDragging(true);
        setPreview('');
      },
      onPanResponderMove: (_e, g) => {
        const x = last.current.x + g.dx;
        const y = last.current.y + g.dy;
        pos.setValue({ x, y });
        setOverClose(nearClose(x, y));
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        setOverClose(false);
        const x = last.current.x + g.dx;
        const y = last.current.y + g.dy;
        if (nearClose(x, y)) {
          setChat(null);
          return;
        }
        const toX = x + SIZE / 2 < W / 2 ? 10 : W - SIZE - 10; // bám mép gần nhất
        const toY = Math.min(Math.max(y, insets.top + 10), H - insets.bottom - SIZE - 90);
        last.current = { x: toX, y: toY };
        Animated.spring(pos, { toValue: last.current, friction: 6, useNativeDriver: false }).start();
      },
    }),
  ).current;

  if (!chat || focusing || HIDE_ON.has(route)) return null;
  const onLeft = last.current.x < W / 2;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {dragging && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: W / 2 - 28, top: closeY, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: overClose ? colors.danger : 'rgba(0,0,0,0.55)', transform: [{ scale: overClose ? 1.15 : 1 }] }}
        >
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
        </View>
      )}
      <Animated.View {...pan.panHandlers} style={{ position: 'absolute', transform: [...pos.getTranslateTransform(), { scale: pop }] }}>
        <Pressable
          onPress={() => {
            const id = chat.id;
            setChat(null);
            onOpen(id);
          }}
          accessibilityRole="button"
          accessibilityLabel={tr('Tin nhắn mới từ {0}. Chạm để mở', chat.name)}
          style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChatAvatar chat={chat} size={SIZE - 4} />
          {chat.unread + 1 > 0 && (
            <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{chat.unread > 99 ? '99+' : Math.max(1, chat.unread)}</Text>
            </View>
          )}
        </Pressable>
        {!!preview && !dragging && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 8, [onLeft ? 'left' : 'right']: SIZE + 8, width: Math.min(230, W - SIZE - 40), backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5 }}
          >
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }} numberOfLines={1}>
              {chat.name}
            </Text>
            <Text style={{ color: colors.text2, fontSize: 13 }} numberOfLines={2}>
              {preview}
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
