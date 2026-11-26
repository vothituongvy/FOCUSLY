import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
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
      <H1>Tài liệu</H1>
      <Muted>Xem nhanh trên điện thoại. Tải lên & ghi chú đầy đủ trên Web.</Muted>
      <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Tìm tài liệu..." placeholderTextColor="#a0a5c0" />
      <Chips>
        <Chip label="★ Đã đánh dấu" active={onlyBookmarked} onPress={() => setOnlyBookmarked(!onlyBookmarked)} />
      </Chips>
      {list.length === 0 && <Empty text="Chưa có tài liệu." />}
      {list.map((m) => (
        <Card key={m.id}>
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
                title="Mở"
                small
                onPress={() => {
                  void update('materials', m.id, { lastOpenedAt: new Date().toISOString() });
                  void Linking.openURL(m.url);
                }}
              />
            )}
            {!!m.aiSummary && <Muted style={{ flex: 1 }}>Có tóm tắt AI</Muted>}
            {m.hasText && <Button title="Hỏi AI" small variant="secondary" onPress={() => nav.navigate('AIChat', { materialId: m.id })} />}
          </Row>
          {!!m.aiSummary && (
            <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={6}>
              {m.aiSummary.replace(/[#*`]/g, '')}
            </Text>
          )}
        </Card>
      ))}
    </Screen>
  );
}

/* ======================= Trợ lý AI ======================= */
export function AIChatScreen({ route }: { route: { params?: { materialId?: string } } }) {
  const materials = useData((st) => st.materials);
  const materialId = route.params?.materialId ?? null;
  const material = materials.find((m) => m.id === materialId);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // RN 0.88: ScrollView là function component – chỉ cần phương thức scrollToEnd
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);

  const send = async (text = input) => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    setInput('');
    setConv((c) => ({
      ...(c ?? { id: '', title: text, material: materialId, subject: null, updatedAt: '' }),
      messages: [...(c?.messages ?? []), { role: 'user', content: text, at: new Date().toISOString() }],
    }));
    try {
      const r = await api<{ item: Conversation }>('/ai/chat', { method: 'POST', body: { conversationId: conv?.id || undefined, message: text, materialId }, timeoutMs: 90000 });
      setConv(r.item);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <ScrollView ref={scroll as never} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {material && <Muted>Đang hỏi về: {material.title}</Muted>}
        {!conv?.messages?.length && (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 30 }}>
            <Text style={{ fontSize: 40 }}></Text>
            <Muted>Hỏi bất cứ điều gì bạn đang học. AI chỉ gợi ý – hãy kiểm chứng lại.</Muted>
            <Chips>
              {(material ? ['Tóm tắt ý chính', 'Giải thích phần khó nhất', 'Hỏi tôi 3 câu kiểm tra'] : ['useEffect chạy khi nào?', 'Giải thích Promise bằng ví dụ']).map((t) => (
                <Chip key={t} label={t} onPress={() => send(t)} />
              ))}
            </Chips>
          </View>
        )}
        {conv?.messages?.map((m, i) => (
          <View
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              backgroundColor: m.role === 'user' ? colors.primary : colors.surface,
              borderRadius: 14,
              padding: 12,
              borderWidth: m.role === 'user' ? 0 : 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: m.role === 'user' ? '#fff' : colors.text }}>{m.role === 'assistant' ? m.content.replace(/\*\*/g, '').replace(/^#+\s/gm, '') : m.content}</Text>
          </View>
        ))}
        {busy && <ActivityIndicator color={colors.primary} />}
        {!!error && <Text style={s.error}>{error}</Text>}
      </ScrollView>
      <Row style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
        <TextInput style={[s.input, { flex: 1 }]} value={input} onChangeText={setInput} placeholder="Nhập câu hỏi..." placeholderTextColor="#a0a5c0" multiline />
        <Button title="Gửi" small disabled={busy || !input.trim()} onPress={() => send()} />
      </Row>
    </SafeAreaView>
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
  const openLink = (link?: string) => {
    if (!link) return;
    if (link.startsWith('/focus')) nav.navigate('Tabs');
    else if (link.startsWith('/learn')) nav.navigate('Tabs');
  };
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
        title="Đánh dấu tất cả đã đọc"
        variant="secondary"
        small
        onPress={async () => {
          await api('/notifications/read-all', { method: 'POST', body: {} }).catch(() => undefined);
          void load();
        }}
      />
      {items === null && <ActivityIndicator color={colors.primary} />}
      {items?.length === 0 && <Empty text="Chưa có thông báo." />}
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
            <Muted style={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleString('vi-VN')}</Muted>
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
      <Chips>
        <Chip label="Hôm nay" active={range === 'day'} onPress={() => setRange('day')} />
        <Chip label="7 ngày" active={range === 'week'} onPress={() => setRange('week')} />
        <Chip label="30 ngày" active={range === 'month'} onPress={() => setRange('month')} />
      </Chips>
      {offline && <Muted style={{ color: colors.warning }}>Dữ liệu đã lưu (offline)</Muted>}
      {!m ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              ['Tập trung thực tế', `${m.actualFocusMinutes}p`, `dự kiến ${m.plannedMinutes}p`],
              ['Hoàn thành', pct(m.completionRate), `${m.tasksDone}/${m.tasksTotal} nhiệm vụ`],
              ['Phân tâm', String(m.distractionCount), `${m.distractionsPerHour ?? '—'}/giờ`],
              ['Quiz', pct(m.quizAccuracy), `${m.quizAttempts} bài`],
            ].map(([l, v, sub]) => (
              <Card key={l} style={{ width: '48%', flexGrow: 1, gap: 2 }}>
                <Muted>{l}</Muted>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{v}</Text>
                <Muted style={{ fontSize: 11 }}>{sub}</Muted>
              </Card>
            ))}
          </View>
          {a!.series.length > 1 && (
            <Card>
              <H3>Dự kiến vs thực tế</H3>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 3 }}>
                {a!.series.map((x) => (
                  <View key={x.date} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: '100%', gap: 1 }}>
                    <View style={{ flex: 1, height: `${(x.plannedMinutes / max) * 100}%`, backgroundColor: '#d5dbe5', borderRadius: 3 }} />
                    <View style={{ flex: 1, height: `${(x.focusMinutes / max) * 100}%`, backgroundColor: colors.marker, borderRadius: 3, borderWidth: 1, borderColor: colors.text }} />
                  </View>
                ))}
              </View>
            </Card>
          )}
          {a!.bestFocusTimes.length > 0 && (
            <Card>
              <H3>Khung giờ hiệu quả</H3>
              {a!.bestFocusTimes.map((b) => (
                <Text key={b.hour} style={{ color: colors.text }}>
                  {String(b.hour).padStart(2, '0')}:00 – {b.focusMinutes} phút · {b.distractionsPerHour ?? 0} phân tâm/giờ
                </Text>
              ))}
            </Card>
          )}
          <Card>
            <H3>Theo môn học</H3>
            {a!.bySubject.length === 0 && <Muted>Chưa có dữ liệu.</Muted>}
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
      <H3>Gợi ý cải thiện</H3>
      {insights.map((i) => (
        <Card key={i.id} style={{ borderLeftWidth: 4, borderLeftColor: i.kind === 'warning' ? colors.warning : i.kind === 'praise' ? colors.success : colors.primary }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>{i.title}</Text>
          <Muted>{i.detail}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
