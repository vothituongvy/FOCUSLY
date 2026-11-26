import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { api } from '../api/client';
import { kvGet, kvSet } from '../offline/db';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { useSession } from '../store/session';
import { colors } from '../theme';
import type { Dashboard, FocusSession } from '../types';
import type { TabParams } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import { Button, Card, Empty, Muted, Row, Section, SyncBar } from '../components/ui';

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function spoken(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} phút`;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
}

function todayLabel() {
  const s = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
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
      accessibilityLabel="Các khoảng thời gian bạn đã tập trung hôm nay"
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
                backgroundColor: g.type === 'break' ? '#d5dbe5' : colors.marker,
                borderRadius: 2,
              }}
            />
          ))}
      {width > 0 && <View style={{ position: 'absolute', top: 0, bottom: 0, left: x(now), width: 2, backgroundColor: colors.danger }} />}
    </View>
  );
}

function Metric({ label, value, unit, note, noteColor }: { label: string; value: string; unit?: string; note?: string; noteColor?: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 12, paddingRight: 12 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 }}>
        {value}
        {!!unit && <Text style={{ fontSize: 15, color: colors.muted, fontWeight: '600' }}>{unit}</Text>}
      </Text>
      {!!note && <Text style={{ fontSize: 12, color: noteColor ?? colors.muted }}>{note}</Text>}
    </View>
  );
}

export function DashboardScreen() {
  const nav = useNavigation<BottomTabNavigationProp<TabParams>>();
  const user = useAuth((s) => s.user);
  const { sync, sessions } = useData();
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
      ? `Hôm nay chưa có phiên học nào. Mục tiêu là ${spoken(target)}.`
      : left > 0
        ? `Đã tập trung ${spoken(focusMin)}, còn ${spoken(left)} nữa là đạt mục tiêu.`
        : `Đã tập trung ${spoken(focusMin)}, vượt mục tiêu ${spoken(target)}.`;
  const max = Math.max(target, ...(data?.weeklyProgress.map((d) => d.focusMinutes) ?? [1]), 1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <AppHeader title={`Chào ${user?.name.split(' ').slice(-1)[0] ?? 'bạn'}`} subtitle={todayLabel()} />
      <SyncBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 18, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={{ fontSize: 17, lineHeight: 24, color: colors.text2 }}>{headline}</Text>
        {offline && <Muted style={{ color: colors.warning }}>Đang hiển thị dữ liệu đã lưu vì không có mạng.</Muted>}

        <DayRuler sessions={todaySessions} />

        {active ? (
          <Pressable onPress={() => nav.navigate('Focus')} accessibilityRole="button">
            <Card style={{ backgroundColor: colors.markerSoft, borderColor: '#f0d77a', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="focus" size={22} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>
                  {active.status === 'active' ? 'Phiên học đang chạy' : active.status === 'on_break' ? 'Đang nghỉ giữa phiên' : 'Phiên học đang tạm dừng'}
                </Text>
                <Muted>{active.goal}</Muted>
              </View>
              <Icon name="chevronRight" size={18} color={colors.muted} />
            </Card>
          </Pressable>
        ) : (
          <Button title="Bắt đầu tập trung" icon="play" variant="marker" onPress={() => nav.navigate('Focus')} />
        )}

        {data && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong }}>
              <Metric label="Nhiệm vụ xong" value={String(data.tasks.completed)} unit={`/${data.tasks.total}`} note={data.tasks.overdue ? `${data.tasks.overdue} việc quá hạn` : undefined} noteColor={colors.danger} />
              <Metric label="Chuỗi ngày học" value={String(data.streak.current)} unit=" ngày" note={`Dài nhất ${data.streak.best} ngày`} />
              <Metric label="Lần phân tâm" value={String(data.distractionsToday.manual)} note={`Rời app ${data.distractionsToday.appLeaves} lần`} />
              <Metric label="Điểm tập trung" value={String(data.focusScore.score)} unit="/100" note="Chỉ để tham khảo" />
            </View>

            <Section title="Việc tiếp theo">
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {data.upcomingTasks.length === 0 && <Empty text="Chưa có nhiệm vụ. Thêm ở tab Kế hoạch." />}
                {data.upcomingTasks.map((t, i) => (
                  <Row key={t.id} style={{ paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: t.subject?.color ?? colors.borderStrong }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: colors.text }} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Muted>
                        {t.subject ? `${t.subject.name}, ` : ''}
                        {t.estimatedMinutes} phút{t.deadline ? `, hạn ${new Date(t.deadline).toLocaleDateString('vi-VN')}` : ''}
                      </Muted>
                    </View>
                    <Button title="Học" icon="play" small variant="secondary" onPress={() => nav.navigate('Focus', { taskId: t.id })} />
                  </Row>
                ))}
              </Card>
            </Section>

            <Section title="Bảy ngày qua" action={<Muted>Mục tiêu {target} phút</Muted>}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 8 }}>
                  {data.weeklyProgress.map((d) => {
                    const today = d.date === data.date;
                    const met = d.focusMinutes >= target;
                    return (
                      <View key={d.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.muted }}>{d.focusMinutes || ''}</Text>
                        <View
                          style={{
                            width: '78%',
                            height: `${Math.max(2, (d.focusMinutes / max) * 82)}%`,
                            backgroundColor: today ? colors.text : met ? colors.marker : '#d5dbe5',
                            borderWidth: met || today ? 1 : 0,
                            borderColor: colors.text,
                            borderTopLeftRadius: 3,
                            borderTopRightRadius: 3,
                          }}
                        />
                        <Text style={{ fontSize: 11, fontWeight: today ? '800' : '500', color: colors.text }}>{WD[new Date(`${d.date}T12:00:00`).getDay()]}</Text>
                      </View>
                    );
                  })}
                </View>
                <Muted>Cột vàng là ngày đạt mục tiêu.</Muted>
              </Card>
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
