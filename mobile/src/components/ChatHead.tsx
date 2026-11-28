import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, View } from 'react-native';
import { Icon } from './Icon';
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
const HIDE_CHAT_ON = new Set(['ChatThread', 'Chats', 'Community']);
const HIDE_AI_ON = new Set(['AIChat', 'ChatThread', 'Review', 'QuizTake']);

/** Vòng ✕ ở dưới màn hình: kéo bong bóng vào đây để tắt */
function CloseTarget({ y, hot }: { y: number; hot: boolean }) {
  const W = Dimensions.get('window').width;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: W / 2 - 28, top: y, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: hot ? colors.danger : 'rgba(0,0,0,0.55)', transform: [{ scale: hot ? 1.15 : 1 }] }}
    >
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
    </View>
  );
}

/**
 * Một bong bóng nổi kéo thả được: thả ra tự bám mép gần nhất, kéo vào vòng ✕ để tắt.
 */
function Bubble({
  start,
  onPress,
  onDismiss,
  label,
  badge,
  preview,
  children,
}: {
  start: { x: number; y: number };
  onPress: () => void;
  onDismiss: () => void;
  label: string;
  badge?: number;
  preview?: { title: string; text: string } | null;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = Dimensions.get('window');
  const pos = useRef(new Animated.ValueXY(start)).current;
  const last = useRef(start);
  const [dragging, setDragging] = useState(false);
  const [hot, setHot] = useState(false);
  const closeY = H - insets.bottom - 110;
  const near = (x: number, y: number) => Math.abs(x + SIZE / 2 - W / 2) < 70 && y + SIZE / 2 > closeY - 40;
  const cb = useRef({ onDismiss });
  cb.current.onDismiss = onDismiss;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_e, g) => {
        const x = last.current.x + g.dx;
        const y = last.current.y + g.dy;
        pos.setValue({ x, y });
        setHot(near(x, y));
      },
      onPanResponderRelease: (_e, g) => {
        setDragging(false);
        setHot(false);
        const x = last.current.x + g.dx;
        const y = last.current.y + g.dy;
        if (near(x, y)) {
          pos.setValue(last.current);
          cb.current.onDismiss();
          return;
        }
        const toX = x + SIZE / 2 < W / 2 ? 10 : W - SIZE - 10;
        const toY = Math.min(Math.max(y, insets.top + 10), H - insets.bottom - SIZE - 90);
        last.current = { x: toX, y: toY };
        Animated.spring(pos, { toValue: last.current, friction: 6, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        setHot(false);
        Animated.spring(pos, { toValue: last.current, friction: 6, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const onLeft = last.current.x < W / 2;
  return (
    <>
      {dragging && <CloseTarget y={closeY} hot={hot} />}
      <Animated.View {...pan.panHandlers} style={{ position: 'absolute', left: 0, top: 0, transform: pos.getTranslateTransform() }}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}
        >
          {children}
          {!!badge && (
            <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </Pressable>
        {!!preview && !dragging && (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 6, [onLeft ? 'left' : 'right']: SIZE + 8, width: Math.min(230, W - SIZE - 40), backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 5 }}
          >
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }} numberOfLines={1}>
              {preview.title}
            </Text>
            <Text style={{ color: colors.text2, fontSize: 13 }} numberOfLines={2}>
              {preview.text}
            </Text>
          </View>
        )}
      </Animated.View>
    </>
  );
}

/**
 * Bong bóng nổi kiểu Messenger/Zalo trong app:
 * - "FOCUSLY AI": luôn nổi, chạm để hỏi Trợ lý AI.
 * - Tin nhắn: ảnh đại diện người nhắn khi có tin chưa đọc (cả lúc mới mở app), chạm để mở cuộc trò chuyện.
 * Kéo thả tự do, kéo vào vòng ✕ để tắt (mở lại app là hiện lại). Ẩn trong phiên tập trung.
 */
export function ChatHead({ route, onOpen, onOpenAI }: { route: string; onOpen: (chatId: string) => void; onOpenAI: () => void }) {
  const me = useAuth((s) => s.user?.id);
  const focusing = useSession((s) => Boolean(s.session));
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = Dimensions.get('window');
  const [chat, setChat] = useState<ChatItem | null>(null);
  const [preview, setPreview] = useState<{ title: string; text: string } | null>(null);
  const [aiOff, setAiOff] = useState(false);
  const [chatOff, setChatOff] = useState<string | null>(null); // đã tắt bong bóng của cuộc trò chuyện này
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** chọn cuộc trò chuyện chưa đọc mới nhất (bỏ qua cái đang mở / đã tắt thông báo) */
  const refresh = async (incoming?: { chatId: string; text: string }) => {
    try {
      const r = await api<{ items: ChatItem[] }>('/chats');
      const unread = r.items.filter((c) => c.unread > 0 && !c.muted && c.id !== getOpenChat());
      const pick = (incoming && unread.find((c) => c.id === incoming.chatId)) || unread[0] || null;
      setChat(pick);
      if (incoming && pick?.id === incoming.chatId) {
        setChatOff(null);
        setPreview({ title: pick.name, text: incoming.text });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setPreview(null), 4000);
      }
    } catch {
      /* mạng chập chờn: bỏ qua */
    }
  };

  useEffect(() => {
    if (!me) return;
    void refresh();
    const a = onSocket('chat:message', (raw) => {
      const p = raw as { chatId: string; message: { sender: string | null; text: string; image?: unknown } };
      if (!p?.message?.sender || p.message.sender === me) return;
      void refresh({ chatId: p.chatId, text: p.message.text || (p.message.image ? tr('📷 Ảnh') : '') });
    });
    const b = onSocket('chat:read', () => void refresh());
    return () => {
      a();
      b();
    };
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // rời màn trò chuyện -> xem lại còn tin chưa đọc không
  useEffect(() => {
    if (me && !HIDE_CHAT_ON.has(route)) void refresh();
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  if (focusing) return null;
  const showChat = chat && chatOff !== chat.id && !HIDE_CHAT_ON.has(route);
  const showAI = !aiOff && !HIDE_AI_ON.has(route);
  if (!showChat && !showAI) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {showAI && (
        <Bubble start={{ x: W - SIZE - 10, y: H - insets.bottom - SIZE - 170 }} label={tr('FOCUSLY AI – chạm để hỏi Trợ lý AI')} onPress={onOpenAI} onDismiss={() => setAiOff(true)}>
          <View style={{ width: SIZE - 4, height: SIZE - 4, borderRadius: (SIZE - 4) / 2, backgroundColor: '#1f2a44', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.marker }}>
            <Icon name="ai" size={26} color={colors.marker} strokeWidth={2} />
          </View>
        </Bubble>
      )}
      {showChat && chat && (
          <Bubble
            start={{ x: W - SIZE - 10, y: insets.top + 120 }}
            label={tr('Tin nhắn mới từ {0}. Chạm để mở', chat.name)}
            badge={Math.max(1, chat.unread)}
            preview={preview}
            onPress={() => {
              const id = chat.id;
              setChat(null);
              setPreview(null);
              onOpen(id);
            }}
            onDismiss={() => setChatOff(chat.id)}
          >
            <ChatAvatar chat={chat} size={SIZE - 4} />
          </Bubble>
      )}
    </View>
  );
}
