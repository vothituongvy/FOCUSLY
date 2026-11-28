import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { useApi } from '../components/useApi';
import { onSocket } from '../socket';
import { colors } from '../theme';
import { Button, Empty, H3, Muted, Row } from '../components/ui';
import { AppHeader } from '../components/AppHeader';
import { HubTiles } from '../components/HubTiles';
import { tr } from '../i18n';
import { ChatRow, NewChatSheet, type ChatItem } from './ChatScreens';
import { chatHeadNative, useChatHeadStatus } from '../chatHead';

/**
 * Tab "Cùng nhau": lối tắt Bạn bè, Phòng học chung, Lớp học + danh sách tin nhắn ngay trên tab
 * (không phải tìm trong Cá nhân như trước).
 */
export function CommunityScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const chats = useApi<{ items: ChatItem[] }>('/chats');
  const friends = useApi<{ items: { status: string }[] }>('/social/friends');
  const [newMode, setNewMode] = useState<'' | 'direct' | 'group'>('');
  const [refreshing, setRefreshing] = useState(false);
  const [bubble] = useChatHeadStatus();
  useEffect(() => {
    const offs = ['chat:message', 'chat:changed', 'chat:read'].map((e) => onSocket(e, () => void chats.reload()));
    const off2 = onSocket('friends:changed', () => void friends.reload());
    return () => {
      offs.forEach((f) => f());
      off2();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const requests = (friends.data?.items ?? []).filter((f) => f.status === 'incoming').length;
  const list = chats.data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title={tr('Cùng nhau')} subtitle={tr('Bạn bè, tin nhắn, phòng học, lớp học')} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([chats.reload(), friends.reload()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <HubTiles
          items={[
            { icon: 'users', label: tr('Bạn bè & xếp hạng'), note: requests ? tr('{0} lời mời mới', requests) : undefined, badge: requests, onPress: () => nav.navigate('Friends') },
            { icon: 'room', label: tr('Phòng học chung'), onPress: () => nav.navigate('Rooms') },
            { icon: 'school', label: tr('Lớp học'), onPress: () => nav.navigate('Classes') },
            { icon: 'library', label: tr('Thư viện cộng đồng'), onPress: () => nav.navigate('Library') },
          ]}
        />
        {bubble?.enabled && !bubble.permission && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.markerSoft, borderWidth: 1, borderColor: colors.marker }}>
            <Text style={{ flex: 1, color: colors.text, fontSize: 13.5 }}>{tr('Bật bong bóng chat để thấy tin nhắn nổi trên màn hình cả khi đang dùng app khác.')}</Text>
            <Button small title={tr('Bật')} onPress={() => chatHeadNative?.openPermission()} />
          </View>
        )}
        <Row style={{ flexWrap: 'nowrap', marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <H3>{tr('Tin nhắn')}</H3>
          </View>
          <Button small variant="secondary" icon="chat" title={tr('Nhắn')} onPress={() => setNewMode('direct')} />
          <Button small icon="users" title={tr('Tạo nhóm')} onPress={() => setNewMode('group')} />
        </Row>
        {!chats.data ? (
          <Muted>{tr('Đang tải…')}</Muted>
        ) : list.length === 0 ? (
          <Empty text={tr('Chưa có cuộc trò chuyện nào. Kết bạn rồi bấm “Nhắn” để bắt đầu.')} />
        ) : (
          <View style={{ gap: 2 }}>
            {list.map((c) => (
              <ChatRow key={c.id} c={c} onPress={() => nav.navigate('ChatThread', { chatId: c.id })} />
            ))}
          </View>
        )}
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{tr('Trong phiên tập trung, tin nhắn không làm phiền bạn.')}</Text>
      </ScrollView>
      <NewChatSheet
        mode={newMode}
        onClose={() => setNewMode('')}
        onCreated={(id) => {
          setNewMode('');
          void chats.reload();
          nav.navigate('ChatThread', { chatId: id });
        }}
      />
    </View>
  );
}
