import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { Conversation, Insight } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, H3, KeyboardView, Muted, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
import { ForecastCard } from '../components/FocusForecast';
import { LOCALE, tr } from '../i18n';

const plain = (t: string) => t.replace(/\*\*/g, '').replace(/^#+\s/gm, '').replace(/`/g, '').replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, '$1$2');

/** Hiện câu trả lời, biến [chữ](https://...) thành liên kết bấm được (VD: nguồn Wikipedia) */
function RichText({ text }: { text: string }) {
  const parts = plain(text).split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g);
  return (
    <Text selectable style={{ color: colors.text, lineHeight: 21 }}>
      {parts.map((p, i) => {
        const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(p);
        return m ? (
          <Text key={i} style={{ fontWeight: '700', textDecorationLine: 'underline' }} onPress={() => void Linking.openURL(m[2])}>
            {m[1]}
          </Text>
        ) : (
          p
        );
      })}
    </Text>
  );
}

/* ======================= Trợ lý AI: hỏi đáp ======================= */
export function AIChatScreen({ route }: { route: { params?: { materialId?: string; conversationId?: string } } }) {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const materials = useData((st) => st.materials);
  const [materialId, setMaterialId] = useState<string | null>(route.params?.materialId ?? null);
  const material = materials.find((m) => m.id === materialId);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroll = useRef<{ scrollToEnd: (o?: { animated?: boolean }) => void } | null>(null);

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);

  const open = useCallback(async (id: string) => {
    try {
      const r = await api<{ item: Conversation }>(`/ai/conversations/${id}`);
      setConv(r.item);
      setMaterialId(r.item.material ?? null);
      toEnd();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (route.params?.conversationId) void open(route.params.conversationId);
  }, [route.params?.conversationId, open]);

  useEffect(() => {
    nav.setOptions({
      headerRight: () => (
        <Row style={{ gap: 4, flexWrap: 'nowrap' }}>
          <Pressable hitSlop={8} accessibilityLabel={tr('Cuộc trò chuyện mới')} onPress={() => { setConv(null); setError(''); }} style={{ padding: 6 }}>
            <Icon name="plus" size={22} color={colors.text} />
          </Pressable>
          <Pressable hitSlop={8} accessibilityLabel={tr('Lịch sử trò chuyện')} onPress={() => setHistoryOpen(true)} style={{ padding: 6 }}>
            <Icon name="history" size={22} color={colors.text} />
          </Pressable>
        </Row>
      ),
    });
  }, [nav]);

  const send = async (text = input) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    setInput('');
    setConv((c) => ({
      ...(c ?? { id: '', title: text, material: materialId, subject: null, updatedAt: '' }),
      messages: [...(c?.messages ?? []), { role: 'user', content: text, at: new Date().toISOString() }],
    }));
    toEnd();
    try {
      const r = await api<{ item: Conversation }>('/ai/chat', { method: 'POST', body: { conversationId: conv?.id || undefined, message: text, materialId }, timeoutMs: 90000 });
      setConv(r.item);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      toEnd();
    }
  };

  const suggestions = material
    ? [tr('Tóm tắt ý chính'), tr('Giải thích phần khó nhất'), tr('Hỏi tôi 3 câu kiểm tra')]
    : [tr('Hôm nay mình học được bao lâu?'), tr('Mình nên học lúc mấy giờ?'), tr('Việc cần làm tiếp theo?'), tr('Cho mình mẹo tập trung')];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      {/* Đẩy cả khung chat lên trên bàn phím để ô nhập luôn nhìn thấy */}
      <KeyboardView>
        <ScrollView ref={scroll as never} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {material && (
            <Row>
              <Chip label={`${tr('Đang hỏi về: {0}', material.title)}  ✕`} active onPress={() => setMaterialId(null)} />
            </Row>
          )}
          {!conv?.messages?.length && (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.markerSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="ai" size={32} color={colors.text} />
              </View>
              <Muted style={{ textAlign: 'center' }}>{tr('Hỏi bất cứ điều gì bạn đang học. AI chỉ gợi ý – hãy kiểm chứng lại.')}</Muted>
              <Chips wrap>
                {suggestions.map((t) => (
                  <Chip key={t} label={t} onPress={() => send(t)} />
                ))}
              </Chips>
              <Button title={tr('Đề xuất & lập kế hoạch học')} variant="secondary" small icon="analytics" onPress={() => nav.navigate('AICoach')} />
            </View>
          )}
          {conv?.messages?.map((m, i) => (
            <View
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                backgroundColor: m.role === 'user' ? colors.marker : colors.surface,
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: m.role === 'user' ? colors.marker : colors.border,
              }}
            >
              {m.role === 'assistant' ? <RichText text={m.content} /> : <Text selectable style={{ color: colors.text, lineHeight: 21 }}>{m.content}</Text>}
            </View>
          ))}
          {busy && (
            <Row>
              <ActivityIndicator color={colors.text} />
              <Muted>{tr('AI đang trả lời...')}</Muted>
            </Row>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TextInput
            style={[s.input, { flex: 1, maxHeight: 120, paddingVertical: 10 }]}
            value={input}
            onChangeText={setInput}
            onFocus={toEnd}
            placeholder={tr('Nhập câu hỏi...')}
            placeholderTextColor="#a0a5c0"
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('Gửi')}
            disabled={busy || !input.trim()}
            onPress={() => send()}
            style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.marker, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.45 : 1 }}
          >
            <Icon name="send" size={20} color={colors.text} />
          </Pressable>
        </View>
      </KeyboardView>
      <HistorySheet visible={historyOpen} onClose={() => setHistoryOpen(false)} onPick={(id) => { setHistoryOpen(false); void open(id); }} />
    </SafeAreaView>
  );
}

function HistorySheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Conversation[] }>('/ai/conversations')).items);
    } catch {
      setItems([]);
    }
  }, []);
  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={onClose} />
      <View style={{ maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <H3>{tr('Lịch sử trò chuyện')}</H3>
          <Pressable hitSlop={10} onPress={onClose}>
            <Icon name="x" size={22} color={colors.text} />
          </Pressable>
        </Row>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>
          {items === null && <ActivityIndicator color={colors.text} />}
          {items?.length === 0 && <Empty text={tr('Chưa có cuộc trò chuyện nào.')} />}
          {items?.map((c) => (
            <Row key={c.id} style={{ flexWrap: 'nowrap', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
              <Pressable style={{ flex: 1 }} onPress={() => onPick(c.id)}>
                <Text style={{ fontWeight: '700', color: colors.text }} numberOfLines={2}>{c.title}</Text>
                <Muted style={{ fontSize: 12 }}>{new Date(c.updatedAt).toLocaleString(LOCALE)}</Muted>
              </Pressable>
              <Pressable
                hitSlop={8}
                accessibilityLabel={tr('Xoá')}
                onPress={async () => {
                  await api(`/ai/conversations/${c.id}`, { method: 'DELETE' }).catch(() => undefined);
                  void load();
                }}
              >
                <Icon name="trash" size={19} color={colors.muted} />
              </Pressable>
            </Row>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ======================= Trợ lý AI: đề xuất & kế hoạch 7 ngày ======================= */
interface PlanItem {
  date: string;
  title: string;
  subject?: string | null;
  subjectId: string | null;
  estimatedMinutes: number;
  taskId?: string | null;
  timeOfDay?: string;
}
interface Reco {
  summary: string;
  recommendations: { title: string; reason: string }[];
  plan: PlanItem[];
}

export function AICoachScreen() {
  const sync = useData((st) => st.sync);
  const [reco, setReco] = useState<Reco | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<{ insights: Insight[] }>('/analytics/insights')
      .then((r) => setInsights(r.insights))
      .catch(() => setInsights([]));
  }, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const accept = () =>
    run('accept', async () => {
      const items = reco!.plan.filter((_, i) => selected.has(i)).filter((p) => !p.taskId);
      for (const p of items) {
        await api('/tasks', {
          method: 'POST',
          body: {
            title: p.title,
            subject: p.subjectId,
            estimatedMinutes: p.estimatedMinutes,
            scheduledDate: new Date(`${p.date}T${p.timeOfDay ?? '00:00'}:00`).toISOString(),
            priority: 'medium',
          },
        });
      }
      await sync();
      setMsg(tr('Đã thêm {0} nhiệm vụ vào Kế hoạch học.', items.length));
      setSelected(new Set());
    });

  return (
    <Screen>
      <ForecastCard />
      <Card>
        <H3>{tr('AI phân tích việc học của bạn')}</H3>
        <Muted>{tr('AI sẽ đọc số liệu học tập (thời gian, nhiệm vụ, phân tâm, kết quả kiểm tra) để đề xuất cách cải thiện.')}</Muted>
        <Button
          title={busy === 'reco' ? tr('AI đang phân tích dữ liệu...') : tr('Đề xuất & lập kế hoạch 7 ngày')}
          loading={busy === 'reco'}
          disabled={!!busy}
          onPress={() => run('reco', async () => setReco(await api<Reco>('/ai/recommendations', { method: 'POST', body: {}, timeoutMs: 90000 })))}
        />
        <Button
          title={busy === 'perf' ? tr('Đang phân tích...') : tr('Phân tích kết quả tuần')}
          variant="secondary"
          disabled={!!busy}
          onPress={() => run('perf', async () => setAnalysis((await api<{ analysis: string }>('/ai/performance', { method: 'POST', body: { range: 'week' }, timeoutMs: 90000 })).analysis))}
        />
        {!!error && <Text style={s.error}>{error}</Text>}
      </Card>

      {!!analysis && (
        <Card>
          <H3>{tr('Phân tích tuần')}</H3>
          <Text selectable style={{ color: colors.text, lineHeight: 21 }}>{plain(analysis)}</Text>
        </Card>
      )}

      {reco && (
        <>
          {!!reco.summary && (
            <Card>
              <Text style={{ color: colors.text, lineHeight: 21 }}>{plain(reco.summary)}</Text>
            </Card>
          )}
          {reco.recommendations.map((r) => (
            <Card key={r.title} style={{ borderLeftWidth: 4, borderLeftColor: colors.marker }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{r.title}</Text>
              <Muted>{r.reason}</Muted>
            </Card>
          ))}
          <Card>
            <H3>{tr('Kế hoạch đề xuất')}</H3>
            <Muted>{tr('Chọn các mục muốn thêm vào Kế hoạch.')}</Muted>
            {reco.plan.map((p, i) => {
              const on = selected.has(i);
              const disabled = Boolean(p.taskId);
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => setSelected((st) => (st.has(i) ? new Set([...st].filter((x) => x !== i)) : new Set([...st, i])))}
                  style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: disabled ? 0.55 : 1 }}
                >
                  <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? colors.text : colors.borderStrong, backgroundColor: on ? colors.marker : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Icon name="check" size={14} color={colors.text} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{p.title}</Text>
                    <Muted style={{ fontSize: 12 }}>
                      {new Date(`${p.date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      {p.timeOfDay ? ` ${p.timeOfDay}` : ''} · {p.estimatedMinutes}p{p.subject ? ` · ${p.subject}` : ''}
                      {disabled ? ` · ${tr('nhiệm vụ có sẵn')}` : ''}
                    </Muted>
                  </View>
                </Pressable>
              );
            })}
            {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
            <Button title={tr('Thêm {0} mục vào kế hoạch', selected.size)} disabled={!selected.size || !!busy} loading={busy === 'accept'} onPress={accept} />
          </Card>
        </>
      )}

      <Card>
        <H3>Focus Intelligence</H3>
        <Muted>{tr('Phân tích tự động 30 ngày (không dùng AI)')}</Muted>
        {insights === null && <ActivityIndicator color={colors.text} />}
        {insights?.length === 0 && <Muted>{tr('Cần thêm dữ liệu học tập.')}</Muted>}
        {insights?.map((i) => (
          <View key={i.id} style={{ borderLeftWidth: 4, borderLeftColor: i.kind === 'warning' ? colors.warning : i.kind === 'praise' ? colors.success : colors.marker, paddingLeft: 10, gap: 2 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{i.title}</Text>
            <Muted>{i.detail}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
