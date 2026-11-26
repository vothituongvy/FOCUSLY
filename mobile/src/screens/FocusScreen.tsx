import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Modal, Pressable, ScrollView, StatusBar, Switch, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useAuth } from '../store/auth';
import { useData } from '../store/data';
import { useSession } from '../store/session';
import { fmtClock, fmtDuration, timerInfo } from '../offline/sessionLogic';
import { colors, tints } from '../theme';
import { REASONS, type DistractionReason, type FocusSession, type Pomodoro } from '../types';
import type { TabParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Field, H1, Muted, Row, Screen, s } from '../components/ui';
import { QuickReset } from '../components/QuickReset';
import { PLATFORM } from '../config';
import { focusLockAvailable, isScreenLocked, lockScreen } from '../focusLock';
import { AppHeader } from '../components/AppHeader';
import { Icon, type IconName } from '../components/Icon';
import { TranslateSheet } from '../components/TranslateSheet';
import { tr } from '../i18n';

type Level = 'off' | 'shield' | 'strict';
const LEVELS: { id: Level; name: string; line: string; icon: IconName }[] = [
  { id: 'off', name: tr('Không chặn'), line: tr('Học bình thường'), icon: 'play' },
  { id: 'shield', name: 'Focus Shield', line: tr('Nhắc khi rời app'), icon: 'shield' },
  { id: 'strict', name: tr('Nghiêm ngặt'), line: tr('Ghim app, khó thoát'), icon: 'lock' },
];
const LEVEL_TINT = { off: tints.sky, shield: tints.mint, strict: tints.lilac };
const RULES: { text: string; levels: Level[] }[] = [
  { text: tr('Màn hình tối giản, ghi lại mỗi lần bạn rời app'), levels: ['shield', 'strict'] },
  { text: tr('Máy tính có tiện ích FOCUSLY sẽ chặn trang gây xao nhãng'), levels: ['shield', 'strict'] },
  { text: tr('Ghim FOCUSLY lên màn hình, không mở được app khác'), levels: ['strict'] },
  { text: tr('Đồng hồ dừng khi bạn rời app, chỉ tính lúc bạn thật sự học'), levels: ['strict'] },
  { text: tr('Muốn dừng sớm phải giữ nút 3 giây'), levels: ['strict'] },
];

export function FocusScreen() {
  const session = useSession((st) => st.session);
  const ended = useSession((st) => st.ended);
  if (session) return <Running session={session} />;
  if (ended) return <Summary session={ended} />;
  return <Setup />;
}

