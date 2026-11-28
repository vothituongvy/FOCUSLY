import React, { ReactNode, useCallback, useState } from 'react';
import { Image, Pressable, StatusBar, View } from 'react-native';
import { Text } from './AppText';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { colors, fonts, isDark } from '../theme';
import type { AppStackParams } from '../navigation/types';
import { IconButton } from './ui';
import { tr } from '../i18n';
import { useUnreadChats } from '../screens/ChatScreens';

/**
 * Thanh tiêu đề trên cùng của mỗi tab: tên màn hình + thông báo + ảnh đại diện.
 */
export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const user = useAuth((s) => s.user);
  const [unread, setUnread] = useState(0);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const insets = useSafeAreaInsets();
  const unreadChats = useUnreadChats();

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api<{ unread: number }>('/notifications/unread-count')
        .then((r) => alive && setUnread(r.unread))
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );

  const initials = (user?.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <>
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: insets.top + 10,
        paddingBottom: 12,
        gap: 6,
        backgroundColor: colors.board,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.boardText, letterSpacing: -0.3, fontFamily: fonts.display }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={{ fontSize: 13, color: colors.boardMuted, marginTop: 3 }} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
      <IconButton name="chat" color={colors.boardText} label={tr('Tin nhắn')} badge={unreadChats} onPress={() => nav.navigate('Chats')} />
      <IconButton name="bell" color={colors.boardText} label={tr('Thông báo')} badge={unread} onPress={() => nav.navigate('Notifications')} />
      <Pressable
        onPress={() => nav.navigate('Tabs', { screen: 'Profile' } as never)}
        accessibilityRole="button"
        accessibilityLabel={tr('Trang cá nhân')}
        hitSlop={6}
        style={{ marginLeft: 2 }}
      >
        {user?.avatarUrl && !avatarBroken ? (
          <Image onError={() => setAvatarBroken(true)} source={{ uri: user.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border }} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontWeight: '800', color: colors.onMarker, fontSize: 13 }}>{initials}</Text>
          </View>
        )}
      </Pressable>
    </View>
    </>
  );
}
