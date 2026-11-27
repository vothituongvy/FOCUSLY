import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { Goal } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, H3, Muted, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
import { MonthCalendar, dayKey, keyToDate } from '../components/MonthCalendar';
import { LOCALE, tr } from '../i18n';

type Nav = NativeStackNavigationProp<AppStackParams>;
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/* ======================= Ôn câu sai ======================= */
interface Mistake {
  key: string;
  quizId: string;
  quizTitle: string;
  prompt: string;
  yourAnswer: unknown;
  correctAnswer: string;
  explanation: string;
  at: string;
}

export function MistakesScreen() {
  const nav = useNavigation<Nav>();
  const sync = useData((st) => st.sync);
  const [items, setItems] = useState<Mistake[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Mistake[] }>('/learn/mistakes?days=60')).items);
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const toCards = async () => {
    setMsg('');
    setError('');
    try {
      const chosen = (items ?? []).filter((x) => selected.has(x.key)).map((x) => ({ prompt: x.prompt, correctAnswer: x.correctAnswer, explanation: x.explanation }));
      const r = await api<{ created: number }>('/learn/mistakes/to-cards', { method: 'POST', body: { items: chosen } });
      setMsg(tr('Đã tạo {0} flashcard trong bộ “Ôn câu sai”.', r.created));
      setSelected(new Set());
      await sync();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const answerText = (v: unknown) => (v == null || v === '' ? tr('(bỏ trống)') : v === true ? tr('Đúng') : v === false ? tr('Sai') : String(v));

  return (
    <Screen>
      <Muted>{tr('Câu bạn trả lời sai ở lần làm gần nhất. Làm lại bài hoặc chuyển thành flashcard để ôn theo lịch lặp lại ngắt quãng.')}</Muted>
      {items === null && <ActivityIndicator color={colors.text} />}
      {items?.length === 0 && !error && <Empty text={tr('Không còn câu sai nào')} />}
      {!!items?.length && (
        <Button title={tr('Chuyển {0} câu thành flashcard', selected.size)} icon="cards" disabled={!selected.size} onPress={toCards} />
      )}
      {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}
      {items?.map((x) => {
        const on = selected.has(x.key);
        return (
          <Pressable key={x.key} onPress={() => setSelected((st) => (st.has(x.key) ? new Set([...st].filter((k) => k !== x.key)) : new Set([...st, x.key])))}>
            <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderColor: on ? colors.text : colors.cardBorder }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.text : colors.borderStrong, backgroundColor: on ? colors.marker : colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                {on && <Icon name="check" size={13} color={colors.text} />}
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{x.prompt}</Text>
                <Text style={{ color: colors.danger, fontSize: 13 }}>{tr('Bạn trả lời: {0}', answerText(x.yourAnswer))}</Text>
                <Text style={{ color: colors.success, fontSize: 13 }}>{tr('Đáp án: {0}', x.correctAnswer)}</Text>
                {!!x.explanation && <Muted style={{ fontSize: 12 }}>{x.explanation}</Muted>}
                <Row style={{ gap: 8 }}>
                  <Muted style={{ fontSize: 12 }}>{x.quizTitle} · {new Date(x.at).toLocaleDateString(LOCALE)}</Muted>
                  <Pressable onPress={() => nav.navigate('QuizTake', { quizId: x.quizId })} hitSlop={6}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textDecorationLine: 'underline' }}>{tr('Làm lại')}</Text>
                  </Pressable>
                </Row>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

/* ======================= Tiến độ ghi nhớ ======================= */
interface Progress {
  days: { date: string; reviews: number; retention: number | null; quizAccuracy: number | null }[];
  perQuiz: { quizId: string; title: string; attempts: number; first: number | null; last: number | null; best: number | null }[];
}

export function LearnProgressScreen() {
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Progress>('/learn/progress')
      .then(setP)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (!p) return <Screen>{error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.text} />}</Screen>;
  const max = Math.max(1, ...p.days.map((d) => d.reviews));
  const quizzes = p.perQuiz.filter((q) => q.attempts);
  return (
    <Screen>
      <Card>
        <H3>{tr('Lượt ôn & tỷ lệ nhớ 30 ngày')}</H3>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 2 }}>
          {p.days.map((d) => (
            <View
              key={d.date}
              style={{
                flex: 1,
                minHeight: 2,
                height: `${(d.reviews / max) * 100}%`,
                borderRadius: 2,
                backgroundColor: d.retention == null ? colors.track : d.retention >= 0.8 ? colors.success : d.retention >= 0.6 ? '#e5a800' : colors.danger,
              }}
            />
          ))}
        </View>
        <Muted style={{ fontSize: 12 }}>{tr('Màu cột: xanh ≥80% nhớ · cam 60–80% · đỏ <60%')}</Muted>
      </Card>
      <Card>
        <H3>{tr('Tiến bộ qua các lần làm bài')}</H3>
        {quizzes.length === 0 && <Muted>{tr('Làm bài ít nhất 1 lần để so sánh.')}</Muted>}
        {quizzes.map((q) => {
          const up = q.first != null && q.last != null && q.last !== q.first ? q.last > q.first : null;
          return (
            <View key={q.quizId} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{q.title}</Text>
              <Row style={{ gap: 14 }}>
                <Muted style={{ fontSize: 12 }}>{tr('{0} lần', q.attempts)}</Muted>
                <Muted style={{ fontSize: 12 }}>{tr('Lần đầu')} {pct(q.first)}</Muted>
                <Muted style={{ fontSize: 12 }}>
                  {tr('Gần nhất')} {pct(q.last)}
                  {up !== null && <Text style={{ color: up ? colors.success : colors.danger, fontWeight: '800' }}>{up ? ' ▲' : ' ▼'}</Text>}
                </Muted>
                <Muted style={{ fontSize: 12 }}>{tr('Tốt nhất')} {pct(q.best)}</Muted>
              </Row>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

/* ======================= Mục tiêu học tập ======================= */
const GOAL_STATUS: Record<Goal['status'], string> = { active: tr('Đang theo đuổi'), achieved: tr('Đã đạt'), abandoned: tr('Tạm bỏ') };

export function GoalsScreen() {
  const { goals, subjects, tasks, create, update, remove } = useData();
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const list = [...goals].sort((a, b) => (a.status === b.status ? (a.targetDate ?? '9').localeCompare(b.targetDate ?? '9') : a.status === 'active' ? -1 : 1));
  return (
    <Screen>
      <Muted>{tr('Mục tiêu lớn (VD: IELTS 6.5) chia thành nhiều nhiệm vụ nhỏ trong Kế hoạch.')}</Muted>
      <Button title={tr('+ Thêm mục tiêu')} onPress={() => setEdit('new')} />
      {list.length === 0 && <Empty text={tr('Chưa có mục tiêu.')} />}
      {list.map((g) => {
        const sb = subjects.find((x) => x.id === g.subject);
        const own = tasks.filter((t) => t.goal === g.id);
        const done = own.filter((t) => t.status === 'done').length;
        return (
          <Pressable key={g.id} onPress={() => setEdit(g)}>
            <Card style={{ gap: 6, opacity: g.status === 'abandoned' ? 0.6 : 1 }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>{g.title}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: g.status === 'achieved' ? colors.successSoft : colors.surface2 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: g.status === 'achieved' ? colors.success : colors.text2 }}>{GOAL_STATUS[g.status]}</Text>
                </View>
              </Row>
              <Muted style={{ fontSize: 12 }}>
                {sb ? `${sb.icon} ${sb.name}` : tr('Chung')}
                {g.targetDate ? tr(' · Hạn {0}', new Date(g.targetDate).toLocaleDateString(LOCALE)) : ''}
                {own.length ? tr(' · {0}/{1} nhiệm vụ xong', done, own.length) : ''}
              </Muted>
            </Card>
          </Pressable>
        );
      })}
      <GoalSheet
        goal={edit === 'new' ? null : edit}
        visible={edit !== null}
        onClose={() => setEdit(null)}
        onSave={async (data) => {
          if (edit && edit !== 'new') await update('goals', edit.id, data);
          else await create('goals', data);
          setEdit(null);
        }}
        onDelete={
          edit && edit !== 'new'
            ? () =>
                Alert.alert(tr('Xoá mục tiêu?'), edit.title, [
                  { text: tr('Huỷ'), style: 'cancel' },
                  {
                    text: tr('Xoá'),
                    style: 'destructive',
                    onPress: async () => {
                      await remove('goals', edit.id);
                      setEdit(null);
                    },
                  },
                ])
            : undefined
        }
      />
    </Screen>
  );
}

function GoalSheet({ goal, visible, onClose, onSave, onDelete }: { goal: Goal | null; visible: boolean; onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>; onDelete?: () => void }) {
  const subjects = useData((st) => st.subjects);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [status, setStatus] = useState<Goal['status']>('active');
  const [month, setMonth] = useState(() => new Date());
  const [showCal, setShowCal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(goal?.title ?? '');
    setDesc(goal?.description ?? '');
    setSubject(goal?.subject ?? null);
    setTarget(goal?.targetDate ? dayKey(new Date(goal.targetDate)) : null);
    setStatus(goal?.status ?? 'active');
    setMonth(goal?.targetDate ? new Date(goal.targetDate) : new Date());
    setShowCal(false);
    setError('');
  }, [visible, goal]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={onClose} />
      <View style={{ maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <H3>{goal ? tr('Sửa mục tiêu') : tr('Mục tiêu mới')}</H3>
          <Field label={tr('Mục tiêu')} value={title} onChangeText={setTitle} placeholder={tr('VD: Đạt IELTS 6.5 trước tháng 6')} />
          <Field label={tr('Mô tả')} value={desc} onChangeText={setDesc} multiline />
          <Muted>{tr('Môn học')}</Muted>
          <Chips>
            <Chip label={tr('Chung')} active={!subject} onPress={() => setSubject(null)} />
            {subjects.map((x) => (
              <Chip key={x.id} label={`${x.icon} ${x.name}`} active={subject === x.id} onPress={() => setSubject(x.id)} />
            ))}
          </Chips>
          <Muted>{tr('Hạn đạt mục tiêu')}</Muted>
          <Chips>
            <Chip label={tr('Không có')} active={!target} onPress={() => { setTarget(null); setShowCal(false); }} />
            <Chip label={`▦ ${target ? keyToDate(target).toLocaleDateString(LOCALE) : tr('Chọn ngày')}`} active={!!target || showCal} onPress={() => setShowCal(!showCal)} />
          </Chips>
          {showCal && <MonthCalendar compact month={month} onMonthChange={setMonth} selected={target} onSelect={(k) => { setTarget(k); setShowCal(false); }} />}
          {goal && (
            <>
              <Muted>{tr('Trạng thái')}</Muted>
              <Chips>
                {(Object.keys(GOAL_STATUS) as Goal['status'][]).map((k) => (
                  <Chip key={k} label={GOAL_STATUS[k]} active={status === k} onPress={() => setStatus(k)} />
                ))}
              </Chips>
            </>
          )}
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button
            title={tr('Lưu')}
            onPress={async () => {
              if (!title.trim()) return setError(tr('Nhập tên mục tiêu'));
              await onSave({ title: title.trim(), description: desc, subject, status, targetDate: target ? new Date(`${target}T23:59:00`).toISOString() : null });
            }}
          />
          {onDelete && <Button title={tr('Xoá mục tiêu')} variant="danger" onPress={onDelete} />}
        </ScrollView>
      </View>
    </Modal>
  );
}
