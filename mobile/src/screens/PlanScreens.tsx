import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../store/data';
import { colors } from '../theme';
import { PRIORITY_LABEL, type Priority, type Recurrence, type Task } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, IconButton, Muted, Row, Screen, SyncBar, s } from '../components/ui';
import { AppHeader } from '../components/AppHeader';
import { MonthCalendar, dayKey, keyToDate, type DayMark } from '../components/MonthCalendar';
import { Icon } from '../components/Icon';
import { LOCALE, tr } from '../i18n';
import { showAlert } from '../components/Dialog';

const PRIORITY_COLOR: Record<Priority, string> = { low: '#3f7a45', medium: '#4a48c4', high: '#b45309', urgent: '#b91c1c' };

/* ====================== Danh sách kế hoạch ====================== */
export function PlanScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { subjects, courses, tasks, update } = useData();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState(() => dayKey(new Date()));

  // Đánh dấu từng ngày trên lịch: có nhiệm vụ / đã xong / hạn chót / hẹn nhắc
  const marks = useMemo(() => {
    const m = new Map<string, DayMark>();
    const get = (k: string) => m.get(k) ?? m.set(k, { tasks: 0, done: 0, deadline: false, reminder: false }).get(k)!;
    for (const t of tasks) {
      if (subjectId && t.subject !== subjectId) continue;
      if (t.scheduledDate) {
        const x = get(dayKey(new Date(t.scheduledDate)));
        x.tasks++;
        if (t.status === 'done') x.done++;
      }
      if (t.deadline && t.status !== 'done') get(dayKey(new Date(t.deadline))).deadline = true;
      if (t.remindAt && t.status !== 'done') get(dayKey(new Date(t.remindAt))).reminder = true;
    }
    return m;
  }, [tasks, subjectId]);

  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => !subjectId || t.subject === subjectId)
        .filter((t) => [t.scheduledDate, t.deadline, t.remindAt].some((v) => v && dayKey(new Date(v)) === day))
        .sort((a, b) => (a.remindAt ?? a.scheduledDate ?? '').localeCompare(b.remindAt ?? b.scheduledDate ?? '')),
    [tasks, subjectId, day],
  );

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
            {t.remindAt && t.status !== 'done' && (
              <Row style={{ gap: 4 }}>
                <Icon name="bell" size={12} color={colors.warning} />
                <Text style={{ fontSize: 12, color: colors.warning, fontWeight: '600' }}>
                  {new Date(t.remindAt).toLocaleString(LOCALE, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </Text>
              </Row>
            )}
            {overdue && <Text style={{ color: colors.danger, fontSize: 12 }}>{tr('Quá hạn')}</Text>}
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: PRIORITY_COLOR[t.priority] }}>{PRIORITY_LABEL[t.priority]}</Text>
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={[]}>
      <AppHeader title={tr('Kế hoạch')} subtitle={tr('{0} nhiệm vụ', list.length)} right={<IconButton name="plus" label={tr('Thêm nhiệm vụ')} onPress={() => nav.navigate('TaskEdit', { subjectId })} />} />
      <SyncBar />
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12 }}>
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
          <Chip label={tr('☰ Danh sách')} active={view === 'list'} onPress={() => setView('list')} />
          <Chip label={tr('▦ Lịch')} active={view === 'calendar'} onPress={() => setView('calendar')} />
          <Chip label={tr('◎ Mục tiêu')} onPress={() => nav.navigate('Goals')} />
          <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
          {view === 'list' && (
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
      {view === 'calendar' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}>
          <Card style={{ padding: 10 }}>
            <MonthCalendar month={month} onMonthChange={setMonth} selected={day} onSelect={setDay} marks={marks} />
            <Row style={{ justifyContent: 'center', gap: 14, paddingTop: 4 }}>
              {[
                [colors.text, tr('Ngày học')],
                ['#e5a800', tr('Có nhắc')],
                [colors.danger, tr('Hạn chót')],
              ].map(([c, l]) => (
                <Row key={l} style={{ gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
                  <Muted style={{ fontSize: 12 }}>{l}</Muted>
                </Row>
              ))}
            </Row>
          </Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }}>
              {keyToDate(day).toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit' })}
            </Text>
            <Button title={tr('+ Thêm vào ngày này')} small variant="secondary" onPress={() => nav.navigate('TaskEdit', { subjectId, scheduledDate: day })} />
          </Row>
          {dayTasks.length === 0 && <Empty text={tr('Chưa có nhiệm vụ trong ngày này.')} />}
          {dayTasks.map((t) => (
            <React.Fragment key={t.id}>{renderTask({ item: t })}</React.Fragment>
          ))}
        </ScrollView>
      ) : (
      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}
        ListEmptyComponent={<Empty text={tr('Không có nhiệm vụ nào.')} />}
      />
      )}
    </SafeAreaView>
  );
}

