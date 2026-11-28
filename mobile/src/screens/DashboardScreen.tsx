import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { api } from '../api/client';
import { kvGet, kvSet } from '../offline/db';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { useSession } from '../store/session';
import { colors, tints } from '../theme';
import type { Dashboard, FocusSession } from '../types';
import type { TabParams } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { Icon, type IconName } from '../components/Icon';
import { Button, Card, Empty, Muted, Paper, ProgressBar, Section, SyncBar } from '../components/ui';
import { FadeIn, useAnimatedNumber } from '../components/motion';
import { LOCALE, tr } from '../i18n';
import { DailyQuests } from '../components/Gamify';
import { updateWidget } from '../native';


function spoken(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return tr('{0} phút', r);
  return r ? tr('{0} giờ {1} phút', h, r) : tr('{0} giờ', h);
}

/** Thẻ đầu trang: tím chàm, chữ trắng, điểm nhấn vàng */
const HERO = { bg: colors.hero, border: colors.heroBorder, muted: colors.muted };

function spokenShort(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return tr('{0}p', r);
  return r ? tr('{0}g {1}p', h, r) : tr('{0}g', h);
}

function todayLabel() {
  const s = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Thước kẻ của ngày: phiên tập trung là vạch dạ quang đặt đúng giờ đã học */
function DayRuler({ sessions }: { sessions: FocusSession[] }) {
  const [width, setWidth] = useState(0);
  const now = Date.now();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const segs = sessions.flatMap((s) => s.segments.map((g) => ({ type: g.type, from: +new Date(g.startedAt), to: g.endedAt ? +new Date(g.endedAt) : now })));
  const firstHour = Math.min(6, ...segs.map((g) => new Date(g.from).getHours()));
  const from = +start + firstHour * 3600_000;
  const to = +start + 24 * 3600_000;
  const x = (t: number) => (Math.max(0, Math.min(1, (t - from) / (to - from))) * width);
  const hours = Array.from({ length: 24 - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: 58, borderWidth: 1, borderColor: colors.text, borderRadius: 8, backgroundColor: colors.surface, overflow: 'hidden' }}
      accessibilityLabel={tr('Các khoảng thời gian bạn đã tập trung hôm nay')}
    >
      {width > 0 &&
        hours.map((h) => {
          const left = x(+start + h * 3600_000);
          const major = h % 6 === 0;
          return (
            <React.Fragment key={h}>
              <View style={{ position: 'absolute', bottom: 0, left, width: 1, height: major ? 18 : 9, backgroundColor: major ? '#8a93a8' : colors.borderStrong }} />
              {major && h < 24 && <Text style={{ position: 'absolute', top: 4, left: h === firstHour ? left + 5 : left - 8, fontSize: 10, color: colors.muted }}>{h}h</Text>}
            </React.Fragment>
          );
        })}
      {width > 0 &&
        segs
          .filter((g) => g.to > from)
          .map((g, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: 22,
                bottom: 8,
                left: x(g.from),
                width: Math.max(3, x(g.to) - x(g.from)),
                backgroundColor: g.type === 'break' ? colors.neutralBar : colors.marker,
                borderRadius: 2,
              }}
            />
          ))}
      {width > 0 && <View style={{ position: 'absolute', top: 0, bottom: 0, left: x(now), width: 2, backgroundColor: colors.danger }} />}
    </View>
  );
}

/** Cột biểu đồ mọc dần lên */
function GrowBar({ pct, style }: { pct: number; style: StyleProp<ViewStyle> }) {
  const h = useAnimatedNumber(pct, 700);
  return <Animated.View style={[style, { height: h.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />;
}

function Metric({
  icon,
  tint,
  label,
  value,
  unit,
  note,
  noteColor,
}: {
  icon: IconName;
  tint: { bg: string; border: string; ink: string };
  label: string;
  value: string;
  unit?: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <Paper style={{ flex: 1, minHeight: 138, backgroundColor: tint.bg, borderRadius: 14, borderWidth: 1, borderColor: tint.border, padding: 14, gap: 8 }} radius={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={tint.ink} />
        </View>
        <Text style={{ flex: 1, fontSize: 13, color: colors.text2, fontWeight: '600' }} numberOfLines={2}>
          {label}
        </Text>
      </View>
      {/* con số nằm giữa phần còn lại của thẻ */}
      <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5, textAlign: 'center' }}>
          {value}
          {!!unit && <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '600' }}>{unit}</Text>}
        </Text>
      </View>
      {/* luôn giữ dòng ghi chú để 4 ô cao bằng nhau */}
      <Text style={{ fontSize: 12, color: noteColor ?? colors.muted, textAlign: 'center' }} numberOfLines={2}>
        {note ?? ' '}
      </Text>
    </Paper>
  );
}

