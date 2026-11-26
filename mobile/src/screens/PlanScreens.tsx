import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../store/data';
import { colors } from '../theme';
import { PRIORITY_LABEL, type Priority, type Recurrence, type Task } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, IconButton, Muted, Row, Screen, SyncBar, s } from '../components/ui';
import { AppHeader } from '../components/AppHeader';
import { LOCALE, tr } from '../i18n';

const PRIORITY_COLOR: Record<Priority, string> = { low: '#3f7a45', medium: '#4a48c4', high: '#b45309', urgent: '#b91c1c' };

/* ====================== Danh sách kế hoạch ====================== */
export function PlanScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { subjects, courses, tasks, update } = useData();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  const list = useMemo(() => {
    return tasks
      .filter((t) => !subjectId || t.subject === subjectId)
      .filter((t) => (filter === 'open' ? ['todo', 'in_progress'].includes(t.status) : filter === 'done' ? t.status === 'done' : true))
      .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  }, [tasks, subjectId, filter]);

  const renderTask = ({ item: t }: { item: Task }) => {
    const subj = subjects.find((x) => x.id === t.subject);
    const course = courses.find((c) => c.id === t.course);
    const overdue = t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date();
    const done = t.status === 'done';
    return (
      <Pressable onPress={() => nav.navigate('TaskEdit', { taskId: t.id })}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
          <Pressable
            hitSlop={10}
            onPress={() => update('tasks', t.id, { status: done ? 'todo' : 'done' })}
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: done ? colors.success : '#c5c9da',
              backgroundColor: done ? colors.success : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {done && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: done ? colors.muted : colors.text, textDecorationLine: done ? 'line-through' : 'none' }} numberOfLines={1}>
              {t.title}{t.recurrence?.freq && t.recurrence.freq !== 'none' ? tr(' (lặp lại)') : ''}
            </Text>
            <Muted>
              {subj ? `${subj.icon} ${subj.name}${course ? ` › ${course.name}` : ''} · ` : ''}
              {t.estimatedMinutes}p
              {t.deadline ? ` · ${new Date(t.deadline).toLocaleDateString(LOCALE)}` : ''}
            </Muted>
            {overdue && <Text style={{ color: colors.danger, fontSize: 12 }}>{tr('Quá hạn')}</Text>}
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: PRIORITY_COLOR[t.priority] }}>{PRIORITY_LABEL[t.priority]}</Text>
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <AppHeader title={tr('Kế hoạch')} subtitle={tr('{0} nhiệm vụ', list.length)} right={<IconButton name="plus" label={tr('Thêm nhiệm vụ')} onPress={() => nav.navigate('TaskEdit', { subjectId })} />} />
      <SyncBar />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <Chips>
          <Chip label={tr('Tất cả')} active={!subjectId} onPress={() => setSubjectId(null)} />
          {subjects.map((sub) => (
            <Pressable key={sub.id} onLongPress={() => nav.navigate('SubjectEdit', { subjectId: sub.id })}>
              <Chip label={`${sub.icon} ${sub.name}`} active={subjectId === sub.id} onPress={() => setSubjectId(sub.id)} />
            </Pressable>
          ))}
          <Chip label={tr('＋ Môn học')} onPress={() => nav.navigate('SubjectEdit')} />
        </Chips>
        <Chips>
          {(
            [
              ['open', tr('Chưa xong')],
              ['done', tr('Hoàn thành')],
              ['all', tr('Tất cả')],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} label={l} active={filter === k} onPress={() => setFilter(k)} />
          ))}
        </Chips>
        <Muted style={{ fontSize: 11 }}>{tr('Nhấn giữ một môn học để sửa.')}</Muted>
      </View>
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}
        ListEmptyComponent={<Empty text={tr('Không có nhiệm vụ nào.')} />}
      />
    </SafeAreaView>
  );
}

/* ====================== Tạo / sửa nhiệm vụ ====================== */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toInput = (iso?: string | null) => (iso ? isoDay(new Date(iso)) : '');
const fromInput = (v: string, endOfDay = false) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return null;
  return new Date(`${v.trim()}T${endOfDay ? '23:59:00' : '00:00:00'}`).toISOString();
};

