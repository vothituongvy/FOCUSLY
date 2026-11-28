import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { unregisterPush } from '../push';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { User } from '../types';
import { Button, Card, Chip, Chips, Field, H1, H3, Muted, Row, Screen, s } from '../components/ui';
import { AppHeader } from '../components/AppHeader';
import { Icon, type IconName } from '../components/Icon';
import { LOCALE, tr } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { checkForUpdate } from '../updateCheck';
import { APP_VERSION } from '../config';
import { useUnreadChats } from './ChatScreens';
import { useIsAdmin } from './AdminScreens';
import { showAlert } from '../components/Dialog';

type MenuItem = { screen: keyof AppStackParams; label: string; icon: IconName };
/** Các mục giống thanh bên của bản Web, chia nhóm */
const MENU: { title: string; items: MenuItem[] }[] = [
  {
    title: tr('Học tập của tôi'),
    items: [
      { screen: 'Goals', label: tr('Mục tiêu học tập'), icon: 'flame' },
      { screen: 'AICoach', label: tr('Đề xuất & kế hoạch'), icon: 'zap' },
      { screen: 'Analytics', label: tr('Phân tích học tập'), icon: 'analytics' },
      { screen: 'WeeklyReport', label: tr('Báo cáo tuần'), icon: 'trophy' },
      { screen: 'History', label: tr('Lịch sử phiên học'), icon: 'history' },
      { screen: 'Journal', label: tr('Nhật ký phân tâm'), icon: 'journal' },
    ],
  },
  {
    title: tr('Cài đặt'),
    items: [
      { screen: 'Preferences', label: tr('Sở thích học tập'), icon: 'settings' },
      { screen: 'ShieldSettings', label: 'Focus Shield', icon: 'shield' },
      { screen: 'NotificationSettings', label: tr('Thông báo'), icon: 'bell' },
      { screen: 'Security', label: tr('Bảo mật'), icon: 'lock' },
    ],
  },
  {
    title: tr('Hỗ trợ'),
    items: [
      { screen: 'Feedback', label: tr('Góp ý & báo lỗi'), icon: 'chat' },
      { screen: 'Guide', label: tr('Hướng dẫn sử dụng'), icon: 'help' },
    ],
  },
];

export function ProfileScreen() {
  const [avatarBroken, setAvatarBroken] = useState(false);
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user, setUser, logout } = useAuth();
  const { online, pending, lastSyncAt, sync, syncing } = useData();
  const unreadChats = useUnreadChats();
  const isAdmin = useIsAdmin();
  if (!user) return null;
  const groups = isAdmin
    ? [...MENU, { title: tr('Quản trị'), items: [{ screen: 'AdminHome', label: tr('Quản trị hệ thống'), icon: 'analytics' } as MenuItem, { screen: 'AdminFeedback', label: tr('Góp ý & báo lỗi của người dùng'), icon: 'chat' } as MenuItem] }]
    : MENU;

  return (
    <Screen header={<AppHeader title={tr('Cá nhân')} />}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {user.avatarUrl && !avatarBroken ? (
          <Image onError={() => setAvatarBroken(true)} source={{ uri: user.avatarUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.onMarker }}>{user.name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{user.name}</Text>
          <Muted>{user.email}</Muted>
        </View>
      </Card>

      {groups.map((g) => (
        <View key={g.title} style={{ gap: 6 }}>
          <Muted style={{ paddingHorizontal: 4, fontWeight: '700' }}>{g.title}</Muted>
          <Card style={{ padding: 0, gap: 0 }}>
            {g.items.map((m, i) => (
              <Pressable
                key={m.screen}
                onPress={() => nav.navigate(m.screen as never)}
                style={({ pressed }) => ({ paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? colors.surface2 : 'transparent' })}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.markerSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={m.icon} size={18} color={colors.text} />
                </View>
                <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{m.label}</Text>
                {m.screen === 'Chats' && unreadChats > 0 && (
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 11.5, fontWeight: '800' }}>{unreadChats > 99 ? '99+' : unreadChats}</Text>
                  </View>
                )}
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <Card>
        <H3>{tr('Đồng bộ Web Mobile')}</H3>
        <Muted>
          {online ? 'Online' : 'Offline'}{' '}{tr('· {0} thay đổi chờ gửi', pending)}
          {lastSyncAt ? tr(' · lần cuối {0}', new Date(lastSyncAt).toLocaleTimeString(LOCALE)) : ''}
        </Muted>
        <Button title={syncing ? tr('Đang đồng bộ...') : tr('Đồng bộ ngay')} variant="secondary" small onPress={() => void sync()} />
      </Card>

      <Card>
        <H3>{tr('Giao diện')}</H3>
        <ThemeSwitch />
      </Card>

      <Card>
        <H3>{tr('Ngôn ngữ')}</H3>
        <LangSwitch />
      </Card>

      <Card>
        <H3>{tr('Phiên bản ứng dụng')}</H3>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>{tr('Đang dùng bản {0}', APP_VERSION)}</Muted>
          <Button title={tr('Kiểm tra cập nhật')} small variant="secondary" icon="download" onPress={() => void checkForUpdate(true)} />
        </Row>
      </Card>

      <Card>
        <H3>{tr('Tài khoản')}</H3>
        <Button
          title={tr('Đăng xuất các thiết bị khác')}
          variant="secondary"
          onPress={async () => {
            try {
              const r = await api<{ revoked: number }>('/users/me/sessions', { method: 'DELETE' });
              showAlert(tr('Xong'), tr('Đã đăng xuất {0} thiết bị.', r.revoked));
            } catch (e) {
              showAlert(tr('Lỗi'), errorMessage(e));
            }
          }}
        />
        <Button
          title={tr('Đăng xuất')}
          variant="danger"
          onPress={() =>
            showAlert(tr('Đăng xuất?'), pending ? tr('Còn {0} thay đổi chưa đồng bộ sẽ bị mất.', pending) : tr('Bạn chắc chắn muốn đăng xuất?'), [
              { text: tr('Huỷ'), style: 'cancel' },
              { text: tr('Đăng xuất'), style: 'destructive', onPress: () => void unregisterPush().finally(() => void logout()) },
            ])
          }
        />
      </Card>
      <Text style={[s.muted, { textAlign: 'center' }]}>FOCUSLY · Learn with focus. Grow with consistency.</Text>
    </Screen>
  );
}
