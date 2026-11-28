import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, View } from 'react-native';
import { Text } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { FocusSession, NotificationSettings, User } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, H3, Muted, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
import { LANG, LOCALE, tr } from '../i18n';
import { refreshPushToken } from '../push';
import { GUIDE } from '../guide';

type Nav = NativeStackNavigationProp<AppStackParams>;

const fmtDur = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}p`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* ======================= Lịch sử phiên học ======================= */
const STATUS: Record<string, string> = {
  active: tr('Đang chạy'),
  paused: tr('Tạm dừng'),
  on_break: tr('Đang nghỉ'),
  completed: tr('Hoàn thành'),
  abandoned: tr('Đã huỷ'),
};
const DEVICE: Record<string, string> = { web: 'Web', android: 'Android', ios: 'iOS', unknown: '—' };
const PAGE = 20;

export function HistoryScreen() {
  const { sessions, subjects, tasks } = useData();
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<FocusSession | null>(null);
  const list = useMemo(() => sessions.filter((x) => !status || x.status === status), [sessions, status]);
  const refId = (v: unknown) => (typeof v === 'string' ? v : (v as { id?: string; _id?: string } | null)?.id ?? (v as { _id?: string } | null)?._id ?? null);
  const subjectOf = (x: FocusSession) => (typeof x.subject === 'object' && x.subject ? x.subject : subjects.find((sb) => sb.id === refId(x.subject)) ?? null);
  const taskOf = (x: FocusSession) => (typeof x.task === 'object' && x.task ? x.task : tasks.find((t) => t.id === refId(x.task)) ?? null);
  const totalFocus = list.reduce((a, x) => a + (x.actualFocusSeconds || 0), 0);

  return (
    <Screen>
      <Card>
        <Muted>{tr('Mọi phiên học trên Web và Mobile.')}</Muted>
        <Chips>
          {[
            ['', tr('Tất cả')],
            ['completed', tr('Hoàn thành')],
            ['abandoned', tr('Đã huỷ')],
          ].map(([v, l]) => (
            <Chip key={v} label={l} active={status === v} onPress={() => { setStatus(v); setLimit(PAGE); }} />
          ))}
        </Chips>
        <Row style={{ justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{list.length}</Text>
            <Muted>{tr('phiên')}</Muted>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{fmtDur(totalFocus)}</Text>
            <Muted>{tr('tập trung')}</Muted>
          </View>
        </Row>
      </Card>
      {list.length === 0 && <Empty text={tr('Chưa có phiên học nào.')} />}
      {list.slice(0, limit).map((x) => {
        const sb = subjectOf(x);
        const tk = taskOf(x);
        return (
          <Pressable key={x.id} onPress={() => setDetail(x)}>
            <Card style={{ gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Muted style={{ fontSize: 12 }}>{fmtDateTime(x.startedAt)} · {DEVICE[x.device] ?? '—'}</Muted>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: x.status === 'completed' ? colors.successSoft : colors.surface2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: x.status === 'completed' ? colors.success : colors.text2 }}>{STATUS[x.status] ?? x.status}</Text>
                </View>
              </Row>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={2}>{x.goal || (tk ? tk.title : tr('Phiên học'))}</Text>
              {(sb || tk) && (
                <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                  {sb ? `${sb.icon ?? ''} ${sb.name}` : ''}{sb && tk ? ' · ' : ''}{tk ? tk.title : ''}
                </Muted>
              )}
              <Row style={{ gap: 16 }}>
                <Muted style={{ fontSize: 12 }}>{tr('Tập trung')}: <Text style={{ fontWeight: '800', color: colors.text }}>{fmtDur(x.actualFocusSeconds)}</Text></Muted>
                {!!x.plannedMinutes && <Muted style={{ fontSize: 12 }}>{tr('Dự kiến')}: {x.plannedMinutes}p</Muted>}
                <Muted style={{ fontSize: 12 }}>{tr('Phân tâm')}: {x.distractionCount}</Muted>
              </Row>
            </Card>
          </Pressable>
        );
      })}
      {list.length > limit && <Button title={tr('Xem thêm')} variant="secondary" onPress={() => setLimit(limit + PAGE)} />}

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setDetail(null)} />
        {detail && (
          <View style={{ maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <H3>{tr('Chi tiết phiên học')}</H3>
              <Pressable hitSlop={10} onPress={() => setDetail(null)}>
                <Icon name="x" size={22} color={colors.text} />
              </Pressable>
            </Row>
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{detail.goal}</Text>
              <Muted>
                {fmtDateTime(detail.startedAt)} – {detail.endedAt ? fmtDateTime(detail.endedAt) : tr('đang mở')}
              </Muted>
              {detail.segments.map((seg, i) => {
                const end = seg.endedAt ? new Date(seg.endedAt) : new Date();
                const secs = (end.getTime() - new Date(seg.startedAt).getTime()) / 1000;
                return (
                  <Row key={i} style={{ flexWrap: 'nowrap', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Icon name={seg.type === 'focus' ? 'focus' : 'coffee'} size={16} color={colors.text2} />
                    <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>
                      {new Date(seg.startedAt).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })} – {seg.endedAt ? end.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '…'}
                      {seg.endReason === 'auto_pause' ? ` · ${tr('tự tạm dừng')}` : ''}
                    </Text>
                    <Text style={{ fontWeight: '700', color: colors.text, fontSize: 13 }}>{fmtDur(secs)}</Text>
                  </Row>
                );
              })}
              {!!detail.summary?.note && <Text style={{ color: colors.text }}>{detail.summary.note}</Text>}
            </ScrollView>
          </View>
        )}
      </Modal>
    </Screen>
  );
}

/* ======================= Hướng dẫn sử dụng ======================= */
const LINK_TO_SCREEN: Record<string, { tab?: string; screen?: keyof AppStackParams }> = {
  '/dashboard': { tab: 'Dashboard' },
  '/plan': { tab: 'Plan' },
  '/focus': { tab: 'Focus' },
  '/learn': { tab: 'Learn' },
  '/materials': { screen: 'Materials' },
  '/ai': { screen: 'AIChat' },
  '/analytics': { screen: 'Analytics' },
  '/settings': { screen: 'Preferences' },
  '/settings?tab=shield': { screen: 'ShieldSettings' },
  '/exams': { screen: 'Exams' },
  '/friends': { screen: 'Friends' },
  '/messages': { screen: 'Chats' },
  '/rooms': { screen: 'Rooms' },
  '/classes': { screen: 'Classes' },
  '/library': { screen: 'Library' },
  '/report': { screen: 'WeeklyReport' },
};

export function GuideScreen() {
  const nav = useNavigation<Nav>();
  const sections = GUIDE[LANG] ?? GUIDE.vi;
  const [open, setOpen] = useState<string | null>(sections[0]?.id ?? null);
  const go = (href: string) => {
    const t = LINK_TO_SCREEN[href];
    if (!t) return;
    if (t.tab) nav.navigate('Tabs', { screen: t.tab } as never);
    else if (t.screen) nav.navigate(t.screen as never);
  };
  return (
    <Screen>
      <Muted>{tr('Bấm vào từng mục để xem cách dùng. Ứng dụng điện thoại và web dùng chung một tài khoản.')}</Muted>
      {sections.map((g) => {
        const on = open === g.id;
        return (
          <Card key={g.id} style={{ gap: 10 }}>
            <Pressable onPress={() => setOpen(on ? null : g.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: on ? colors.marker : colors.markerSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={g.icon} size={20} color={colors.text} />
              </View>
              <Text style={{ flex: 1, fontWeight: '700', fontSize: 16, color: colors.text }}>{g.title}</Text>
              <Icon name={on ? 'chevronLeft' : 'chevronRight'} size={18} color={colors.muted} />
            </Pressable>
            {on && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.text2, lineHeight: 21 }}>{g.intro}</Text>
                {g.steps?.map((st, i) => (
                  <Row key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontWeight: '800', color: colors.text, fontSize: 12 }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, color: colors.text, lineHeight: 21 }}>{st}</Text>
                  </Row>
                ))}
                {g.points.map((p, i) => (
                  <Row key={i} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <Text style={{ color: colors.text2, lineHeight: 21 }}>•</Text>
                    <Text style={{ flex: 1, color: colors.text, lineHeight: 21 }}>{p}</Text>
                  </Row>
                ))}
                {!!g.tip && (
                  <View style={{ backgroundColor: colors.markerSoft, borderRadius: 10, padding: 10 }}>
                    <Text style={{ color: colors.text, lineHeight: 20 }}>{g.tip}</Text>
                  </View>
                )}
                {g.link && LINK_TO_SCREEN[g.link.href] && <Button title={g.link.label} small variant="secondary" onPress={() => go(g.link!.href)} />}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

/* ======================= Cài đặt: sở thích học tập ======================= */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function useSaveUser() {
  const setUser = useAuth((st) => st.setUser);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const save = async (body: Record<string, unknown>) => {
    setMsg('');
    setError('');
    try {
      const r = await api<{ user: User }>('/users/me', { method: 'PATCH', body });
      setUser(r.user);
      setMsg(tr('Đã lưu ✓'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return { save, msg, error };
}

function SaveLine({ msg, error }: { msg: string; error: string }) {
  if (error) return <Text style={s.error}>{error}</Text>;
  if (msg) return <Text style={{ color: colors.success }}>{msg}</Text>;
  return null;
}

export function PreferencesScreen() {
  const user = useAuth((st) => st.user);
  const { save, msg, error } = useSaveUser();
  const [name, setName] = useState(user?.name ?? '');
  const [p, setP] = useState(user!.profile);
  const [subjectsText, setSubjectsText] = useState(user?.profile.interestedSubjects.join(', ') ?? '');
  const [target, setTarget] = useState(String(user?.profile.dailyTargetMinutes ?? 120));
  const [pomo, setPomo] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(user?.profile.defaultPomodoro ?? {}).map(([k, v]) => [k, String(v)])),
  );
  if (!user) return null;

  const submit = () => {
    const times = p.preferredStudyTimes.filter((t) => TIME_RE.test(t.start) && TIME_RE.test(t.end));
    void save({
      name,
      profile: {
        learningGoal: p.learningGoal,
        interestedSubjects: subjectsText.split(',').map((x) => x.trim()).filter(Boolean),
        preferredStudyTimes: times,
        dailyTargetMinutes: Number(target) || 0,
        timezone: p.timezone,
        language: p.language,
        defaultPomodoro: Object.fromEntries(Object.entries(pomo).map(([k, v]) => [k, Math.max(1, Number(v) || 1)])),
      },
    });
  };

  return (
    <Screen>
      <Card>
        <H3>{tr('Hồ sơ học tập')}</H3>
        <Field label={tr('Họ tên')} value={name} onChangeText={setName} />
        <Field label={tr('Mục tiêu học tập')} value={p.learningGoal} onChangeText={(v) => setP({ ...p, learningGoal: v })} multiline placeholder={tr('VD: Đạt IELTS 6.5 trước tháng 6')} />
        <Field label={tr('Môn học quan tâm (phân tách bằng dấu phẩy)')} value={subjectsText} onChangeText={setSubjectsText} placeholder={tr('Tiếng Anh, Toán, Lịch sử')} />
        <Field label={tr('Thời lượng học mục tiêu mỗi ngày (phút)')} value={target} onChangeText={setTarget} keyboardType="number-pad" />
        <Muted>{tr('Múi giờ: {0}', p.timezone)}</Muted>
      </Card>

      <Card>
        <H3>{tr('Khung giờ học mong muốn')}</H3>
        <Muted>{tr('Dùng để nhắc lịch học. Nhập giờ dạng 19:00.')}</Muted>
        {p.preferredStudyTimes.map((t, i) => (
          <Row key={i} style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}>
              <Field label={tr('Từ')} value={t.start} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(v) => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.map((x, j) => (j === i ? { ...x, start: v } : x)) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={tr('đến')} value={t.end} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(v) => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.map((x, j) => (j === i ? { ...x, end: v } : x)) })} />
            </View>
            <Pressable hitSlop={8} style={{ marginTop: 22, padding: 6 }} onPress={() => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.filter((_, j) => j !== i) })}>
              <Icon name="trash" size={20} color={colors.muted} />
            </Pressable>
          </Row>
        ))}
        <Button title={tr('+ Thêm khung giờ')} small variant="secondary" onPress={() => setP({ ...p, preferredStudyTimes: [...p.preferredStudyTimes, { start: '19:00', end: '21:00' }] })} />
      </Card>

      <Card>
        <H3>{tr('Pomodoro mặc định')}</H3>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(
            [
              ['focusMinutes', tr('Tập trung')],
              ['breakMinutes', tr('Nghỉ ngắn')],
              ['longBreakMinutes', tr('Nghỉ dài')],
              ['cyclesBeforeLongBreak', tr('Số vòng')],
            ] as const
          ).map(([k, l]) => (
            <View key={k} style={{ width: '47%', flexGrow: 1 }}>
              <Field label={l} value={pomo[k] ?? ''} keyboardType="number-pad" onChangeText={(v) => setPomo({ ...pomo, [k]: v })} />
            </View>
          ))}
        </View>
      </Card>

      <SaveLine msg={msg} error={error} />
      <Button title={tr('Lưu')} onPress={submit} />
    </Screen>
  );
}

/* ======================= Cài đặt: Focus Shield ======================= */
function ToggleRow({ title, hint, value, onChange }: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{title}</Text>
        {!!hint && <Muted style={{ fontSize: 12 }}>{hint}</Muted>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={value ? colors.text : '#ffffff'} />
    </Row>
  );
}

const cleanDomain = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

function DomainList({ title, hint, items, onChange, placeholder }: { title: string; hint?: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [domain, setDomain] = useState('');
  const add = () => {
    const d = cleanDomain(domain);
    if (d && !items.includes(d)) onChange([...items, d]);
    setDomain('');
  };
  return (
    <Card>
      <H3>{title}</H3>
      {!!hint && <Muted>{hint}</Muted>}
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label={tr('Thêm website')} value={domain} onChangeText={setDomain} autoCapitalize="none" keyboardType="url" placeholder={placeholder} onSubmitEditing={add} />
        </View>
        <Button title={tr('Thêm')} small onPress={add} />
      </Row>
      <Chips wrap>
        {items.map((d) => (
          <Chip key={d} label={`${d}  ✕`} onPress={() => onChange(items.filter((x) => x !== d))} />
        ))}
      </Chips>
      {items.length === 0 && <Muted>{tr('Chưa có website nào.')}</Muted>}
    </Card>
  );
}

export function ShieldSettingsScreen() {
  const user = useAuth((st) => st.user);
  const setUser = useAuth((st) => st.setUser);
  const sh = user!.shield;
  const [blockList, setBlockList] = useState(sh.blockList);
  const [allowList, setAllowList] = useState(sh.allowList ?? []);
  const [autoEnable, setAutoEnable] = useState(sh.autoEnableOnSession);
  const [strict, setStrict] = useState(sh.strictByDefault ?? false);
  const [hide, setHide] = useState(sh.hideDistractions);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setMsg('');
    setError('');
    try {
      await api('/shield', {
        method: 'PUT',
        body: {
          blockList,
          allowList,
          strictByDefault: strict,
          autoEnableOnSession: autoEnable,
          hideDistractions: hide,
          schedule: sh.schedule.map(({ days, start, end, enabled }) => ({ days, start, end, enabled })),
        },
      });
      const me = await api<{ user: User }>('/users/me');
      setUser(me.user);
      setMsg(tr('Đã lưu ✓'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <Card>
        <ToggleRow title={tr('Tự bật Focus Shield khi bắt đầu phiên')} hint={tr('Có thể tắt riêng cho từng phiên.')} value={autoEnable} onChange={setAutoEnable} />
        <ToggleRow title={tr('Mặc định dùng Phiên nghiêm ngặt')} hint={tr('Khoá tab, chỉ mở trang được phép, đồng hồ dừng khi bạn rời FOCUSLY.')} value={strict} onChange={setStrict} />
        <ToggleRow title={tr('Ẩn thành phần gây xao nhãng (Focus Mode)')} hint={tr('Che sidebar, thông báo, chỉ hiển thị đồng hồ và mục tiêu.')} value={hide} onChange={setHide} />
      </Card>
      <DomainList
        title={tr('Block List – website gây phân tâm')}
        hint={tr('Danh sách website bị Chrome Extension chặn khi bạn đang học (kể cả khi bắt đầu phiên trên điện thoại).')}
        items={blockList}
        onChange={setBlockList}
        placeholder="vd: facebook.com"
      />
      <DomainList
        title={tr('Trang được phép trong Phiên nghiêm ngặt')}
        hint={tr('Ngoài FOCUSLY, chỉ những trang này mở được khi phiên nghiêm ngặt đang chạy. Thêm trang bạn cần khi học, ví dụ từ điển hay trang bài giảng của trường.')}
        items={allowList}
        onChange={setAllowList}
        placeholder="vd: wikipedia.org"
      />
      <Muted style={{ fontSize: 12 }}>
        {tr('Lưu ý: trên Android, việc chặn ứng dụng khác cần quyền hệ thống đặc biệt (Accessibility/Usage Access) – dự kiến ở giai đoạn sau. Phiên bản hiện tại phát hiện khi bạn rời FOCUSLY và ghi vào Nhật ký phân tâm.')}
      </Muted>
      <SaveLine msg={msg} error={error} />
      <Button title={tr('Lưu cấu hình Shield')} onPress={save} />
    </Screen>
  );
}

/* ======================= Cài đặt: thông báo ======================= */
export function NotificationSettingsScreen() {
  const [st, setSt] = useState<NotificationSettings | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [minutes, setMinutes] = useState('');
  const [times, setTimes] = useState({ dailySummaryTime: '', quietStart: '', quietEnd: '' });

  useEffect(() => {
    api<{ settings: NotificationSettings; pushAvailable: boolean }>('/notifications/settings')
      .then((r) => {
        setSt(r.settings);
        setPushAvailable(r.pushAvailable);
        setMinutes(String(r.settings.taskReminderMinutes));
        setTimes({ dailySummaryTime: r.settings.dailySummaryTime, quietStart: r.settings.quietStart, quietEnd: r.settings.quietEnd });
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const save = async (next: NotificationSettings) => {
    setSt(next);
    setMsg('');
    setError('');
    try {
      await api('/notifications/settings', { method: 'PUT', body: next });
      setMsg(tr('Đã lưu ✓'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!st) return <Screen>{error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.text} />}</Screen>;

  const toggles: [keyof NotificationSettings, string, string][] = [
    ['studyReminder', tr('Nhắc lịch học'), tr('Theo khung giờ học mong muốn trong Sở thích học tập')],
    ['taskReminder', tr('Nhắc nhiệm vụ sắp đến hạn'), ''],
    ['breakReminder', tr('Nhắc nghỉ giữa phiên'), tr('Khi hết thời gian Pomodoro')],
    ['dailySummary', tr('Tổng kết cuối ngày'), ''],
    ['reviewReminder', tr('Nhắc ôn flashcard đến hạn'), tr('Lúc 8:00 nếu có ≥ 5 thẻ')],
    ['weeklyReport', tr('Báo cáo tuần'), tr('19:00 tối Chủ nhật: tổng kết 7 ngày, so với tuần trước')],
    ['weeklyEmail', tr('Gửi báo cáo tuần qua email'), tr('Kèm biểu đồ phút học từng ngày')],
    ['chatMessages', tr('Tin nhắn mới'), tr('Thông báo khi bạn bè hoặc nhóm nhắn tin')],
    ['chatDuringFocus', tr('Báo tin nhắn cả khi đang tập trung'), tr('Mặc định tắt: tin nhắn chờ tới khi bạn kết thúc phiên')],
    ['push', tr('Gửi thông báo đẩy đến điện thoại'), pushAvailable ? '' : tr('Máy chủ chưa cấu hình Firebase (FCM)')],
  ];

  const saveFields = () => {
    const bad = Object.values(times).some((t) => !TIME_RE.test(t));
    if (bad) return setError(tr('Giờ cần có dạng HH:MM, ví dụ 21:30.'));
    void save({ ...st, ...times, taskReminderMinutes: Math.min(1440, Math.max(5, Number(minutes) || 30)) });
  };

  return (
    <Screen>
      <Card>
        {toggles.map(([k, label, hint]) => (
          <ToggleRow key={k} title={label} hint={hint} value={Boolean(st[k])} onChange={(v) => save({ ...st, [k]: v })} />
        ))}
      </Card>
      <Card>
        <Field label={tr('Nhắc nhiệm vụ trước (phút)')} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
        <Field label={tr('Giờ tổng kết ngày')} value={times.dailySummaryTime} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(v) => setTimes({ ...times, dailySummaryTime: v })} />
        <Row style={{ flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <Field label={tr('Giờ yên lặng – bắt đầu')} value={times.quietStart} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(v) => setTimes({ ...times, quietStart: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Giờ yên lặng – kết thúc')} value={times.quietEnd} maxLength={5} keyboardType="numbers-and-punctuation" onChangeText={(v) => setTimes({ ...times, quietEnd: v })} />
          </View>
        </Row>
        <Button title={tr('Lưu')} onPress={saveFields} />
      </Card>
      <SaveLine msg={msg} error={error} />
      <PushCheck />
    </Screen>
  );
}

/* ======================= Cài đặt: bảo mật ======================= */
interface LoginSession {
  id: string;
  platform: string;
  userAgent: string;
  ip: string;
  lastUsedAt: string;
  current: boolean;
}

export function SecurityScreen() {
  const user = useAuth((st) => st.user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions((await api<{ sessions: LoginSession[] }>('/users/me/sessions')).sessions);
    } catch {
      setSessions([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const change = async () => {
    setMsg('');
    setError('');
    try {
      await api('/users/me/change-password', { method: 'POST', body: { currentPassword: current || undefined, newPassword: next, logoutOtherDevices: true } });
      setMsg(tr('Đổi mật khẩu thành công. Các thiết bị khác đã bị đăng xuất.'));
      setCurrent('');
      setNext('');
      void load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <Card>
        <H3>{user?.hasPassword ? tr('Đổi mật khẩu') : tr('Đặt mật khẩu (tài khoản Google)')}</H3>
        {user?.hasPassword && <Field label={tr('Mật khẩu hiện tại')} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />}
        <Field label={tr('Mật khẩu mới (≥ 8 ký tự, có chữ và số)')} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
        <SaveLine msg={msg} error={error} />
        <Button title={tr('Cập nhật')} disabled={next.length < 8} onPress={change} />
      </Card>
      <Card>
        <H3>{tr('Phiên đăng nhập')}</H3>
        {sessions === null && <ActivityIndicator color={colors.text} />}
        {sessions?.map((x) => (
          <Row key={x.id} style={{ flexWrap: 'nowrap', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {x.platform}
                {x.current ? `  · ${tr('Thiết bị này')}` : ''}
              </Text>
              <Muted style={{ fontSize: 12 }} numberOfLines={2}>
                {x.userAgent || tr('Không rõ')} · {x.ip} · {new Date(x.lastUsedAt).toLocaleString(LOCALE)}
              </Muted>
            </View>
            {!x.current && (
              <Button
                title={tr('Đăng xuất')}
                small
                variant="ghost"
                onPress={async () => {
                  await api(`/users/me/sessions/${x.id}`, { method: 'DELETE' }).catch(() => undefined);
                  void load();
                }}
              />
            )}
          </Row>
        ))}
        <Button
          title={tr('Đăng xuất các thiết bị khác')}
          variant="secondary"
          onPress={async () => {
            try {
              const r = await api<{ revoked: number }>('/users/me/sessions', { method: 'DELETE' });
              Alert.alert(tr('Xong'), tr('Đã đăng xuất {0} thiết bị.', r.revoked));
              void load();
            } catch (e) {
              Alert.alert(tr('Lỗi'), errorMessage(e));
            }
          }}
        />
      </Card>
    </Screen>
  );
}

/* ---------- Kiểm tra thông báo đẩy: chỉ ra chính xác chỗ hỏng ---------- */
interface PushDiag {
  serverReady: boolean;
  pushSetting: boolean;
  quietHours: boolean;
  quietStart?: string;
  quietEnd?: string;
  devices: number;
  results: { platform: string; ok: boolean; error?: string }[];
}
function PushCheck() {
  // công cụ kiểm tra / gửi thử chỉ dành cho quản trị viên
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    api<{ admin: boolean }>('/admin/me')
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  }, []);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ ok: boolean; text: string }[]>([]);
  const run = async () => {
    setBusy(true);
    const out: { ok: boolean; text: string }[] = [];
    try {
      const local = await refreshPushToken();
      out.push(local.permission ? { ok: true, text: tr('Điện thoại cho phép FOCUSLY hiện thông báo') } : { ok: false, text: tr('Điện thoại đang CHẶN thông báo của FOCUSLY – vào Cài đặt Android → Ứng dụng → FOCUSLY → Thông báo → Bật') });
      out.push(local.ok ? { ok: true, text: tr('Đã đăng ký máy này với máy chủ') } : { ok: false, text: tr('Không lấy được mã thiết bị: {0}', local.error ?? '') });
      const d = await api<PushDiag>('/notifications/push-check', { method: 'POST', body: {} });
      out.push(d.serverReady ? { ok: true, text: tr('Máy chủ đã bật thông báo đẩy (Firebase)') } : { ok: false, text: tr('Máy chủ chưa cấu hình Firebase (FIREBASE_SERVICE_ACCOUNT_BASE64)') });
      if (!d.pushSetting) out.push({ ok: false, text: tr('Bạn đang tắt “Gửi thông báo đẩy đến điện thoại” ở trên') });
      if (d.quietHours) out.push({ ok: false, text: tr('Đang trong giờ yên lặng ({0}–{1}): nhắc học sẽ không đẩy tới máy', d.quietStart ?? '', d.quietEnd ?? '') });
      if (!d.devices) out.push({ ok: false, text: tr('Máy chủ chưa có máy nào của bạn') });
      d.results.forEach((r, i) =>
        out.push(
          r.ok
            ? { ok: true, text: tr('Đã gửi thử tới máy {0} – xem thanh thông báo', i + 1) }
            : {
                ok: false,
                text: /mismatched-credential|sender-id|third-party-auth/i.test(r.error ?? '')
                  ? tr('Máy {0}: khoá Firebase trên máy chủ KHÁC project với app (google-services.json). Tạo lại khoá ở đúng project.', i + 1)
                  : tr('Máy {0}: gửi lỗi ({1})', i + 1, r.error ?? '?'),
              },
        ),
      );
    } catch (e) {
      out.push({ ok: false, text: errorMessage(e) });
    } finally {
      setLines(out);
      setBusy(false);
    }
  };
  if (!admin) return null;
  return (
    <Card>
      <H3>{tr('Kiểm tra thông báo đẩy')}</H3>
      <Muted>{tr('Không thấy thông báo ngoài app? Bấm để kiểm tra từng bước và gửi một thông báo thử tới máy này.')}</Muted>
      <Button title={tr('Kiểm tra ngay')} variant="secondary" icon="bell" loading={busy} onPress={run} />
      {lines.map((l, i) => (
        <Text key={i} style={{ color: l.ok ? colors.success : colors.danger, fontSize: 13.5 }}>
          {l.ok ? '✓ ' : '✕ '}
          {l.text}
        </Text>
      ))}
    </Card>
  );
}
