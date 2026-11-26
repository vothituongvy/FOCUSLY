import React, { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
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

const MENU: { screen: 'Journal' | 'Materials' | 'AIChat' | 'Notifications' | 'Analytics'; label: string }[] = [
  { screen: 'Analytics', label: ' Phân tích học tập' },
  { screen: 'Journal', label: ' Nhật ký phân tâm' },
  { screen: 'Materials', label: ' Tài liệu' },
  { screen: 'AIChat', label: ' Trợ lý AI' },
  { screen: 'Notifications', label: ' Thông báo' },
];

export function ProfileScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { user, setUser, logout } = useAuth();
  const { online, pending, lastSyncAt, sync, syncing } = useData();
  const [name, setName] = useState(user?.name ?? '');
  const [goal, setGoal] = useState(user?.profile.learningGoal ?? '');
  const [target, setTarget] = useState(String(user?.profile.dailyTargetMinutes ?? 120));
  const [blockList, setBlockList] = useState<string[]>(user?.shield.blockList ?? []);
  const [domain, setDomain] = useState('');
  const [msg, setMsg] = useState('');

  if (!user) return null;

  const saveProfile = async () => {
    try {
      const r = await api<{ user: User }>('/users/me', {
        method: 'PATCH',
        body: { name, profile: { learningGoal: goal, dailyTargetMinutes: Number(target) || 0 } },
      });
      setUser(r.user);
      setMsg('Đã lưu ✓');
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  const saveShield = async (list: string[]) => {
    setBlockList(list);
    try {
      await api('/shield', { method: 'PUT', body: { blockList: list } });
      const me = await api<{ user: User }>('/users/me');
      setUser(me.user);
    } catch (e) {
      Alert.alert('Không lưu được', errorMessage(e));
    }
  };

  return (
    <Screen header={<AppHeader title="Cá nhân" />}>
      <Row>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{user.name[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{user.name}</Text>
          <Muted>{user.email}</Muted>
        </View>
      </Row>

      <Card style={{ padding: 0, gap: 0 }}>
        {MENU.map((m, i) => (
          <Pressable key={m.screen} onPress={() => nav.navigate(m.screen as never)} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{m.label}</Text>
            <Text style={{ color: colors.muted }}>›</Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <H3>Đồng bộ Web Mobile</H3>
        <Muted>
          {online ? 'Online' : 'Offline'} · {pending} thay đổi chờ gửi
          {lastSyncAt ? ` · lần cuối ${new Date(lastSyncAt).toLocaleTimeString('vi-VN')}` : ''}
        </Muted>
        <Button title={syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'} variant="secondary" small onPress={() => void sync()} />
      </Card>

      <Card>
        <H3>Hồ sơ học tập</H3>
        <Field label="Họ tên" value={name} onChangeText={setName} />
        <Field label="Mục tiêu học tập" value={goal} onChangeText={setGoal} multiline />
        <Field label="Thời lượng học mỗi ngày (phút)" value={target} onChangeText={setTarget} keyboardType="number-pad" />
        <Muted>Múi giờ: {user.profile.timezone} · Chỉnh khung giờ học, Pomodoro mặc định trên Web.</Muted>
        {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
        <Button title="Lưu hồ sơ" onPress={saveProfile} />
      </Card>

      <Card>
        <H3>Focus Shield – Block List</H3>
        <Muted>Danh sách website bị Chrome Extension chặn khi bạn đang học (kể cả khi bắt đầu phiên trên điện thoại).</Muted>
        <Chips>
          {blockList.map((d) => (
            <Chip key={d} label={`${d}  ✕`} onPress={() => saveShield(blockList.filter((x) => x !== d))} />
          ))}
        </Chips>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Thêm website" value={domain} onChangeText={setDomain} autoCapitalize="none" placeholder="vd: reddit.com" />
          </View>
          <Button
            title="Thêm"
            small
            style={{ marginTop: 22 }}
            onPress={() => {
              const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
              if (d && !blockList.includes(d)) void saveShield([...blockList, d]);
              setDomain('');
            }}
          />
        </Row>
        <Muted style={{ fontSize: 11 }}>
          Lưu ý: trên Android, việc chặn ứng dụng khác cần quyền hệ thống đặc biệt (Accessibility/Usage Access) – dự kiến ở giai đoạn sau. Phiên bản hiện tại
          phát hiện khi bạn rời FOCUSLY và ghi vào Nhật ký phân tâm.
        </Muted>
      </Card>

      <Card>
        <H3>Tài khoản</H3>
        <Button
          title="Đăng xuất các thiết bị khác"
          variant="secondary"
          onPress={async () => {
            try {
              const r = await api<{ revoked: number }>('/users/me/sessions', { method: 'DELETE' });
              Alert.alert('Xong', `Đã đăng xuất ${r.revoked} thiết bị.`);
            } catch (e) {
              Alert.alert('Lỗi', errorMessage(e));
            }
          }}
        />
        <Button
          title="Đăng xuất"
          variant="danger"
          onPress={() =>
            Alert.alert('Đăng xuất?', pending ? `Còn ${pending} thay đổi chưa đồng bộ sẽ bị mất.` : 'Bạn chắc chắn muốn đăng xuất?', [
              { text: 'Huỷ', style: 'cancel' },
              { text: 'Đăng xuất', style: 'destructive', onPress: () => void unregisterPush().finally(() => void logout()) },
            ])
          }
        />
      </Card>
      <Text style={[s.muted, { textAlign: 'center' }]}>FOCUSLY · Learn with focus. Grow with consistency.</Text>
    </Screen>
  );
}