export function DashboardScreen() {
  const nav = useNavigation<BottomTabNavigationProp<TabParams>>();
  const user = useAuth((s) => s.user);
  const { sync, sessions, cards } = useData();
  const active = useSession((s) => s.session);
  const [data, setData] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Dashboard>('/dashboard');
      setData(d);
      setOffline(false);
      await kvSet('dashboard', d);
    } catch {
      setOffline(true);
      const cached = await kvGet<Dashboard>('dashboard');
      if (cached) setData(cached);
    }
  }, []);

  useEffect(() => {
    void kvGet<Dashboard>('dashboard').then((d) => d && setData((cur) => cur ?? d));
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await sync();
    await load();
    setRefreshing(false);
  };

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todaySessions = [...sessions, ...(active ? [active] : [])].filter((s, i, arr) => new Date(s.startedAt) >= dayStart && arr.findIndex((x) => x.id === s.id) === i);

  const focusMin = (data?.studyTime.todaySeconds ?? 0) / 60;
  const target = data?.dailyGoal.targetMinutes ?? user?.profile.dailyTargetMinutes ?? 120;
  const left = target - focusMin;
  const headline =
    focusMin < 1
      ? tr('Hôm nay chưa có phiên học nào. Mục tiêu là {0}.', spoken(target))
      : left > 0
        ? tr('Đã tập trung {0}, còn {1} nữa là đạt mục tiêu.', spoken(focusMin), spoken(left))
        : tr('Đã tập trung {0}, vượt mục tiêu {1}.', spoken(focusMin), spoken(target));
  const max = Math.max(target, ...(data?.weeklyProgress.map((d) => d.focusMinutes) ?? [1]), 1);

  // cập nhật widget màn hình chính mỗi khi số liệu hôm nay đổi
  const dueCount = cards.filter((c) => !c.suspended && new Date(c.srs?.due ?? 0).getTime() <= Date.now()).length;
  useEffect(() => {
    if (!data) return;
    updateWidget({
      minutes: String(Math.round(focusMin)),
      minutesLabel: tr('/{0} phút hôm nay', target),
      cardsLine: dueCount ? tr('🃏 {0} thẻ cần ôn – chạm để ôn', dueCount) : tr('🃏 Không có thẻ đến hạn'),
      streakLine: data.streak.current ? `🔥 ${data.streak.current}` : '',
      startLabel: tr('▶ Bắt đầu 25 phút'),
      progress: Math.min(100, Math.round((focusMin / Math.max(1, target)) * 100)),
    });
  }, [data, dueCount, focusMin, target]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={[]}>
      <AppHeader title={tr('Chào {0}', user?.name.split(' ').slice(-1)[0] ?? tr('bạn'))} subtitle={todayLabel()} />
      <SyncBar />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.text]} tintColor={colors.text} />}>
        {offline && <Muted style={{ color: colors.warning }}>{tr('Đang hiển thị dữ liệu đã lưu vì không có mạng.')}</Muted>}

        <FadeIn>
        <Card style={{ padding: 18, gap: 14, backgroundColor: HERO.bg, borderColor: HERO.border, borderLeftWidth: 1, borderLeftColor: HERO.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 13, color: HERO.muted, fontWeight: '600' }}>{tr('Thời gian tập trung hôm nay')}</Text>
              <Text style={{ fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -1, marginTop: 2 }}>
                {spokenShort(focusMin)}
                <Text style={{ fontSize: 16, color: HERO.muted, fontWeight: '600' }}> / {spokenShort(target)}</Text>
              </Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
              {Math.min(100, Math.round((focusMin / Math.max(1, target)) * 100))}%
            </Text>
          </View>
          <ProgressBar value={focusMin / Math.max(1, target)} color={colors.marker} track={colors.track} />
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{headline}</Text>
          <DayRuler sessions={todaySessions} />
          {active ? (
            <Pressable onPress={() => nav.navigate('Focus')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <View style={{ backgroundColor: colors.surface, borderColor: HERO.border, borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="focus" size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {active.status === 'active' ? tr('Phiên học đang chạy') : active.status === 'on_break' ? tr('Đang nghỉ giữa phiên') : tr('Phiên học đang tạm dừng')}
                  </Text>
                  <Muted>{active.goal}</Muted>
                </View>
                <Icon name="chevronRight" size={20} color={colors.muted} />
              </View>
            </Pressable>
          ) : (
            <Button title={tr('Bắt đầu tập trung')} icon="play" variant="marker" onPress={() => nav.navigate('Focus')} />
          )}
        </Card>
        </FadeIn>

        {data && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              <FadeIn delay={80} style={{ width: '48.5%' }}>
                <Metric icon="check" tint={tints.mint} label={tr('Nhiệm vụ xong')} value={String(data.tasks.completed)} unit={`/${data.tasks.total}`} note={data.tasks.overdue ? tr('{0} việc quá hạn', data.tasks.overdue) : undefined} noteColor={colors.danger} />
              </FadeIn>
              <FadeIn delay={140} style={{ width: '48.5%' }}>
                <Metric icon="flame" tint={tints.lemon} label={tr('Chuỗi ngày học')} value={String(data.streak.current)} unit={tr(' ngày')} note={tr('Dài nhất {0} ngày', data.streak.best)} />
              </FadeIn>
              <FadeIn delay={200} style={{ width: '48.5%' }}>
                <Metric icon="zap" tint={tints.peach} label={tr('Lần phân tâm')} value={String(data.distractionsToday.manual)} note={tr('Rời app {0} lần', data.distractionsToday.appLeaves)} />
              </FadeIn>
              <FadeIn delay={260} style={{ width: '48.5%' }}>
                <Metric icon="focus" tint={tints.sky} label={tr('Điểm tập trung')} value={String(data.focusScore.score)} unit="/100" note={tr('Chỉ để tham khảo')} />
              </FadeIn>
            </View>

            <FadeIn delay={300}>
              <DailyQuests />
            </FadeIn>

            <FadeIn delay={340}>
            <Section title={tr('Việc tiếp theo')}>
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {data.upcomingTasks.length === 0 && <Empty text={tr('Chưa có nhiệm vụ. Thêm ở tab Kế hoạch.')} />}
                {data.upcomingTasks.map((t, i) => (
                  <Pressable
                    key={t.id}
                    onPress={() => nav.navigate('Focus', { taskId: t.id })}
                    accessibilityRole="button"
                    accessibilityLabel={tr('Học {0}', t.title)}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 })}
                  >
                    <View style={{ width: 10, height: 36, borderRadius: 4, backgroundColor: t.subject?.color ?? colors.borderStrong }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 15, color: colors.text }} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Muted>
                        {t.subject ? `${t.subject.name}, ` : ''}
                        {tr('{0} phút', t.estimatedMinutes)}{t.deadline ? tr(', hạn {0}', new Date(t.deadline).toLocaleDateString(LOCALE)) : ''}
                      </Muted>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.text, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}>
                      <Icon name="play" size={15} color={colors.onText} />
                      <Text style={{ color: colors.onText, fontWeight: '700', fontSize: 13 }}>{tr('Học')}</Text>
                    </View>
                  </Pressable>
                ))}
              </Card>
            </Section>

            </FadeIn>

            <FadeIn delay={420}>
            <Section title={tr('Bảy ngày qua')} action={<Muted>{tr('Mục tiêu {0} phút', target)}</Muted>}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 8 }}>
                  {data.weeklyProgress.map((d) => {
                    const today = d.date === data.date;
                    const met = d.focusMinutes >= target;
                    return (
                      <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{d.focusMinutes || ''}</Text>
                        <GrowBar
                          pct={Math.max(2, (d.focusMinutes / max) * 82)}
                          style={{
                            width: '78%',
                            backgroundColor: today ? colors.text : met ? colors.marker : colors.neutralBar,
                            borderWidth: met || today ? 1 : 0,
                            borderColor: colors.text,
                            borderTopLeftRadius: 3,
                            borderTopRightRadius: 3,
                          }}
                        />
                        <Text style={{ fontSize: 11, fontWeight: today ? '800' : '500', color: colors.text }}>{new Date(`${d.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '')}</Text>
                      </View>
                    );
                  })}
                </View>
                <Muted>{tr('Cột vàng là ngày đạt mục tiêu.')}</Muted>
              </Card>
            </Section>
            </FadeIn>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
