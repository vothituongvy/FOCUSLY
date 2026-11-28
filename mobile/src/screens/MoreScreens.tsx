import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { kvGet, kvSet } from '../offline/db';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { Analytics, AppNotification, Conversation, Insight } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, H1, H3, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { LOCALE, tr } from '../i18n';
import { openLink as goLink } from '../navigation/links';

/* ======================= Tài liệu (bản Mobile cơ bản) ======================= */
const TYPE_ICON: Record<string, IconName> = { pdf: 'materials', image: 'materials', text: 'journal', link: 'link', document: 'materials' };

export function MaterialsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { materials, update, subjects } = useData();
  const [q, setQ] = useState('');
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const list = materials.filter((m) => (!onlyBookmarked || m.bookmarked) && (!q || m.title.toLowerCase().includes(q.toLowerCase())));
  return (
    <Screen>
      <Card>
      <H1>{tr('Tài liệu')}</H1>
      <Muted>{tr('Bấm vào tài liệu để xem, ghi chú và dùng AI.')}</Muted>
      <Row>
        <Button title={tr('+ Link')} small variant="secondary" icon="link" onPress={() => nav.navigate('MaterialAdd', { kind: 'link' })} />
        <Button title={tr('+ Ghi chú văn bản')} small variant="secondary" icon="journal" onPress={() => nav.navigate('MaterialAdd', { kind: 'text' })} />
        <Button title={tr('+ File')} small variant="secondary" icon="upload" onPress={() => nav.navigate('MaterialAdd', { kind: 'file' })} />
      </Row>
      <TextInput style={s.input} value={q} onChangeText={setQ} placeholder={tr('Tìm tài liệu...')} placeholderTextColor="#a0a5c0" />
      <Chips>
        <Chip label={tr('★ Đã đánh dấu')} active={onlyBookmarked} onPress={() => setOnlyBookmarked(!onlyBookmarked)} />
      </Chips>
      </Card>
      {list.length === 0 && <Empty text={tr('Chưa có tài liệu.')} />}
      {list.map((m) => (
        <Pressable key={m.id} onPress={() => nav.navigate('MaterialDetail', { materialId: m.id })}>
        <Card>
          <Row>
            <Icon name={TYPE_ICON[m.type]} size={22} color={colors.text2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={2}>
                {m.title}
              </Text>
              <Muted>
                {m.category}
                {m.subject ? ` · ${subjects.find((x) => x.id === m.subject)?.name ?? ''}` : ''}
              </Muted>
            </View>
            <Pressable hitSlop={10} onPress={() => update('materials', m.id, { bookmarked: !m.bookmarked })}>
              <Text style={{ fontSize: 22, color: m.bookmarked ? '#f59e0b' : colors.muted }}>{m.bookmarked ? '★' : '☆'}</Text>
            </Pressable>
          </Row>
          {m.progress.percent > 0 && <ProgressBar value={m.progress.percent / 100} />}
          <Row>
            {!!m.url && (
              <Button
                title={tr('Mở')}
                small
                onPress={() => {
                  void update('materials', m.id, { lastOpenedAt: new Date().toISOString() });
                  void Linking.openURL(m.url);
                }}
              />
            )}
            {!!m.aiSummary && <Muted style={{ flex: 1 }}>{tr('Có tóm tắt AI')}</Muted>}
            {m.hasText && <Button title={tr('Hỏi AI')} small variant="secondary" onPress={() => nav.navigate('AIChat', { materialId: m.id })} />}
          </Row>
          {!!m.aiSummary && (
            <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={6}>
              {m.aiSummary.replace(/[#*`]/g, '')}
            </Text>
          )}
        </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

/* ======================= Thông báo ======================= */
export function NotificationsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ items: AppNotification[] }>('/notifications?limit=100');
      setItems(r.items);
      await kvSet('notifications', r.items);
    } catch {
      setItems((await kvGet<AppNotification[]>('notifications')) ?? []);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  const openLink = (link?: string) => goLink(nav as never, link);
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Button
        title={tr('Đánh dấu tất cả đã đọc')}
        variant="secondary"
        small
        onPress={async () => {
          await api('/notifications/read-all', { method: 'POST', body: {} }).catch(() => undefined);
          void load();
        }}
      />
      {items === null && <ActivityIndicator color={colors.primary} />}
      {items?.length === 0 && <Empty text={tr('Chưa có thông báo.')} />}
      {items?.map((n) => (
        <Pressable
          key={n.id}
          onPress={async () => {
            if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => undefined);
            openLink(n.data?.link);
            void load();
          }}
        >
          <Card style={{ backgroundColor: n.readAt ? colors.surface : colors.primary50 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{n.title}</Text>
            <Muted>{n.body}</Muted>
            <Muted style={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleString(LOCALE)}</Muted>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* ======================= Phân tích (Tổng quan) ======================= */
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export function AnalyticsScreen() {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week');
  const [a, setA] = useState<Analytics | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [r, i] = await Promise.all([api<Analytics>(`/analytics/overview?range=${range}`), api<{ insights: Insight[] }>('/analytics/insights')]);
        setA(r);
        setInsights(i.insights);
        setOffline(false);
        await kvSet(`analytics:${range}`, { r, i: i.insights });
      } catch {
        const c = await kvGet<{ r: Analytics; i: Insight[] }>(`analytics:${range}`);
        setOffline(true);
        if (c) {
          setA(c.r);
          setInsights(c.i);
        }
      }
    })();
  }, [range]);

  const m = a?.metrics;
  const max = Math.max(1, ...(a?.series.map((x) => Math.max(x.focusMinutes, x.plannedMinutes)) ?? [1]));
  return (
    <Screen>
      <Card>
      <Chips>
        <Chip label={tr('Hôm nay')} active={range === 'day'} onPress={() => setRange('day')} />
        <Chip label={tr('7 ngày')} active={range === 'week'} onPress={() => setRange('week')} />
        <Chip label={tr('30 ngày')} active={range === 'month'} onPress={() => setRange('month')} />
      </Chips>
      </Card>
      {offline && <Muted style={{ color: colors.warning }}>{tr('Dữ liệu đã lưu (offline)')}</Muted>}
      {!m ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              [tr('Tập trung thực tế'), `${m.actualFocusMinutes}p`, tr('dự kiến {0}p', m.plannedMinutes)],
              [tr('Hoàn thành'), pct(m.completionRate), tr('{0}/{1} nhiệm vụ', m.tasksDone, m.tasksTotal)],
              [tr('Phân tâm'), String(m.distractionCount), tr('{0}/giờ', m.distractionsPerHour ?? '—')],
              ['Quiz', pct(m.quizAccuracy), tr('{0} bài', m.quizAttempts)],
            ].map(([l, v, sub]) => (
              <Card key={l} style={{ width: '48%', flexGrow: 1, gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                <Muted style={{ textAlign: 'center' }}>{l}</Muted>
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{v}</Text>
                <Muted style={{ fontSize: 11, textAlign: 'center' }}>{sub}</Muted>
              </Card>
            ))}
          </View>
          {a!.series.length > 1 && (
            <Card>
              <H3>{tr('Dự kiến vs thực tế')}</H3>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
                {a!.series.map((x) => (
                  <View key={x.date} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 1 }}>
                    <View style={{ flex: 1, height: `${(x.plannedMinutes / max) * 100}%`, backgroundColor: colors.neutralBar, borderRadius: 3 }} />
                    <View style={{ flex: 1, height: `${(x.focusMinutes / max) * 100}%`, backgroundColor: colors.marker, borderRadius: 3, borderWidth: 1, borderColor: colors.text }} />
                  </View>
                ))}
              </View>
            </Card>
          )}
          {a!.bestFocusTimes.length > 0 && (
            <Card>
              <H3>{tr('Khung giờ hiệu quả')}</H3>
              {a!.bestFocusTimes.map((b) => (
                <Text key={b.hour} style={{ color: colors.text }}>
                  {tr('{0}:00 – {1} phút · {2} phân tâm/giờ', String(b.hour).padStart(2, '0'), b.focusMinutes, b.distractionsPerHour ?? 0)}
                </Text>
              ))}
            </Card>
          )}
          <Card>
            <H3>{tr('Theo môn học')}</H3>
            {a!.bySubject.length === 0 && <Muted>{tr('Chưa có dữ liệu.')}</Muted>}
            {a!.bySubject.map((x) => (
              <Row key={x.subjectId} style={{ justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>
                  {x.icon} {x.name}
                </Text>
                <Muted>
                  {x.focusMinutes}p · quiz {pct(x.quizAccuracy)}
                </Muted>
              </Row>
            ))}
          </Card>
        </>
      )}
      <H3>{tr('Gợi ý cải thiện')}</H3>
      {insights.map((i) => (
        <Card key={i.id} style={{ borderLeftWidth: 4, borderLeftColor: i.kind === 'warning' ? colors.warning : i.kind === 'praise' ? colors.success : colors.primary }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>{i.title}</Text>
          <Muted>{i.detail}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