/* ============================ SETUP ============================ */
function Setup() {
  const route = useRoute<RouteProp<TabParams, 'Focus'>>();
  const user = useAuth((st) => st.user);
  const { subjects, tasks } = useData();
  const start = useSession((st) => st.start);
  const initialTask = tasks.find((t) => t.id === route.params?.taskId);
  const [subject, setSubject] = useState<string | null>(initialTask?.subject ?? null);
  const [taskId, setTaskId] = useState<string | null>(initialTask?.id ?? null);
  const [mode, setMode] = useState<'pomodoro' | 'custom' | 'free'>('pomodoro');
  const [pomo, setPomo] = useState<Pomodoro>(user?.profile.defaultPomodoro ?? { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4 });
  const [custom, setCustom] = useState(String(initialTask?.estimatedMinutes ?? 45));
  const [shield, setShield] = useState(user?.shield.autoEnableOnSession ?? true);
  const [strict, setStrict] = useState(user?.shield.strictByDefault ?? false);
  const level: Level = strict ? 'strict' : shield ? 'shield' : 'off';
  const [goal, setGoal] = useState(initialTask ? initialTask.expectedOutcome || initialTask.title : '');

  useEffect(() => {
    if (!route.params?.taskId) return;
    const t = tasks.find((x) => x.id === route.params?.taskId);
    if (t) {
      setTaskId(t.id);
      setSubject(t.subject);
      setGoal(t.expectedOutcome || t.title);
    }
  }, [route.params?.taskId, tasks]);

  const openTasks = tasks.filter((t) => ['todo', 'in_progress'].includes(t.status) && (!subject || t.subject === subject));

  return (
    <Screen header={<AppHeader title={tr('Tập trung')} subtitle={tr('Chọn việc cần học rồi bắt đầu')} />}>
      <Card>
        <Text style={s.label}>{tr('1. Môn học')}</Text>
        <Chips>
          <Chip label={tr('Không')} active={!subject} onPress={() => setSubject(null)} />
          {subjects.map((x) => (
            <Chip
              key={x.id}
              label={`${x.icon} ${x.name}`}
              active={subject === x.id}
              onPress={() => {
                setSubject(x.id);
                setTaskId(null);
              }}
            />
          ))}
        </Chips>
        <Text style={s.label}>{tr('2. Nhiệm vụ')}</Text>
        <Chips>
          {openTasks.slice(0, 12).map((t) => (
            <Chip
              key={t.id}
              label={t.title}
              active={taskId === t.id}
              onPress={() => {
                setTaskId(taskId === t.id ? null : t.id);
                setGoal(t.expectedOutcome || t.title);
                setCustom(String(t.estimatedMinutes || 45));
              }}
            />
          ))}
          {openTasks.length === 0 && <Muted>{tr('Không có nhiệm vụ mở.')}</Muted>}
        </Chips>
      </Card>
      <Card>
        <Text style={s.label}>{tr('3. Thời gian tập trung')}</Text>
        <Chips>
          <Chip label="Pomodoro" active={mode === 'pomodoro'} onPress={() => setMode('pomodoro')} />
          <Chip label={tr('Tuỳ chỉnh')} active={mode === 'custom'} onPress={() => setMode('custom')} />
          <Chip label={tr('∞ Tự do')} active={mode === 'free'} onPress={() => setMode('free')} />
        </Chips>
        {mode === 'pomodoro' && (
          <Row style={{ flexWrap: 'wrap' }}>
            {(
              [
                ['focusMinutes', tr('Tập trung')],
                ['breakMinutes', tr('Nghỉ')],
                ['longBreakMinutes', tr('Nghỉ dài')],
                ['cyclesBeforeLongBreak', tr('Vòng')],
              ] as const
            ).map(([k, l]) => (
              <View key={k} style={{ width: '22%', flexGrow: 1 }}>
                <Muted>{l}</Muted>
                <TextInput
                  style={s.input}
                  keyboardType="number-pad"
                  value={String(pomo[k])}
                  onChangeText={(v) => setPomo({ ...pomo, [k]: Number(v) || 1 })}
                />
              </View>
            ))}
          </Row>
        )}
        {mode === 'custom' && <Field label={tr('Thời lượng (phút)')} value={custom} onChangeText={setCustom} keyboardType="number-pad" />}
      </Card>
      <Card style={{ gap: 8 }}>
        <Text style={s.label}>{tr('4. Mức bảo vệ khỏi xao nhãng')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {LEVELS.map((l) => {
            const on = level === l.id;
            return (
              <Pressable
                key={l.id}
                onPress={() => {
                  setShield(l.id !== 'off');
                  setStrict(l.id === 'strict');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  flex: 1,
                  gap: 6,
                  padding: 12,
                  borderRadius: 10,
                  borderColor: on ? LEVEL_TINT[l.id].ink : LEVEL_TINT[l.id].border,
                  borderWidth: on ? 2 : 1,
                  backgroundColor: LEVEL_TINT[l.id].bg,
                  opacity: on ? 1 : 0.85,
                }}
              >
                <Icon name={l.icon} size={20} color={LEVEL_TINT[l.id].ink} />
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>{l.name}</Text>
                <Text style={{ color: colors.text2, fontSize: 12, lineHeight: 16 }}>{l.line}</Text>
              </Pressable>
            );
          })}
        </View>
        {level !== 'off' && (
          <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 10, backgroundColor: colors.card, padding: 12, gap: 7 }}>
            {RULES.map((r) => {
              const has = r.levels.includes(level);
              return (
                <View key={r.text} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name={has ? 'check' : 'x'} size={15} color={has ? colors.success : colors.muted} />
                  <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: has ? colors.text : colors.muted, textDecorationLine: has ? 'none' : 'line-through' }}>{r.text}</Text>
                </View>
              );
            })}
            {level === 'strict' && !focusLockAvailable() && (
              <Muted>{tr('Cần build lại app để ghim được màn hình. Đồng hồ vẫn dừng khi bạn rời app.')}</Muted>
            )}
          </View>
        )}
      </Card>
      <Card>
      <Field label={tr('5. Mục tiêu của phiên học')} value={goal} onChangeText={setGoal} placeholder={tr('VD: Làm xong 20 câu trắc nghiệm chương 3')} />
      </Card>
      <Button
        title={tr('Bắt đầu phiên học')}
        icon="play"
        variant="marker"
        onPress={() =>
          start({
            subject,
            task: taskId,
            goal: goal.trim() || tr('Tập trung học'),
            mode,
            plannedMinutes: mode === 'custom' ? Number(custom) || 25 : mode === 'pomodoro' ? pomo.focusMinutes * pomo.cyclesBeforeLongBreak : 0,
            pomodoro: pomo,
            shieldEnabled: shield || strict,
            strict,
          })
        }
      />
    </Screen>
  );
}

