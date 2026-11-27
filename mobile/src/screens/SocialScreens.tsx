import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, Share, Switch, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { api, errorMessage } from '../api/client';
import { useApi } from '../components/useApi';
import { onSocket } from '../socket';
import { colors } from '../theme';
import { Button, Card, Chip, Chips, Empty, Field, H1, H3, Loading, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
import { tr } from '../i18n';
import { WEB_URL } from '../config';

type Nav = NativeStackNavigationProp<AppStackParams>;

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) return <Image source={{ uri: url }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.markerSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontWeight: '800', color: colors.text }}>{(name.trim().split(' ').pop() ?? '?')[0]?.toUpperCase()}</Text>
    </View>
  );
}

const shareCode = (message: string) => void Share.share({ message }).catch(() => undefined);

/* ======================= Bạn bè & bảng xếp hạng ======================= */
interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: 'outgoing' | 'incoming' | 'accepted';
  buddy: boolean;
  buddyOfMe: boolean;
}
interface Board {
  weekStart: string;
  rows: { id: string; name: string; avatarUrl: string | null; me: boolean; minutes: number; streak: number; studyingNow: boolean; rank: number }[];
}
const CHEERS = ['Cố lên nhé! 💪', 'Vào phòng học chung không?', 'Học 25 phút cùng mình nhé!', 'Giỏi lắm, giữ chuỗi nha 🔥'];

