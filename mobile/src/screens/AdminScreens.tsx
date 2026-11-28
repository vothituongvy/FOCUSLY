import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { api, errorMessage } from '../api/client';
import { useApi } from '../components/useApi';
import { colors } from '../theme';
import { Button, Card, Chip, Chips, Empty, Field, H1, H3, Loading, Muted, Row, Screen, s } from '../components/ui';
import { HubTiles } from '../components/HubTiles';
import { tr } from '../i18n';
import { APP_VERSION } from '../config';
import { Avatar } from './SocialScreens';

type Nav = NativeStackNavigationProp<AppStackParams>;
type FbType = 'bug' | 'idea' | 'other';
type FbStatus = 'new' | 'in_progress' | 'fixed' | 'wontfix';
const FB_STATUS: Record<FbStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Đã nhận', color: colors.text2, bg: colors.surface2 },
  in_progress: { label: 'Đang xử lý', color: colors.text, bg: colors.marker },
  fixed: { label: '✓ Đã sửa', color: colors.success, bg: colors.successSoft },
  wontfix: { label: 'Đã phản hồi', color: colors.text2, bg: colors.surface2 },
};
const FB_TYPE: Record<FbType, string> = { bug: '🐞 Báo lỗi', idea: '💡 Góp ý', other: '💬 Khác' };