export function TaskEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'TaskEdit'>) {
  const { tasks, subjects, courses, create, update, remove } = useData();
  const task = tasks.find((t) => t.id === route.params?.taskId);
  const [title, setTitle] = useState(task?.title ?? '');
  const [subject, setSubject] = useState<string | null>(task?.subject ?? route.params?.subjectId ?? null);
  const [course, setCourse] = useState<string | null>(task?.course ?? null);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [minutes, setMinutes] = useState(String(task?.estimatedMinutes ?? 45));
  const [scheduled, setScheduled] = useState(toInput(task?.scheduledDate) || isoDay(new Date()));
  const [deadline, setDeadline] = useState(toInput(task?.deadline));
  const [freq, setFreq] = useState<Recurrence['freq']>(task?.recurrence?.freq ?? 'none');
  const [outcome, setOutcome] = useState(task?.expectedOutcome ?? '');
  const [desc, setDesc] = useState(task?.description ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) return setError(tr('Nhập tên nhiệm vụ'));
    const data = {
      title: title.trim(),
      subject,
      course,
      priority,
      estimatedMinutes: Number(minutes) || 0,
      scheduledDate: fromInput(scheduled),
      deadline: fromInput(deadline, true),
      expectedOutcome: outcome,
      description: desc,
      recurrence: { freq, interval: 1, daysOfWeek: [], until: null },
      ...(task ? {} : { status: 'todo' }),
    };
    if (task) await update('tasks', task.id, data);
    else await create('tasks', data);
    navigation.goBack();
  };

  const tomorrow = new Date(Date.now() + 86_400_000);

  return (
    <Screen>
      <Field label={tr('Nhiệm vụ')} value={title} onChangeText={setTitle} placeholder={tr('VD: Ôn thì hiện tại hoàn thành')} />
      <Text style={s.label}>{tr('Môn học')}</Text>
      <Chips>
        <Chip label={tr('Không')} active={!subject} onPress={() => setSubject(null)} />
        {subjects.map((x) => (
          <Chip
            key={x.id}
            label={`${x.icon} ${x.name}`}
            active={subject === x.id}
            onPress={() => {
              setSubject(x.id);
              setCourse(null);
            }}
          />
        ))}
      </Chips>
      {subject && courses.some((c) => c.subject === subject) && (
        <>
          <Text style={s.label}>{tr('Chủ đề')}</Text>
          <Chips>
            {courses
              .filter((c) => c.subject === subject)
              .map((c) => (
                <Chip key={c.id} label={c.name} active={course === c.id} onPress={() => setCourse(course === c.id ? null : c.id)} />
              ))}
          </Chips>
        </>
      )}
      <Text style={s.label}>{tr('Ưu tiên')}</Text>
      <Chips>
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <Chip key={p} label={PRIORITY_LABEL[p]} active={priority === p} onPress={() => setPriority(p)} />
        ))}
      </Chips>
      <Field label={tr('Thời lượng dự kiến (phút)')} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Field label={tr('Ngày học (YYYY-MM-DD)')} value={scheduled} onChangeText={setScheduled} />
      <Chips>
        <Chip label={tr('Hôm nay')} active={scheduled === isoDay(new Date())} onPress={() => setScheduled(isoDay(new Date()))} />
        <Chip label={tr('Ngày mai')} active={scheduled === isoDay(tomorrow)} onPress={() => setScheduled(isoDay(tomorrow))} />
      </Chips>
      <Field label="Deadline (YYYY-MM-DD)" value={deadline} onChangeText={setDeadline} placeholder={tr('Để trống nếu không có')} />
      <Text style={s.label}>{tr('Lặp lại')}</Text>
      <Chips>
        {(
          [
            ['none', tr('Không')],
            ['daily', tr('Hằng ngày')],
            ['weekly', tr('Hằng tuần')],
            ['monthly', tr('Hằng tháng')],
          ] as const
        ).map(([k, l]) => (
          <Chip key={k} label={l} active={freq === k} onPress={() => setFreq(k)} />
        ))}
      </Chips>
      <Field label={tr('Kết quả mong muốn')} value={outcome} onChangeText={setOutcome} />
      <Field label={tr('Ghi chú')} value={desc} onChangeText={setDesc} multiline />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button title={task ? tr('Lưu thay đổi') : tr('Tạo nhiệm vụ')} onPress={save} />
      {task && (
        <Button
          title={tr('Xoá nhiệm vụ')}
          variant="ghost"
          onPress={() =>
            Alert.alert(tr('Xoá nhiệm vụ?'), task.title, [
              { text: tr('Huỷ'), style: 'cancel' },
              {
                text: tr('Xoá'),
                style: 'destructive',
                onPress: async () => {
                  await remove('tasks', task.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      )}
    </Screen>
  );
}

/* ====================== Môn học ====================== */
const COLORS = ['#16203a', '#2f6fb3', '#0f7c86', '#1f7a4d', '#a8780b', '#b8402f', '#c2557a', '#7b4fa3'];
const ICONS = ['📘', '📱', '💻', '🇬🇧', '🧮', '🧪', '🎨', '🧠'];

export function SubjectEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'SubjectEdit'>) {
  const { subjects, create, update, remove } = useData();
  const subject = subjects.find((x) => x.id === route.params?.subjectId);
  const [name, setName] = useState(subject?.name ?? '');
  const [icon, setIcon] = useState(subject?.icon ?? ICONS[0]);
  const [color, setColor] = useState(subject?.color ?? COLORS[0]);

  const save = async () => {
    if (!name.trim()) return;
    if (subject) await update('subjects', subject.id, { name: name.trim(), icon, color });
    else await create('subjects', { name: name.trim(), icon, color });
    navigation.goBack();
  };

  return (
    <Screen>
      <Field label={tr('Tên môn học')} value={name} onChangeText={setName} placeholder={tr('VD: Tiếng Anh')} />
      <Text style={s.label}>{tr('Biểu tượng')}</Text>
      <Chips>
        {ICONS.map((i) => (
          <Chip key={i} label={i} active={icon === i} onPress={() => setIcon(i)} />
        ))}
      </Chips>
      <Text style={s.label}>{tr('Màu')}</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.text }}
          />
        ))}
      </Row>
      <Button title={tr('Lưu')} onPress={save} />
      {subject && (
        <Button
          title={tr('Xoá môn học')}
          variant="ghost"
          onPress={() =>
            Alert.alert(tr('Xoá môn học?'), tr('Nhiệm vụ thuộc môn sẽ được giữ lại.'), [
              { text: tr('Huỷ'), style: 'cancel' },
              {
                text: tr('Xoá'),
                style: 'destructive',
                onPress: async () => {
                  await remove('subjects', subject.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      )}
    </Screen>
  );
}