/* ============================ RUNNING ============================ */
function Running({ session }: { session: FocusSession }) {
  const { pause, resume, takeBreak, appLeave, heartbeat, offsetMs } = useSession();
  const subjects = useData((st) => st.subjects);
  const [now, setNow] = useState(Date.now());
  const [showDistraction, setShowDistraction] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [recover, setRecover] = useState<null | 'manual' | 'distraction' | 'app_leave'>(null);
  const autoKey = useRef('');
  const leftAt = useRef<number | null>(null);

  const t = now + offsetMs;
  const info = timerInfo(session, t);
  const subj = subjects.find((x) => x.id === session.subject);
  const dark = session.shieldEnabled;
  const fg = dark ? colors.focusText : colors.text;
  const mutedC = dark ? colors.focusMuted : colors.muted;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void heartbeat();
    const id = setInterval(() => void heartbeat(), 30_000);
    return () => clearInterval(id);
  }, [heartbeat]);

  // Tự chuyển Pomodoro / báo hết giờ
  useEffect(() => {
    if (!info.done) return;
    const key = `${session.status}-${session.segments.length}`;
    if (autoKey.current === key) return;
    autoKey.current = key;
    if (session.status === 'active' && session.mode === 'pomodoro') void takeBreak();
    else if (session.status === 'on_break') Alert.alert(tr('Hết giờ nghỉ '), tr('Quay lại mục tiêu: {0}', session.goal), [{ text: tr('Tiếp tục học'), onPress: () => void resume() }, { text: tr('Để sau') }]);
    else if (session.status === 'active' && session.mode === 'custom') setShowEnd(true);
  }, [info.done, session.status, session.segments.length, session.mode, session.goal, takeBreak, resume]);

  // Focus Shield: phát hiện rời ứng dụng
  useEffect(() => {
    if (!session.shieldEnabled) return;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && session.status === 'active') {
        const left = Date.now();
        leftAt.current = left;
        // Phiên nghiêm ngặt: đồng hồ trung thực – rời app quá 2 giây là dừng, tính lùi về lúc rời đi
        if (session.strict) pauseTimer = setTimeout(() => void pause(new Date(left + offsetMs)), 2000);
      }
      if (state === 'active' && leftAt.current) {
        if (pauseTimer) clearTimeout(pauseTimer);
        const left = leftAt.current;
        leftAt.current = null;
        const secs = Math.round((Date.now() - left) / 1000);
        if (secs >= (session.strict ? 2 : 10)) {
          void appLeave(new Date(left + offsetMs), new Date(Date.now() + offsetMs));
          if (session.strict) {
            Alert.alert(tr('Đồng hồ đã dừng'), tr('Bạn đã rời FOCUSLY {0}. Thời gian đó không được tính.', fmtDuration(secs)), [
              { text: tr('Học tiếp'), onPress: () => void resume() },
              { text: 'Quick Reset', onPress: () => setRecover('app_leave') },
            ]);
          } else {
            Alert.alert(tr('Bạn vừa rời ứng dụng'), tr('Bạn đã rời {0}. Có phải bạn bị phân tâm?', fmtDuration(secs)), [
              { text: tr('Ghi nguyên nhân'), onPress: () => setShowDistraction(true) },
              { text: 'Quick Reset', onPress: () => setRecover('app_leave') },
              { text: tr('Không'), style: 'cancel' },
            ]);
          }
        }
      }
    });
    return () => {
      sub.remove();
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  }, [session.shieldEnabled, session.status, session.strict, appLeave, pause, resume, offsetMs]);

  // Phiên nghiêm ngặt: giữ màn hình được ghim (kể cả khi mở lại app giữa phiên)
  const [pinned, setPinned] = useState<boolean | null>(null);
  useEffect(() => {
    if (!session.strict) return;
    void (async () => {
      if (!(await isScreenLocked())) await lockScreen();
      setPinned(await isScreenLocked());
    })();
  }, [session.strict]);

  // Chặn nút Back khi đang học
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(tr('Đang trong phiên học'), tr('Kết thúc phiên trước khi thoát nhé.'));
      return true;
    });
    return () => sub.remove();
  }, []);

  const statusText = session.status === 'paused' ? tr('Tạm dừng') : session.status === 'on_break' ? tr('Nghỉ giải lao') : info.target ? tr('còn lại') : tr('đã tập trung');
  const barColor = session.status === 'on_break' ? '#4cc38a' : session.status === 'paused' ? '#8a93a8' : colors.marker;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? colors.focusBg : colors.bg }}>
      <StatusBar hidden={dark} barStyle={dark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {subj && <Text style={{ color: mutedC }}>{subj.icon} {subj.name}</Text>}
          <Text style={{ color: mutedC }}>· {info.label}</Text>
          {session.shieldEnabled && <Text style={{ color: mutedC }}>· Shield</Text>}
          {session.device === 'web' && <Text style={{ color: mutedC }}>{tr('· bắt đầu từ Web')}</Text>}
        </Row>
        <Text style={{ color: fg, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{session.goal}</Text>
        {session.autoPausedAt && session.status === 'paused' && (
          <Text style={{ color: '#ffc7bc', textAlign: 'center' }}>{tr('Phiên đã tự tạm dừng do ứng dụng bị đóng/mất kết nối.')}</Text>
        )}
        <Text style={{ color: fg, fontSize: 76, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{fmtClock(info.display)}</Text>
        <Text style={{ color: mutedC, marginTop: -14 }}>{statusText}</Text>
        <View style={{ width: '85%', height: 10, borderRadius: 99, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : colors.surface2, overflow: 'hidden' }}>
          <View style={{ width: `${info.ratio * 100}%`, height: '100%', backgroundColor: barColor }} />
        </View>
        <Row style={{ gap: 22 }}>
          {[
            [tr('Tập trung'), fmtClock(info.total)],
            [tr('Phân tâm'), String(session.distractionCount)],
            [tr('Rời app'), String(session.appLeaveCount)],
          ].map(([l, v]) => (
            <View key={l} style={{ alignItems: 'center' }}>
              <Text style={{ color: mutedC, fontSize: 12 }}>{l}</Text>
              <Text style={{ color: fg, fontWeight: '700' }}>{v}</Text>
            </View>
          ))}
        </Row>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {session.status === 'active' && <Button title={tr('Tạm dừng')} icon="pause" variant="secondary" onPress={() => void pause()} />}
          {session.status !== 'active' && <Button title={session.status === 'on_break' ? tr('Kết thúc nghỉ') : tr('Tiếp tục')} icon="play" variant="marker" onPress={resume} />}
          {session.status === 'active' && session.mode !== 'custom' && <Button title={tr('Nghỉ')} icon="coffee" variant="secondary" onPress={takeBreak} />}
          {session.strict && (session.mode !== 'custom' || info.total < session.plannedMinutes * 60) ? (
            <HoldToEnd onDone={() => setShowEnd(true)} />
          ) : (
            <Button title={tr('Kết thúc')} icon="stop" variant="danger" onPress={() => setShowEnd(true)} />
          )}
        </Row>
        {session.strict && (
          <Text style={{ color: mutedC, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>
            {pinned
              ? tr('Phiên nghiêm ngặt: FOCUSLY đang được ghim. Rời app thì đồng hồ dừng.')
              : tr('Phiên nghiêm ngặt: rời app thì đồng hồ dừng. Bật "Ghim ứng dụng" trong Cài đặt Android để khoá màn hình.')}
          </Text>
        )}
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Pressable onPress={() => setShowDistraction(true)}>
            <Text style={{ color: mutedC, fontWeight: '600', padding: 10 }}>{tr('Tôi đang bị phân tâm')}</Text>
          </Pressable>
          <Pressable onPress={() => setRecover('manual')}>
            <Text style={{ color: mutedC, fontWeight: '600', padding: 10 }}>Quick Reset</Text>
          </Pressable>
          <Pressable onPress={() => setShowTranslate(true)}>
            <Text style={{ color: mutedC, fontWeight: '600', padding: 10 }}>{tr('Dịch Anh ⇄ Việt')}</Text>
          </Pressable>
        </Row>
        <TranslateSheet visible={showTranslate} onClose={() => setShowTranslate(false)} />
      </ScrollView>
      <DistractionSheet
        visible={showDistraction}
        session={session}
        onClose={() => setShowDistraction(false)}
        onSaved={() => {
          setShowDistraction(false);
          setRecover('distraction');
        }}
      />
      <QuickReset
        visible={recover !== null}
        goal={session.goal}
        sessionId={session.id}
        trigger={recover ?? 'manual'}
        device={PLATFORM}
        onClose={() => setRecover(null)}
        onResume={() => session.status !== 'active' && void resume()}
        onBreak={() => session.status === 'active' && void takeBreak()}
        onEnd={() => setShowEnd(true)}
      />
      <EndSheet visible={showEnd} session={session} onClose={() => setShowEnd(false)} />
    </SafeAreaView>
  );
}

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14, maxHeight: '85%' }}>
        <Text style={[s.h3, { fontSize: 18 }]}>{title}</Text>
        <ScrollView contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Distraction Journal: ghi nhận phân tâm trong phiên */
function DistractionSheet({ visible, session, onClose, onSaved }: { visible: boolean; session: FocusSession; onClose: () => void; onSaved: () => void }) {
  const create = useData((st) => st.create);
  const [reason, setReason] = useState<DistractionReason | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const close = () => {
    setReason(null);
    setNote('');
    setSaved(false);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title={saved ? tr('Quay lại mục tiêu nhé ') : tr('Điều gì làm bạn phân tâm?')}>
      {saved ? (
        <>
          <Muted>{tr('Đã ghi vào Nhật ký phân tâm. Mục tiêu của bạn:')}</Muted>
          <Text style={{ fontSize: 17, fontWeight: '700', textAlign: 'center', color: colors.text }}>“{session.goal}”</Text>
          <Muted>{tr('Hít thở sâu 3 lần rồi tiếp tục.')}</Muted>
          <Button title={tr('Tiếp tục học')} onPress={close} />
        </>
      ) : (
        <>
          <Chips>
            {REASONS.map((r) => (
              <Chip key={r.value} label={`${r.icon} ${r.label}`} active={reason === r.value} onPress={() => setReason(r.value)} />
            ))}
          </Chips>
          <Field label={tr('Ghi chú')} value={note} onChangeText={setNote} multiline />
          <Button
            title={tr('Ghi nhận')}
            disabled={!reason}
            onPress={async () => {
              await create('distractions', { session: session.id, reason, note, device: session.device === 'ios' ? 'ios' : 'android', occurredAt: new Date().toISOString() });
              // cập nhật số đếm cục bộ ngay
              useSession.setState({ session: { ...session, distractionCount: session.distractionCount + 1 } });
              setReason(null);
              setNote('');
              onSaved(); // mở Quick Reset (Focus Recovery)
            }}
          />
        </>
      )}
    </Sheet>
  );
}

function EndSheet({ visible, session, onClose }: { visible: boolean; session: FocusSession; onClose: () => void }) {
  const end = useSession((st) => st.end);
  const [goalAchieved, setGoalAchieved] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const focus = useMemo(() => timerInfo(session, Date.now()).total, [session, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet visible={visible} onClose={onClose} title={tr('Kết thúc phiên học')}>
      <Muted>{tr('Bạn đã tập trung {0}. Mục tiêu: “{1}”', fmtDuration(focus), session.goal)}</Muted>
      <Text style={s.label}>{tr('Đạt mục tiêu chưa?')}</Text>
      <Chips>
        <Chip label={tr('Đã đạt')} active={goalAchieved === true} onPress={() => setGoalAchieved(true)} />
        <Chip label={tr('Chưa đạt')} active={goalAchieved === false} onPress={() => setGoalAchieved(false)} />
      </Chips>
      <Text style={s.label}>{tr('Tự đánh giá mức tập trung')}</Text>
      <Chips>
        {[1, 2, 3, 4, 5].map((n) => (
          <Chip key={n} label={'★'.repeat(n)} active={rating === n} onPress={() => setRating(n)} />
        ))}
      </Chips>
      <Field label={tr('Ghi chú kết quả')} value={note} onChangeText={setNote} multiline />
      {!!session.task && (
        <Row>
          <Switch value={markTaskDone} onValueChange={setMarkTaskDone} trackColor={{ true: colors.primary }} />
          <Text style={{ color: colors.text }}>{tr('Đánh dấu nhiệm vụ hoàn thành')}</Text>
        </Row>
      )}
      <Button
        title={tr('Lưu kết quả')}
        onPress={async () => {
          onClose();
          await end({ goalAchieved, rating, note, markTaskDone });
        }}
      />
      <Button
        title={tr('Huỷ phiên')}
        variant="ghost"
        onPress={async () => {
          onClose();
          await end({ abandon: true });
        }}
      />
      <Button title={tr('Học tiếp')} variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

/* ============================ SUMMARY ============================ */
function Summary({ session }: { session: FocusSession }) {
  const clearEnded = useSession((st) => st.clearEnded);
  const rows: [string, string][] = [
    [tr('Tập trung thực tế'), fmtDuration(session.actualFocusSeconds)],
    [tr('Dự kiến'), session.plannedMinutes ? tr('{0} phút', session.plannedMinutes) : '—'],
    [tr('Nghỉ'), fmtDuration(session.breakSeconds)],
    [tr('Tạm dừng'), String(session.pauseCount)],
    [tr('Phân tâm ghi nhận'), String(session.distractionCount)],
    [tr('Rời ứng dụng'), String(session.appLeaveCount)],
  ];
  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <H1>{session.status === 'abandoned' ? tr('Đã huỷ phiên') : tr('Tổng kết phiên học')}</H1>
        <Muted>{session.goal}</Muted>
      </Card>
      <Card>
        {rows.map(([k, v]) => (
          <Row key={k} style={{ justifyContent: 'space-between' }}>
            <Muted>{k}</Muted>
            <Text style={{ fontWeight: '700', color: colors.text }}>{v}</Text>
          </Row>
        ))}
        {session.summary.goalAchieved !== null && (
          <Text style={{ color: session.summary.goalAchieved ? colors.success : colors.warning, fontWeight: '700' }}>
            {session.summary.goalAchieved ? tr('Đã đạt mục tiêu') : tr('Chưa đạt mục tiêu – lần sau sẽ tốt hơn')}
          </Text>
        )}
        {!!session.summary.note && <Text style={{ color: colors.text }}>{session.summary.note}</Text>}
      </Card>
      <Muted>{tr('Kết quả sẽ được đồng bộ lên server và hiển thị trên Web.')}</Muted>
      <Button title={tr('Bắt đầu phiên mới')} icon="play" variant="marker" onPress={clearEnded} />
    </Screen>
  );
}

/** Phiên nghiêm ngặt: kết thúc sớm phải giữ nút 3 giây */
function HoldToEnd({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('Giữ 3 giây để kết thúc sớm')}
      onPressIn={() => {
        const t0 = Date.now();
        timer.current = setInterval(() => {
          const p = (Date.now() - t0) / 3000;
          if (p >= 1) {
            stop();
            onDone();
          } else setProgress(p);
        }, 30);
      }}
      onPressOut={stop}
      style={{ borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger, overflow: 'hidden', minHeight: 48, justifyContent: 'center', paddingHorizontal: 18 }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, backgroundColor: 'rgba(184,64,47,0.3)' }} />
      <Text style={{ color: colors.danger, fontWeight: '800', textAlign: 'center' }}>{progress > 0 ? tr('Giữ tiếp…') : tr('Giữ 3 giây để kết thúc')}</Text>
    </Pressable>
  );
}