function Badge({ st }: { st: FbStatus }) {
  const b = FB_STATUS[st];
  return <Text style={{ fontSize: 12, fontWeight: '700', color: b.color, backgroundColor: b.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' }}>{tr(b.label)}</Text>;
}

/** Hook: tài khoản hiện tại có phải quản trị viên không */
export function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    api<{ admin: boolean }>('/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);
  return admin;
}

/* ======================= Góp ý & báo lỗi (người dùng) ======================= */
interface Fb {
  id: string;
  type: FbType;
  message: string;
  status: FbStatus;
  reply: string;
  createdAt: string;
}
export function FeedbackScreen() {
  const mine = useApi<{ items: Fb[] }>('/feedback/mine');
  const [type, setType] = useState<FbType>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const send = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/feedback', { method: 'POST', body: { type, message: message.trim(), platform: Platform.OS, appVersion: APP_VERSION, device: `${Platform.OS} ${Platform.Version}`, page: 'app' } });
      setMessage('');
      setMsg(tr('Cảm ơn bạn! Đội FOCUSLY đã nhận được và sẽ báo cho bạn khi xử lý xong.'));
      void mine.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Muted>{tr('Gặp lỗi hay có ý tưởng làm FOCUSLY tốt hơn? Gửi trực tiếp cho đội phát triển – bạn sẽ nhận thông báo khi được xử lý.')}</Muted>
      <Card>
        <Chips>
          {(['bug', 'idea', 'other'] as FbType[]).map((t) => (
            <Chip key={t} label={tr(FB_TYPE[t])} active={type === t} onPress={() => setType(t)} />
          ))}
        </Chips>
        <Field
          label={type === 'bug' ? tr('Lỗi xảy ra như thế nào?') : type === 'idea' ? tr('Ý tưởng của bạn') : tr('Nội dung')}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={4000}
          placeholder={type === 'bug' ? tr('VD: Ở màn Ôn tập, bấm “Ôn bộ này” thì app thoát.') : tr('Viết càng cụ thể càng dễ làm nhé…')}
        />
        <Muted style={{ fontSize: 12 }}>{tr('App tự gửi kèm phiên bản và loại máy để dễ tìm lỗi.')}</Muted>
        {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={tr('Gửi cho đội FOCUSLY')} loading={busy} disabled={message.trim().length < 5} onPress={send} />
      </Card>
      <H3>{tr('Phản hồi bạn đã gửi')}</H3>
      {!mine.data ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : mine.data.items.length === 0 ? (
        <Empty text={tr('Bạn chưa gửi phản hồi nào.')} />
      ) : (
        mine.data.items.map((f) => (
          <Card key={f.id} style={{ gap: 6 }}>
            <Row style={{ flexWrap: 'nowrap' }}>
              <Muted style={{ flex: 1 }}>
                {tr(FB_TYPE[f.type])} · {new Date(f.createdAt).toLocaleDateString()}
              </Muted>
              <Badge st={f.status} />
            </Row>
            <Text style={{ color: colors.text }}>{f.message.length > 220 ? `${f.message.slice(0, 220)}…` : f.message}</Text>
            {!!f.reply && (
              <Text style={{ color: colors.text2, backgroundColor: colors.markerSoft, padding: 8, borderRadius: 8, overflow: 'hidden' }}>
                <Text style={{ fontWeight: '700' }}>{tr('FOCUSLY trả lời:')} </Text>
                {f.reply}
              </Text>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

/* ======================= Quản trị ======================= */
interface Summary {
  users: number;
  dau: number;
  newFeedback: number;
  openFeedback: number;
  disabledUsers: number;
}
interface Metrics {
  totals: { users: number; dau: number; wau: number; mau: number };
  activity: { day: string; dau: number; focusMinutes: number; signups: number }[];
  week: { focusMinutes: number; sessions: number; reviews: number; messages: number; ai: number; signups: number };
}

export function AdminHomeScreen() {
  const nav = useNavigation<Nav>();
  const sum = useApi<Summary>('/admin/summary');
  const m = useApi<Metrics>('/admin/metrics').data;
  if (sum.error) return <Screen><Text style={s.error}>{sum.error}</Text></Screen>;
  const series = m?.activity ?? [];
  const max = Math.max(1, ...series.map((a) => a.dau));
  return (
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(
          [
            [sum.data?.users, 'Tổng người dùng'],
            [sum.data?.dau, 'Hoạt động hôm nay'],
            [m?.totals.wau, '7 ngày (WAU)'],
            [m?.week.focusMinutes, 'Phút tập trung 7 ngày'],
          ] as const
        ).map(([v, l]) => (
          <Card key={l} style={{ flexBasis: '47%', flexGrow: 1, gap: 2 }}>
            <Muted>{tr(l)}</Muted>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{v === undefined ? '…' : v.toLocaleString()}</Text>
          </Card>
        ))}
      </View>
      {series.length > 0 && (
        <Card>
          <H3>{tr('Người dùng hoạt động (30 ngày)')}</H3>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 2 }} accessibilityLabel={tr('Người dùng hoạt động (30 ngày)')}>
            {series.map((a) => (
              <View key={a.day} style={{ flex: 1, height: `${Math.max(2, (a.dau / max) * 100)}%`, backgroundColor: colors.text, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            ))}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted style={{ fontSize: 11 }}>{series[0]?.day}</Muted>
            <Muted style={{ fontSize: 11 }}>{series[series.length - 1]?.day}</Muted>
          </Row>
          <Muted>
            {tr('7 ngày: {0} phiên · {1} lượt ôn thẻ · {2} tin nhắn · {3} lượt hỏi AI', m?.week.sessions ?? 0, m?.week.reviews ?? 0, m?.week.messages ?? 0, m?.week.ai ?? 0)}
          </Muted>
        </Card>
      )}
      <HubTiles
        items={[
          { icon: 'chat', label: tr('Góp ý & báo lỗi'), note: tr('{0} chưa xong', sum.data?.openFeedback ?? 0), badge: sum.data?.newFeedback, onPress: () => nav.navigate('AdminFeedback') },
          { icon: 'users', label: tr('Người dùng'), note: sum.data?.disabledUsers ? tr('{0} đang khoá', sum.data.disabledUsers) : undefined, onPress: () => nav.navigate('AdminUsers') },
          { icon: 'library', label: tr('Kiểm duyệt Thư viện'), onPress: () => nav.navigate('AdminLibrary') },
          { icon: 'bell', label: tr('Gửi thông báo'), onPress: () => nav.navigate('AdminBroadcast') },
        ]}
      />
      <Muted style={{ textAlign: 'center' }}>{tr('Biểu đồ và bảng số liệu đầy đủ có ở trang Thống kê hệ thống trên web.')}</Muted>
    </Screen>
  );
}

interface AdminFb extends Fb {
  page: string;
  platform: string;
  appVersion: string;
  adminNote: string;
  notifiedAt: string | null;
  user: { id: string; name: string; email: string } | null;
}
export function AdminFeedbackScreen() {
  const [status, setStatus] = useState<'open' | FbStatus | 'all'>('open');
  const res = useApi<{ items: AdminFb[]; counts: Record<string, number> }>(`/admin/feedback?status=${status}`);
  const [open, setOpen] = useState<AdminFb | null>(null);
  const [error, setError] = useState('');
  const c = res.data?.counts ?? {};
  const quick = async (f: AdminFb, next: FbStatus) => {
    setError('');
    try {
      await api(`/admin/feedback/${f.id}`, { method: 'PATCH', body: { status: next } });
      void res.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Screen>
      <Chips>
        <Chip label={`${tr('Chưa xong')} (${(c.new ?? 0) + (c.in_progress ?? 0)})`} active={status === 'open'} onPress={() => setStatus('open')} />
        <Chip label={`${tr('Mới')} (${c.new ?? 0})`} active={status === 'new'} onPress={() => setStatus('new')} />
        <Chip label={`${tr('Đang xử lý')} (${c.in_progress ?? 0})`} active={status === 'in_progress'} onPress={() => setStatus('in_progress')} />
        <Chip label={`${tr('Đã sửa')} (${c.fixed ?? 0})`} active={status === 'fixed'} onPress={() => setStatus('fixed')} />
        <Chip label={tr('Tất cả')} active={status === 'all'} onPress={() => setStatus('all')} />
      </Chips>
      {!!(error || res.error) && <Text style={s.error}>{error || res.error}</Text>}
      {!res.data ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : res.data.items.length === 0 ? (
        <Empty text={tr('Không có phản hồi nào ở mục này.')} />
      ) : (
        res.data.items.map((f) => (
          <Card key={f.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => quick(f, f.status === 'fixed' ? 'in_progress' : 'fixed')}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: f.status === 'fixed' }}
                accessibilityLabel={tr('Đánh dấu đã sửa')}
                style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 1.5, borderColor: f.status === 'fixed' ? colors.success : colors.borderStrong, backgroundColor: f.status === 'fixed' ? colors.successSoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}
              >
                {f.status === 'fixed' && <Text style={{ color: colors.success, fontWeight: '800' }}>✓</Text>}
              </Pressable>
              <Muted style={{ flex: 1 }} numberOfLines={1}>
                {tr(FB_TYPE[f.type])} · {f.user?.name ?? '—'} · {new Date(f.createdAt).toLocaleDateString()}
              </Muted>
              <Badge st={f.status} />
            </View>
            <Text style={{ color: colors.text }} numberOfLines={4}>
              {f.message}
            </Text>
            <Muted style={{ fontSize: 12 }}>
              {f.platform} {f.appVersion}
              {f.notifiedAt ? ` · 🔔 ${tr('đã báo')}` : ''}
            </Muted>
            <Button small variant="secondary" title={tr('Xử lý & trả lời')} onPress={() => setOpen(f)} />
          </Card>
        ))
      )}
      {open && <FeedbackSheet f={open} onClose={() => setOpen(null)} onSaved={() => (setOpen(null), void res.reload())} />}
    </Screen>
  );
}

function FeedbackSheet({ f, onClose, onSaved }: { f: AdminFb; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<FbStatus>(f.status === 'new' ? 'in_progress' : f.status);
  const [reply, setReply] = useState(f.reply);
  const [note, setNote] = useState(f.adminNote);
  const [notifyUser, setNotifyUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/feedback/${f.id}`, { method: 'PATCH', body: { status, reply, adminNote: note, notifyUser } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <H1>{tr(FB_TYPE[f.type])}</H1>
          <Text style={{ color: colors.text, backgroundColor: colors.surface2, padding: 12, borderRadius: 10, overflow: 'hidden' }}>{f.message}</Text>
          <Muted>
            {f.user?.name} ({f.user?.email}) · {f.platform} {f.appVersion} · {new Date(f.createdAt).toLocaleString()}
          </Muted>
          <Chips wrap>
            {(['new', 'in_progress', 'fixed', 'wontfix'] as FbStatus[]).map((x) => (
              <Chip key={x} label={tr(FB_STATUS[x].label)} active={status === x} onPress={() => setStatus(x)} />
            ))}
          </Chips>
          <Field label={tr('Trả lời người dùng (họ xem được)')} value={reply} onChangeText={setReply} multiline maxLength={2000} />
          <Field label={tr('Ghi chú nội bộ (chỉ admin thấy)')} value={note} onChangeText={setNote} multiline maxLength={2000} />
          <Row style={{ flexWrap: 'nowrap' }}>
            <Text style={{ flex: 1, color: colors.text }}>{tr('Gửi thông báo cho người gửi (trong app + điện thoại)')}</Text>
            <Switch value={notifyUser} onValueChange={setNotifyUser} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={colors.text} />
          </Row>
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button title={tr('Lưu')} loading={busy} onPress={save} />
          <Button variant="ghost" title={tr('Huỷ')} onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  lastActive: string | null;
  disabled: boolean;
  disabledReason: string;
  admin: boolean;
}
export function AdminUsersScreen() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [onlyDisabled, setOnlyDisabled] = useState(false);
  const res = useApi<{ items: AdminUser[]; total: number }>(`/admin/users?status=${onlyDisabled ? 'disabled' : 'all'}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const toggle = (u: AdminUser) => {
    const go = async (reason: string) => {
      setError('');
      try {
        await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { disabled: !u.disabled, reason } });
        void res.reload();
      } catch (e) {
        setError(errorMessage(e));
      }
    };
    if (u.disabled) return void go('');
    Alert.alert(tr('Khoá tài khoản {0}?', u.name), tr('Người này sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được cho tới khi mở khoá.'), [
      { text: tr('Huỷ'), style: 'cancel' },
      { text: tr('Khoá'), style: 'destructive', onPress: () => void go(tr('Vi phạm điều khoản sử dụng')) },
    ]);
  };
  return (
    <Screen>
      <TextInput value={q} onChangeText={setQ} placeholder={tr('Tìm theo tên hoặc email…')} placeholderTextColor="#9aa2b6" style={s.input} />
      <Chips>
        <Chip label={`${tr('Tất cả')} (${res.data?.total ?? '…'})`} active={!onlyDisabled} onPress={() => setOnlyDisabled(false)} />
        <Chip label={tr('Đang bị khoá')} active={onlyDisabled} onPress={() => setOnlyDisabled(true)} />
      </Chips>
      {!!(error || res.error) && <Text style={s.error}>{error || res.error}</Text>}
      {!res.data ? (
        <Loading />
      ) : res.data.items.length === 0 ? (
        <Empty text={tr('Không tìm thấy người dùng.')} />
      ) : (
        res.data.items.map((u) => (
          <Card key={u.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar name={u.name} url={u.avatarUrl} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={1}>
                  {u.name}
                  {u.admin ? ' · admin' : ''}
                </Text>
                <Muted numberOfLines={1}>{u.email}</Muted>
              </View>
            </View>
            <Muted style={{ fontSize: 12 }}>
              {tr('Đăng ký {0}', new Date(u.createdAt).toLocaleDateString())} · {tr('Hoạt động gần nhất {0}', u.lastActive ?? '—')}
            </Muted>
            {!u.admin && <Button small variant={u.disabled ? 'secondary' : 'danger'} title={u.disabled ? tr('Mở khoá tài khoản') : tr('Khoá tài khoản')} onPress={() => toggle(u)} />}
          </Card>
        ))
      )}
    </Screen>
  );
}

export function AdminLibraryScreen() {
  const [kind, setKind] = useState<'deck' | 'quiz' | 'material'>('deck');
  const res = useApi<{ items: { id: string; title: string; authorName: string; copies: number }[] }>(`/admin/library?kind=${kind}`);
  const [error, setError] = useState('');
  const unpublish = (i: { id: string; title: string }) =>
    Alert.alert(tr('Gỡ “{0}” khỏi Thư viện?', i.title), tr('Người chia sẻ sẽ nhận thông báo. Bản của họ vẫn còn nguyên.'), [
      { text: tr('Huỷ'), style: 'cancel' },
      {
        text: tr('Gỡ'),
        style: 'destructive',
        onPress: () =>
          void api(`/admin/library/${kind}/${i.id}/unpublish`, { method: 'POST', body: { reason: tr('Nội dung không phù hợp với quy định chia sẻ.') } })
            .then(() => res.reload())
            .catch((e) => setError(errorMessage(e))),
      },
    ]);
  return (
    <Screen>
      <Chips>
        <Chip label={`🃏 ${tr('Flashcard')}`} active={kind === 'deck'} onPress={() => setKind('deck')} />
        <Chip label={`📝 ${tr('Bộ câu hỏi')}`} active={kind === 'quiz'} onPress={() => setKind('quiz')} />
        <Chip label={`📄 ${tr('Tài liệu')}`} active={kind === 'material'} onPress={() => setKind('material')} />
      </Chips>
      {!!error && <Text style={s.error}>{error}</Text>}
      {!res.data ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : res.data.items.length === 0 ? (
        <Empty text={tr('Chưa có mục nào được chia sẻ.')} />
      ) : (
        res.data.items.map((i) => (
          <Card key={i.id} style={{ gap: 6 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{i.title}</Text>
            <Muted>
              {tr('bởi {0}', i.authorName || '—')} · {tr('{0} lượt sao chép', i.copies)}
            </Muted>
            <Button small variant="danger" title={tr('Gỡ khỏi thư viện')} onPress={() => unpublish(i)} />
          </Card>
        ))
      )}
    </Screen>
  );
}

export function AdminBroadcastScreen() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [active30, setActive30] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const send = () =>
    Alert.alert(tr('Gửi thông báo?'), active30 ? tr('Tới người dùng hoạt động 30 ngày qua.') : tr('Tới tất cả người dùng.'), [
      { text: tr('Huỷ'), style: 'cancel' },
      {
        text: tr('Gửi'),
        onPress: async () => {
          setBusy(true);
          setError('');
          setMsg('');
          try {
            const r = await api<{ recipients: number }>('/admin/broadcast', { method: 'POST', body: { title: title.trim(), body: body.trim(), audience: active30 ? 'active30' : 'all' } });
            setMsg(tr('Đang gửi tới {0} người dùng.', r.recipients));
            setTitle('');
            setBody('');
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <Screen>
      <Muted>{tr('Thông báo hiện trong mục Thông báo và đẩy tới điện thoại. Bản app mới được máy chủ tự báo, không cần gửi tay.')}</Muted>
      <Field label={tr('Tiêu đề')} value={title} onChangeText={setTitle} maxLength={120} placeholder={tr('VD: Ra mắt Phòng học chung 🎉')} />
      <Field label={tr('Nội dung')} value={body} onChangeText={setBody} multiline maxLength={500} />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Text style={{ flex: 1, color: colors.text }}>{tr('Chỉ người dùng hoạt động 30 ngày qua')}</Text>
        <Switch value={active30} onValueChange={setActive30} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={colors.text} />
      </Row>
      {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button variant="marker" icon="bell" title={tr('Gửi thông báo')} loading={busy} disabled={title.trim().length < 2} onPress={send} />
    </Screen>
  );
}
