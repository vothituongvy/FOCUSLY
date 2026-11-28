import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { api, errorMessage } from '../api/client';
import { useApi } from '../components/useApi';
import { useData } from '../store/data';
import { colors } from '../theme';
import { Button, Card, Chip, Chips, Empty, Field, H1, H3, Loading, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { MonthCalendar } from '../components/MonthCalendar';
import { tr } from '../i18n';
import { showAlert } from '../components/Dialog';

type Nav = NativeStackNavigationProp<AppStackParams>;
interface Topic {
  _id?: string;
  id?: string;
  title: string;
  minutes: number;
  done: boolean;
}
interface ExamItem {
  id: string;
  title: string;
  date: string;
  daysLeft: number;
  progress: number;
  overloaded: boolean;
  todayLeft: number;
  perDay: number;
}
interface Exam {
  id: string;
  title: string;
  subject: string | null;
  deck: string | null;
  date: string;
  dailyCapMinutes: number;
  topics: Topic[];
  subjectName: string | null;
  plan: {
    daysLeft: number;
    days: { date: string; minutes: number; items: { kind: 'topic' | 'review' | 'cards' | 'mock'; title: string; minutes: number }[] }[];
    perDay: number;
    overloaded: boolean;
    progress: number;
    today: string;
    studiedMinutes: number;
    todayMinutes: number;
    todayLeft: number;
  };
}
const KIND_ICON = { topic: '📘', review: '🔁', cards: '🃏', mock: '📝' } as const;
const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'numeric' });