/* ====================== Tạo / sửa nhiệm vụ ====================== */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toInput = (iso?: string | null) => (iso ? isoDay(new Date(iso)) : '');
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const [scheduled, setScheduled] = useState(toInput(task?.scheduledDate) || route.params?.scheduledDate || isoDay(new Date()));
  const [deadline, setDeadline] = useState(toInput(task?.deadline));
  // Hẹn giờ nhắc học: ngày học + giờ nhắc -> máy chủ gửi thông báo đẩy đúng giờ
  const [remindOn, setRemindOn] = useState(Boolean(task?.remindAt));
  const [remindTime, setRemindTime] = useState(task?.remindAt ? hhmm(new Date(task.remindAt)) : '19:00');
  const [picker, setPicker] = useState<'scheduled' | 'deadline' | null>(null);
  const [pickMonth, setPickMonth] = useState(() => new Date());
  const [freq, setFreq] = useState<Recurrence['freq']>(task?.recurrence?.freq ?? 'none');
  const [outcome, setOutcome] = useState(task?.expectedOutcome ?? '');
  const [desc, setDesc] = useState(task?.description ?? '');
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) return setError(tr('Nhập tên nhiệm vụ'));
    if (remindOn && !/^([01]\d|2[0-3]):[0-5]\d$/.test(remindTime)) return setError(tr('Giờ nhắc cần có dạng HH:MM, ví dụ 19:30.'));
    const remindAt = remindOn ? new Date(`${scheduled || isoDay(new Date())}T${remindTime}:00`).toISOString() : null;
    if (remindAt && new Date(remindAt).getTime() < Date.now() - 60_000 && !(task?.remindAt === remindAt)) {
      return setError(tr('Giờ nhắc đã qua. Chọn ngày hoặc giờ khác.'));
    }
    const data = {
      title: title.trim(),
      subject,
      course,
      priority,
      estimatedMinutes: Number(minutes) || 0,
      scheduledDate: fromInput(scheduled),
      deadline: fromInput(deadline, true),
      remindAt,
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
      <Card>
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
      <Text style={s.label}>{tr('Ngày học')}</Text>
      <Chips>
        <Chip label={tr('Hôm nay')} active={scheduled === isoDay(new Date())} onPress={() => setScheduled(isoDay(new Date()))} />
        <Chip label={tr('Ngày mai')} active={scheduled === isoDay(tomorrow)} onPress={() => setScheduled(isoDay(tomorrow))} />
        <Chip
          label={`▦ ${scheduled && scheduled !== isoDay(new Date()) && scheduled !== isoDay(tomorrow) ? keyToDate(scheduled).toLocaleDateString(LOCALE) : tr('Chọn ngày')}`}
          active={picker === 'scheduled' || (!!scheduled && scheduled !== isoDay(new Date()) && scheduled !== isoDay(tomorrow))}
          onPress={() => {
            setPickMonth(scheduled ? keyToDate(scheduled) : new Date());
            setPicker(picker === 'scheduled' ? null : 'scheduled');
          }}
        />
      </Chips>
      {picker === 'scheduled' && (
        <MonthCalendar compact month={pickMonth} onMonthChange={setPickMonth} selected={scheduled} onSelect={(k) => { setScheduled(k); setPicker(null); }} />
      )}

      <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: remindOn ? colors.markerSoft : colors.surface2, borderWidth: 1, borderColor: remindOn ? colors.borderStrong : colors.border }}>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Icon name="bell" size={20} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{tr('Nhắc tôi học')}</Text>
            <Muted style={{ fontSize: 12 }}>{tr('Gửi thông báo tới điện thoại đúng giờ vào ngày học.')}</Muted>
          </View>
          <Switch value={remindOn} onValueChange={setRemindOn} trackColor={{ true: colors.marker, false: colors.track }} thumbColor={remindOn ? colors.text : '#ffffff'} />
        </Row>
        {remindOn && (
          <>
            <Chips>
              {['06:30', '12:00', '19:00', '20:30', '21:30'].map((t) => (
                <Chip key={t} label={t} active={remindTime === t} onPress={() => setRemindTime(t)} />
              ))}
            </Chips>
            <Field label={tr('Giờ khác (HH:MM)')} value={remindTime} onChangeText={setRemindTime} maxLength={5} keyboardType="numbers-and-punctuation" />
            <Muted style={{ fontSize: 12 }}>
              {tr('Sẽ nhắc lúc {0}, {1}.', remindTime, (scheduled ? keyToDate(scheduled) : new Date()).toLocaleDateString(LOCALE, { weekday: 'long', day: '2-digit', month: '2-digit' }))}
            </Muted>
          </>
        )}
      </View>

      <Text style={s.label}>Deadline</Text>
      <Chips>
        <Chip label={tr('Không có')} active={!deadline} onPress={() => { setDeadline(''); setPicker(null); }} />
        <Chip
          label={`▦ ${deadline ? keyToDate(deadline).toLocaleDateString(LOCALE) : tr('Chọn ngày')}`}
          active={!!deadline || picker === 'deadline'}
          onPress={() => {
            setPickMonth(deadline ? keyToDate(deadline) : scheduled ? keyToDate(scheduled) : new Date());
            setPicker(picker === 'deadline' ? null : 'deadline');
          }}
        />
      </Chips>
      {picker === 'deadline' && (
        <MonthCalendar compact month={pickMonth} onMonthChange={setPickMonth} selected={deadline} onSelect={(k) => { setDeadline(k); setPicker(null); }} />
      )}
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
      </Card>
      <Button title={task ? tr('Lưu thay đổi') : tr('Tạo nhiệm vụ')} onPress={save} />
      {task && (
        <Button
          title={tr('Xoá nhiệm vụ')}
          variant="ghost"
          onPress={() =>
            showAlert(tr('Xoá nhiệm vụ?'), task.title, [
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
      <Card>
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
      </Card>
      <Button title={tr('Lưu')} onPress={save} />
      {subject && (
        <Button
          title={tr('Xoá môn học')}
          variant="ghost"
          onPress={() =>
            showAlert(tr('Xoá môn học?'), tr('Nhiệm vụ thuộc môn sẽ được giữ lại.'), [
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