export function FriendsScreen() {
  const nav = useNavigation<Nav>();
  const friends = useApi<{ code: string; items: Friend[] }>('/social/friends');
  const board = useApi<Board>('/social/leaderboard');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [cheerFor, setCheerFor] = useState<string | null>(null);
  useEffect(
    () =>
      onSocket('friends:changed', () => {
        void friends.reload();
        void board.reload();
      }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError('');
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
      await Promise.all([friends.reload(), board.reload()]);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const items = friends.data?.items ?? [];
  const accepted = items.filter((f) => f.status === 'accepted');
  const incoming = items.filter((f) => f.status === 'incoming');
  const outgoing = items.filter((f) => f.status === 'outgoing');
  const max = Math.max(1, ...(board.data?.rows.map((r) => r.minutes) ?? [1]));

  return (
    <Screen>
      <Card>
        <H3>{tr('Bảng xếp hạng tuần này')}</H3>
        {!board.data ? (
          <Muted>{tr('Đang tải…')}</Muted>
        ) : board.data.rows.length <= 1 ? (
          <Empty text={tr('Kết bạn bằng mã bên dưới để cùng thi đua phút tập trung mỗi tuần.')} />
        ) : (
          board.data.rows.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, backgroundColor: r.me ? colors.markerSoft : 'transparent' }}>
              <Text style={{ width: 22, textAlign: 'center', fontWeight: '800', color: r.rank === 1 ? colors.text : colors.muted }}>{r.rank}</Text>
              <Avatar name={r.name} url={r.avatarUrl} size={32} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text numberOfLines={1} style={{ fontWeight: '700', color: colors.text }}>
                  {r.me ? tr('Bạn') : r.name}
                  {r.studyingNow ? `  · ${tr('đang học')}` : ''}
                </Text>
                <ProgressBar value={r.minutes / max} />
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{tr('{0} phút', r.minutes)}</Text>
                <Muted>🔥 {r.streak}</Muted>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card>
        <H3>{tr('Kết bạn')}</H3>
        <Muted>{tr('Mã của bạn – gửi cho bạn bè để họ thêm bạn:')}</Muted>
        <Row>
          <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: 4, color: colors.text, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: 8 }}>{friends.data?.code ?? '······'}</Text>
          <Button small variant="secondary" icon="send" title={tr('Gửi mã')} onPress={() => friends.data && shareCode(tr('Kết bạn học cùng mình trên FOCUSLY nhé! Mã của mình: {0}', friends.data.code))} />
        </Row>
        <Field label={tr('Nhập mã của bạn bè')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} />
        <Button title={tr('Thêm bạn')} disabled={!code.trim()} onPress={() => run(() => api('/social/friends', { method: 'POST', body: { code: code.trim() } }).then(() => setCode('')), tr('Đã gửi lời mời kết bạn'))} />
        {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
        {!!error && <Text style={s.error}>{error}</Text>}
      </Card>

      {incoming.length > 0 && (
        <Card>
          <H3>{tr('Lời mời kết bạn')}</H3>
          {incoming.map((f) => (
            <Row key={f.id}>
              <Avatar name={f.name} url={f.avatarUrl} />
              <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{f.name}</Text>
              <Button small title={tr('Đồng ý')} onPress={() => run(() => api(`/social/friends/${f.id}/accept`, { method: 'POST', body: {} }))} />
              <Button small variant="ghost" title={tr('Bỏ qua')} onPress={() => run(() => api(`/social/friends/${f.id}`, { method: 'DELETE' }))} />
            </Row>
          ))}
        </Card>
      )}

      <Card>
        <H3>{tr('Bạn bè ({0})', accepted.length)}</H3>
        <Muted>{tr('Bật “Bạn đồng hành”: người đó nhận thông báo khi bạn bỏ dở một phiên học – để họ kéo bạn quay lại.')}</Muted>
        {accepted.length === 0 && outgoing.length === 0 && <Empty text={tr('Chưa có bạn bè. Gửi mã của bạn để bắt đầu.')} />}
        {accepted.map((f) => (
          <View key={f.id} style={{ gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Row>
              <Avatar name={f.name} url={f.avatarUrl} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {f.name}
                </Text>
                {f.buddyOfMe && <Muted>{tr('Đang là bạn đồng hành của bạn')}</Muted>}
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert(tr('Huỷ kết bạn với {0}?', f.name), '', [
                    { text: tr('Huỷ'), style: 'cancel' },
                    { text: tr('Huỷ kết bạn'), style: 'destructive', onPress: () => void run(() => api(`/social/friends/${f.id}`, { method: 'DELETE' })) },
                  ])
                }
                hitSlop={8}
                accessibilityLabel={tr('Huỷ kết bạn')}
              >
                <Icon name="x" size={18} color={colors.muted} />
              </Pressable>
            </Row>
            <Row>
              <Text style={{ color: colors.text2, flex: 1 }}>{tr('Bạn đồng hành')}</Text>
              <Switch value={f.buddy} onValueChange={(v) => run(() => api(`/social/friends/${f.id}`, { method: 'PATCH', body: { buddy: v } }))} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={colors.text} />
              <Button small icon="chat" title={tr('Nhắn tin')} onPress={() => run(() => api<{ item: { id: string } }>('/chats/direct', { method: 'POST', body: { friendId: f.id } }).then((r) => nav.navigate('ChatThread', { chatId: r.item.id })))} />
              <Button small variant="secondary" title={tr('Động viên')} onPress={() => setCheerFor(cheerFor === f.id ? null : f.id)} />
            </Row>
            {cheerFor === f.id && (
              <Chips wrap>
                {CHEERS.map((c) => (
                  <Chip key={c} label={tr(c)} onPress={() => run(() => api(`/social/friends/${f.id}/cheer`, { method: 'POST', body: { text: tr(c) } }).then(() => setCheerFor(null)), tr('Đã gửi tới {0}', f.name))} />
                ))}
              </Chips>
            )}
          </View>
        ))}
        {outgoing.map((f) => (
          <Row key={f.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Avatar name={f.name} url={f.avatarUrl} />
            <Text style={{ flex: 1, color: colors.text }}>{f.name}</Text>
            <Muted>{tr('đã gửi lời mời')}</Muted>
          </Row>
        ))}
      </Card>
      <Button title={tr('Phòng học chung')} variant="secondary" icon="room" onPress={() => nav.navigate('Rooms')} />
    </Screen>
  );
}

/* ======================= Phòng học chung ======================= */
interface RoomItem {
  id: string;
  name: string;
  code: string;
  members: number;
  online: number;
  timer: { phase: 'idle' | 'focus' | 'break' };
}
export function RoomsScreen({ route }: NativeStackScreenProps<AppStackParams, 'Rooms'>) {
  const nav = useNavigation<Nav>();
  const list = useApi<{ items: RoomItem[] }>('/social/rooms');
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('25');
  const [brk, setBrk] = useState('5');
  const [code, setCode] = useState(route.params?.code ?? '');
  const [error, setError] = useState('');
  const go = async (path: string, body: unknown) => {
    setError('');
    try {
      const r = await api<{ item: { id: string } }>(path, { method: 'POST', body });
      nav.navigate('Room', { roomId: r.item.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  useEffect(() => {
    if (route.params?.code) void go('/social/rooms/join', { code: route.params.code });
  }, [route.params?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen>
      <Muted>{tr('Cả phòng chạy chung một đồng hồ Pomodoro: cùng tập trung, cùng nghỉ. Gửi mã phòng cho bạn bè để học cùng.')}</Muted>
      <Card>
        <H3>{tr('Vào phòng bằng mã')}</H3>
        <Field label={tr('Mã phòng')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} placeholder="ABC123" />
        <Button title={tr('Vào phòng')} disabled={!code.trim()} onPress={() => go('/social/rooms/join', { code: code.trim() })} />
      </Card>
      <Card>
        <H3>{tr('Tạo phòng mới')}</H3>
        <Field label={tr('Tên phòng')} value={name} onChangeText={setName} placeholder={tr('VD: Ôn thi Toán 12A1')} maxLength={80} />
        <Row style={{ flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <Field label={tr('Tập trung (phút)')} value={focus} onChangeText={setFocus} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Nghỉ (phút)')} value={brk} onChangeText={setBrk} keyboardType="number-pad" />
          </View>
        </Row>
        <Button variant="secondary" title={tr('Tạo phòng')} onPress={() => go('/social/rooms', { name: name.trim() || tr('Phòng học'), focusMinutes: Math.min(120, Math.max(5, Number(focus) || 25)), breakMinutes: Math.min(60, Math.max(1, Number(brk) || 5)) })} />
        {!!error && <Text style={s.error}>{error}</Text>}
      </Card>
      <H3>{tr('Phòng của bạn')}</H3>
      {!list.data ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : list.data.items.length === 0 ? (
        <Empty text={tr('Bạn chưa ở phòng nào. Tạo một phòng hoặc nhập mã bạn bè gửi.')} />
      ) : (
        list.data.items.map((r) => (
          <Pressable key={r.id} onPress={() => nav.navigate('Room', { roomId: r.id })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{r.name}</Text>
                <Muted>
                  {tr('Mã {0}', r.code)} · {tr('{0} thành viên', r.members)} · {tr('{0} đang online', r.online)}
                </Muted>
              </View>
              <Muted>{r.timer.phase === 'focus' ? tr('đang tập trung') : r.timer.phase === 'break' ? tr('đang nghỉ') : tr('chưa chạy')}</Muted>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

interface Room {
  id: string;
  code: string;
  name: string;
  focusMinutes: number;
  breakMinutes: number;
  runningSince: string | null;
  serverTime: string;
  members: { id: string; name: string; avatarUrl: string | null; online: boolean; owner: boolean; weekMinutes: number }[];
  messages: { name: string; text: string; at: string }[];
}
function phaseAt(runningSince: string | null, f: number, b: number, now: number) {
  if (!runningSince) return { phase: 'idle' as const, remaining: f * 60, round: 0, total: f * 60 };
  const elapsed = Math.max(0, Math.floor((now - new Date(runningSince).getTime()) / 1000));
  const cycle = (f + b) * 60;
  const pos = elapsed % cycle;
  const inFocus = pos < f * 60;
  return { phase: inFocus ? ('focus' as const) : ('break' as const), remaining: inFocus ? f * 60 - pos : cycle - pos, round: Math.floor(elapsed / cycle) + 1, total: inFocus ? f * 60 : b * 60 };
}
const mmss = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;

export function RoomScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'Room'>) {
  const id = route.params.roomId;
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [now, setNow] = useState(Date.now());
  const skew = useRef(0);
  const apply = useCallback((r: Room) => {
    skew.current = new Date(r.serverTime).getTime() - Date.now();
    setRoom(r);
    navigation.setOptions({ title: r.name });
  }, [navigation]);
  const load = useCallback(() => api<{ item: Room }>(`/social/rooms/${id}`).then((r) => apply(r.item)).catch((e) => setError(errorMessage(e))), [id, apply]);
  useEffect(() => {
    void load();
    const ping = () => api<{ item: Room }>(`/social/rooms/${id}/ping`, { method: 'POST', body: {} }).then((r) => apply(r.item)).catch(() => undefined);
    void ping();
    const t = setInterval(ping, 30_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const off = onSocket('room:update', (p) => (p as { id: string }).id === id && void load());
    return () => {
      clearInterval(t);
      clearInterval(tick);
      off();
    };
  }, [id, load, apply]);
  const act = async (path: string, body: unknown) => {
    setError('');
    try {
      apply((await api<{ item: Room }>(path, { method: 'POST', body })).item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  if (!room) return error ? <Screen><Text style={s.error}>{error}</Text></Screen> : <Loading />;
  const p = phaseAt(room.runningSince, room.focusMinutes, room.breakMinutes, now + skew.current);

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 24, borderColor: p.phase === 'focus' ? colors.text : colors.cardBorder, backgroundColor: p.phase === 'break' ? colors.successSoft : colors.card }}>
        <Muted>{p.phase === 'focus' ? tr('Đang tập trung · vòng {0}', p.round) : p.phase === 'break' ? tr('Giờ nghỉ · vòng {0}', p.round) : tr('Đồng hồ chưa chạy')}</Muted>
        <Text style={{ fontSize: 64, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>{mmss(p.remaining)}</Text>
        <View style={{ alignSelf: 'stretch' }}>
          <ProgressBar value={1 - p.remaining / p.total} />
        </View>
        {room.runningSince ? (
          <Button variant="secondary" icon="stop" title={tr('Dừng đồng hồ chung')} onPress={() => act(`/social/rooms/${id}/timer`, { action: 'stop' })} />
        ) : (
          <Button variant="marker" icon="play" title={tr('Bắt đầu cùng cả phòng')} onPress={() => act(`/social/rooms/${id}/timer`, { action: 'start' })} />
        )}
        <Button variant="ghost" small title={tr('Mở phiên tập trung của tôi')} onPress={() => (navigation as unknown as { navigate: (n: string, p?: object) => void }).navigate('Tabs', { screen: 'Focus' })} />
        <Muted style={{ textAlign: 'center' }}>{tr('Mở thêm phiên tập trung của riêng bạn để phút học được tính vào chuỗi ngày và bảng xếp hạng.')}</Muted>
      </Card>

      <Row>
        <Text style={{ color: colors.text2 }}>
          {tr('Mã phòng')} <Text style={{ fontWeight: '800', letterSpacing: 2, color: colors.text }}>{room.code}</Text>
        </Text>
        <Button small variant="secondary" icon="send" title={tr('Mời bạn')} onPress={() => shareCode(tr('Vào phòng học “{0}” cùng mình trên FOCUSLY! Mã phòng: {1} – {2}', room.name, room.code, `${WEB_URL}/rooms?code=${room.code}`))} />
      </Row>

      <Card>
        <H3>{tr('Thành viên ({0})', room.members.length)}</H3>
        {room.members.map((m) => (
          <Row key={m.id}>
            <View>
              <Avatar name={m.name} url={m.avatarUrl} size={32} />
              <View style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.card, backgroundColor: m.online ? colors.success : colors.borderStrong }} />
            </View>
            <Text style={{ flex: 1, color: colors.text }} numberOfLines={1}>
              {m.name}
              {m.owner ? ` (${tr('chủ phòng')})` : ''}
            </Text>
            <Muted>{tr('{0} phút/tuần', m.weekMinutes)}</Muted>
          </Row>
        ))}
      </Card>

      <Card>
        <H3>{tr('Trò chuyện')}</H3>
        {room.messages.length === 0 && <Muted>{tr('Chào cả phòng một câu nhé!')}</Muted>}
        {room.messages.slice(-30).map((m, i) => (
          <Text key={i} style={{ color: m.name ? colors.text : colors.muted, fontSize: 13.5 }}>
            {m.name ? <Text style={{ fontWeight: '700' }}>{m.name}: </Text> : '• '}
            {m.text}
          </Text>
        ))}
        <Row style={{ flexWrap: 'nowrap' }}>
          <TextInput value={text} onChangeText={setText} placeholder={tr('Nhắn cho cả phòng…')} placeholderTextColor="#9aa2b6" maxLength={300} style={[s.input, { flex: 1 }]} />
          <Button
            small
            title={tr('Gửi')}
            disabled={!text.trim()}
            onPress={() => {
              void act(`/social/rooms/${id}/messages`, { text: text.trim() });
              setText('');
            }}
          />
        </Row>
      </Card>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        variant="danger"
        title={tr('Rời phòng')}
        onPress={() =>
          Alert.alert(tr('Rời phòng này?'), '', [
            { text: tr('Huỷ'), style: 'cancel' },
            { text: tr('Rời phòng'), style: 'destructive', onPress: () => void api(`/social/rooms/${id}/leave`, { method: 'POST', body: {} }).then(() => navigation.goBack()) },
          ])
        }
      />
    </Screen>
  );
}

/* ======================= Báo cáo tuần ======================= */
interface Report {
  range: { from: string; to: string };
  minutes: number;
  prevMinutes: number;
  change: number | null;
  targetMinutes: number;
  activeDays: number;
  days: { date: string; label: string; minutes: number }[];
  bestDay: { date: string; label: string; minutes: number } | null;
  sessions: number;
  cardsReviewed: number;
  quizzes: number;
  quizAccuracy: number | null;
  tasksDone: number;
  streak: number;
  dueCards: number;
  friendRank: { rank: number; of: number } | null;
}
export function WeeklyReportScreen() {
  const r = useApi<Report>('/social/weekly-report').data;
  if (!r) return <Loading />;
  const max = Math.max(1, ...r.days.map((d) => d.minutes));
  const stat = (label: string, value: string, note?: string) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 4 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{value}</Text>
      {!!note && <Muted>{note}</Muted>}
    </Card>
  );
  return (
    <Screen>
      <Muted>
        {r.range.from} → {r.range.to}
      </Muted>
      <Card>
        <Muted>{tr('Thời gian tập trung 7 ngày qua')}</Muted>
        <H1>{r.minutes >= 60 ? tr('{0} giờ {1} phút', Math.floor(r.minutes / 60), r.minutes % 60) : tr('{0} phút', r.minutes)}</H1>
        <Muted>{r.change === null ? tr('Tuần trước chưa có dữ liệu để so sánh.') : r.change >= 0 ? tr('Tăng {0}% so với tuần trước ({1})', r.change, tr('{0} phút', r.prevMinutes)) : tr('Giảm {0}% so với tuần trước ({1})', -r.change, tr('{0} phút', r.prevMinutes))}</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, marginTop: 8 }}>
          {r.days.map((d) => (
            <View key={d.date} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
              <Muted style={{ fontSize: 11 }}>{d.minutes || ''}</Muted>
              <View style={{ width: 20, height: Math.max(3, (d.minutes / max) * 90), borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: r.bestDay?.date === d.date ? colors.marker : colors.text }} />
              <Text style={{ fontSize: 12, color: colors.text2 }}>{tr(d.label)}</Text>
            </View>
          ))}
        </View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {stat(tr('Ngày có học'), `${r.activeDays}/7`, tr('Chuỗi hiện tại {0} ngày', r.streak))}
        {stat(tr('Phiên hoàn thành'), String(r.sessions), tr('{0} nhiệm vụ xong', r.tasksDone))}
        {stat(tr('Thẻ đã ôn'), String(r.cardsReviewed), r.dueCards ? tr('{0} thẻ đến hạn trong 24 giờ', r.dueCards) : undefined)}
        {stat(tr('Bài kiểm tra'), String(r.quizzes), r.quizAccuracy !== null ? tr('Đúng trung bình {0}%', r.quizAccuracy) : undefined)}
      </View>
      {r.friendRank && <Muted>{tr('Bạn đứng thứ {0}/{1} trong nhóm bạn bè.', r.friendRank.rank, r.friendRank.of)}</Muted>}
      <Muted>{tr('Tự gửi qua thông báo và email lúc 19:00 tối Chủ nhật (bật/tắt trong Cài đặt → Thông báo).')}</Muted>
    </Screen>
  );
}