export function ExamsScreen() {
  const nav = useNavigation<Nav>();
  const list = useApi<{ items: ExamItem[] }>('/exams');
  if (!list.data) return <Loading />;
  const upcoming = list.data.items.filter((e) => e.daysLeft >= 0);
  const past = list.data.items.filter((e) => e.daysLeft < 0);
  return (
    <Screen>
      <Muted>{tr('Nhập ngày thi và các chủ đề – FOCUSLY chia lịch ôn ngược về từng ngày, tự điều chỉnh theo số phút bạn học thật và các thẻ sắp quên.')}</Muted>
      <Button variant="marker" icon="plus" title={tr('Thêm kỳ thi')} onPress={() => nav.navigate('ExamEdit')} />
      {upcoming.length === 0 && <Empty text={tr('Chưa có kỳ thi nào sắp tới. Thêm một kỳ thi để có lịch ôn từng ngày.')} />}
      {upcoming.map((e) => (
        <Pressable key={e.id} onPress={() => nav.navigate('ExamDetail', { examId: e.id })}>
          <Card>
            <Row style={{ flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1, fontWeight: '700', fontSize: 16, color: colors.text }} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={{ color: colors.muted }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{e.daysLeft}</Text> {tr('ngày')}
              </Text>
            </Row>
            <ProgressBar value={e.progress} />
            <Muted>
              {tr('Đã xong {0}%', Math.round(e.progress * 100))} · {e.todayLeft > 0 ? tr('hôm nay còn {0} phút', e.todayLeft) : tr('hôm nay đã đủ')}
            </Muted>
            {e.overloaded && <Text style={{ color: colors.danger, fontSize: 12.5 }}>{tr('Quá tải: cần ~{0} phút/ngày – cân nhắc tăng giới hạn hoặc bớt chủ đề.', e.perDay)}</Text>}
          </Card>
        </Pressable>
      ))}
      {past.length > 0 && <H3>{tr('Đã thi')}</H3>}
      {past.map((e) => (
        <Pressable key={e.id} onPress={() => nav.navigate('ExamDetail', { examId: e.id })}>
          <Muted>
            {e.title} · {e.date}
          </Muted>
        </Pressable>
      ))}
    </Screen>
  );
}

export function ExamDetailScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'ExamDetail'>) {
  const res = useApi<{ item: Exam }>(`/exams/${route.params.examId}`);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const e = res.data?.item;
  if (!e) return res.error ? <Screen><Text style={s.error}>{res.error}</Text></Screen> : <Loading />;
  const p = e.plan;
  const toggle = async (tid: string, done: boolean) => {
    const topics = e.topics.map((t) => ((t._id ?? t.id) === tid ? { ...t, done } : t));
    res.setData({ item: { ...e, topics } });
    await api(`/exams/${e.id}`, { method: 'PUT', body: { topics } }).catch(() => undefined);
    void res.reload();
  };
  const schedule = async () => {
    setMsg('');
    setError('');
    try {
      const r = await api<{ days: number }>(`/exams/${e.id}/schedule`, { method: 'POST', body: {} });
      setMsg(tr('Đã đưa {0} ngày ôn vào Kế hoạch (có nhắc giờ). Chạy lại sẽ cập nhật, không tạo trùng.', r.days));
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Screen>
      <H1>{e.title}</H1>
      <Muted>
        {tr('Thi ngày {0}', new Date(`${e.date}T12:00:00`).toLocaleDateString())}
        {e.subjectName ? ` · ${e.subjectName}` : ''}
      </Muted>
      <Card>
        <Row style={{ flexWrap: "nowrap" }}>
          <View style={{ flex: 1 }}>
            <Muted>{tr('Còn lại')}</Muted>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{p.daysLeft < 0 ? '—' : tr('{0} ngày', p.daysLeft)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Muted>{tr('Hôm nay')}</Muted>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{p.todayLeft > 0 ? tr('còn {0} phút', p.todayLeft) : tr('đủ rồi ✓')}</Text>
          </View>
        </Row>
        <ProgressBar value={p.progress} />
        <Muted>
          {tr('Tiến độ chủ đề')} {Math.round(p.progress * 100)}% · {tr('Đã học môn này')} {tr('{0} phút', p.studiedMinutes)}
        </Muted>
        {p.overloaded && <Text style={{ color: colors.danger }}>{tr('Khối lượng còn lại cần khoảng {0} phút/ngày, vượt giới hạn {1} phút. Hãy tăng giới hạn, bớt chủ đề hoặc ưu tiên phần quan trọng.', p.perDay, e.dailyCapMinutes)}</Text>}
      </Card>
      <Row>
        <Button variant="marker" icon="calendar" title={tr('Đưa 7 ngày tới vào lịch')} onPress={schedule} disabled={p.daysLeft < 0} />
        <Button variant="secondary" icon="edit" title={tr('Sửa')} onPress={() => navigation.navigate('ExamEdit', { examId: e.id })} />
      </Row>
      {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}

      <H3>{tr('Lịch ôn từng ngày')}</H3>
      {p.days.length === 0 && <Muted>{p.daysLeft < 0 ? tr('Kỳ thi đã qua. Chúc bạn đạt kết quả tốt!') : tr('Thêm chủ đề để có lịch ôn.')}</Muted>}
      {p.days.map((d) => (
        <Card key={d.date} style={{ gap: 4, borderLeftWidth: 4, borderLeftColor: d.date === p.today ? colors.marker : colors.border }}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>{d.date === p.today ? tr('Hôm nay') : fmtDay(d.date)}</Text>
            <Muted>{tr('{0} phút', d.minutes)}</Muted>
          </Row>
          {d.items.map((it, i) => (
            <Text key={i} style={{ color: colors.text2 }} onPress={it.kind === 'cards' ? () => navigation.navigate('Review') : undefined}>
              {KIND_ICON[it.kind]} {it.kind === 'cards' ? tr(it.title) : it.title} <Text style={{ color: colors.muted }}>· {tr('{0} phút', it.minutes)}</Text>
            </Text>
          ))}
        </Card>
      ))}

      <H3>{tr('Chủ đề')}</H3>
      <Muted>{tr('Đánh dấu chủ đề đã nắm chắc – lịch ôn sẽ tự chia lại.')}</Muted>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {e.topics.map((t, i) => {
          const tid = (t._id ?? t.id)!;
          return (
            <Pressable key={tid} onPress={() => toggle(tid, !t.done)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: t.done ? colors.success : colors.borderStrong, backgroundColor: t.done ? colors.successSoft : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                {t.done && <Text style={{ color: colors.success, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, color: t.done ? colors.muted : colors.text, textDecorationLine: t.done ? 'line-through' : 'none' }}>{t.title}</Text>
              <Muted>{t.minutes}′</Muted>
            </Pressable>
          );
        })}
      </Card>
      <Button
        variant="danger"
        title={tr('Xoá kỳ thi')}
        onPress={() =>
          showAlert(tr('Xoá kỳ thi này?'), '', [
            { text: tr('Huỷ'), style: 'cancel' },
            { text: tr('Xoá'), style: 'destructive', onPress: () => void api(`/exams/${e.id}`, { method: 'DELETE' }).then(() => navigation.goBack()) },
          ])
        }
      />
    </Screen>
  );
}

export function ExamEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'ExamEdit'>) {
  const examId = route.params?.examId;
  const existing = useApi<{ item: Exam }>(examId ? `/exams/${examId}` : null).data?.item;
  if (examId && !existing) return <Loading />;
  return <ExamForm exam={existing} onSaved={(id) => (examId ? navigation.goBack() : navigation.replace('ExamDetail', { examId: id }))} />;
}

function ExamForm({ exam, onSaved }: { exam?: Exam; onSaved: (id: string) => void }) {
  const { subjects, decks, materials } = useData();
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState(exam?.title ?? '');
  const [date, setDate] = useState(exam?.date ?? ymd(inTwoWeeks));
  const [month, setMonth] = useState(new Date(`${exam?.date ?? ymd(inTwoWeeks)}T12:00:00`));
  const [subject, setSubject] = useState<string | null>(exam?.subject ?? null);
  const [deck, setDeck] = useState<string | null>(exam?.deck ?? null);
  const [cap, setCap] = useState(String(exam?.dailyCapMinutes ?? 90));
  const [topics, setTopics] = useState<Topic[]>(exam?.topics ?? []);
  const [newTopic, setNewTopic] = useState('');
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'ai' | 'save'>('');
  const [error, setError] = useState('');

  const suggest = async () => {
    if (!title.trim()) return setError(tr('Nhập tên kỳ thi trước để AI gợi ý chủ đề.'));
    setBusy('ai');
    setError('');
    try {
      const r = await api<{ topics: { title: string; minutes: number }[] }>('/exams/suggest-topics', { method: 'POST', body: { title, subject: subject ?? undefined, materialId: materialId ?? undefined }, timeoutMs: 90000 });
      setTopics((cur) => [...cur, ...r.topics.filter((t) => !cur.some((c) => c.title === t.title)).map((t) => ({ ...t, done: false }))]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const save = async () => {
    if (!title.trim()) return setError(tr('Nhập tên kỳ thi'));
    setBusy('save');
    setError('');
    const body = { title: title.trim(), date, subject, deck, dailyCapMinutes: Math.min(600, Math.max(15, Number(cap) || 90)), topics };
    try {
      const r = exam ? await api<{ item: { id: string } }>(`/exams/${exam.id}`, { method: 'PUT', body }) : await api<{ item: { id: string } }>('/exams', { method: 'POST', body });
      onSaved(r.item.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy('');
    }
  };
  const total = topics.reduce((a, t) => a + t.minutes, 0);
  return (
    <Screen>
      <Field label={tr('Tên kỳ thi')} value={title} onChangeText={setTitle} placeholder={tr('VD: Thi giữa kỳ Vật lý')} />
      <Card>
        <Text style={s.label}>
          {tr('Ngày thi')}: {new Date(`${date}T12:00:00`).toLocaleDateString()}
        </Text>
        <MonthCalendar month={month} onMonthChange={setMonth} selected={date} onSelect={(k) => k >= ymd(new Date()) && setDate(k)} compact />
      </Card>
      <Text style={s.label}>{tr('Môn học (để tính phút đã học)')}</Text>
      <Chips>
        <Chip label={tr('Không')} active={!subject} onPress={() => setSubject(null)} />
        {subjects.map((x) => (
          <Chip key={x.id} label={`${x.icon} ${x.name}`} active={subject === x.id} onPress={() => setSubject(x.id)} />
        ))}
      </Chips>
      <Text style={s.label}>{tr('Bộ flashcard liên quan')}</Text>
      <Chips>
        <Chip label={tr('Không')} active={!deck} onPress={() => setDeck(null)} />
        {decks.map((d) => (
          <Chip key={d.id} label={d.title} active={deck === d.id} onPress={() => setDeck(d.id)} />
        ))}
      </Chips>
      <Field label={tr('Tối đa mỗi ngày (phút)')} value={cap} onChangeText={setCap} keyboardType="number-pad" />

      <Card>
        <H3>
          {tr('Chủ đề cần ôn')} <Text style={{ color: colors.muted, fontSize: 13 }}>({tr('{0} chủ đề · {1} phút', topics.length, total)})</Text>
        </H3>
        <Text style={s.label}>{tr('Gợi ý từ nội dung tài liệu')}</Text>
        <Chips>
          <Chip label={tr('Theo tên kỳ thi')} active={!materialId} onPress={() => setMaterialId(null)} />
          {materials
            .filter((m) => m.hasText)
            .map((m) => (
              <Chip key={m.id} label={m.title} active={materialId === m.id} onPress={() => setMaterialId(m.id)} />
            ))}
        </Chips>
        <Button variant="secondary" icon="ai" title={busy === 'ai' ? tr('Đang gợi ý…') : tr('AI gợi ý chủ đề')} onPress={suggest} disabled={busy !== ''} />
        {topics.map((t, i) => (
          <Row key={t._id ?? t.id ?? i} style={{ flexWrap: 'nowrap' }}>
            <TextInput value={t.title} onChangeText={(v) => setTopics((cur) => cur.map((x, k) => (k === i ? { ...x, title: v } : x)))} style={[s.input, { flex: 1 }]} />
            <TextInput value={String(t.minutes)} keyboardType="number-pad" onChangeText={(v) => setTopics((cur) => cur.map((x, k) => (k === i ? { ...x, minutes: Math.min(600, Math.max(10, Number(v) || 10)) } : x)))} style={[s.input, { width: 64, textAlign: 'center' }]} />
            <Pressable onPress={() => setTopics((cur) => cur.filter((_, k) => k !== i))} hitSlop={8} accessibilityLabel={tr('Xoá')}>
              <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
            </Pressable>
          </Row>
        ))}
        <Row style={{ flexWrap: 'nowrap' }}>
          <TextInput value={newTopic} onChangeText={setNewTopic} placeholder={tr('Thêm chủ đề')} placeholderTextColor="#9aa2b6" style={[s.input, { flex: 1 }]} />
          <Button
            small
            title={tr('Thêm')}
            disabled={!newTopic.trim()}
            onPress={() => {
              setTopics((cur) => [...cur, { title: newTopic.trim(), minutes: 45, done: false }]);
              setNewTopic('');
            }}
          />
        </Row>
      </Card>
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button title={exam ? tr('Lưu thay đổi') : tr('Lập kế hoạch')} onPress={save} loading={busy === 'save'} />
      <Empty text="" />
    </Screen>
  );
}
