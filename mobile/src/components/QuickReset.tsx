import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { useData } from '../store/data';
import { colors } from '../theme';
import { Button, Muted } from './ui';
import { tr } from '../i18n';

/**
 * PHASE 2 – Focus Recovery trên Mobile: Quick Reset
 * Hít thở 4-4-4-4 nhắc lại mục tiêu chọn tiếp tục / nghỉ / kết thúc. Ghi lịch sử (offline được).
 */
const PHASES = [tr('Hít vào'), tr('Giữ hơi'), tr('Thở ra'), tr('Nghỉ')];

export function QuickReset({
  visible,
  goal,
  sessionId,
  trigger = 'manual',
  device,
  onClose,
  onResume,
  onBreak,
  onEnd,
}: {
  visible: boolean;
  goal: string;
  sessionId?: string;
  trigger?: 'manual' | 'distraction' | 'app_leave';
  device: 'android' | 'ios';
  onClose: () => void;
  onResume: () => void;
  onBreak: () => void;
  onEnd: () => void;
}) {
  const create = useData((s) => s.create);
  const [step, setStep] = useState<'choose' | 'breathing' | 'goal'>('choose');
  const [phase, setPhase] = useState(0);
  const [action, setAction] = useState<'breathing' | 'goal_reminder' | 'take_break'>('breathing');
  const scale = useRef(new Animated.Value(0.8)).current;
  const started = useRef(Date.now());

  useEffect(() => {
    if (visible) {
      setStep('choose');
      setPhase(0);
      started.current = Date.now();
    }
  }, [visible]);

  useEffect(() => {
    if (step !== 'breathing') return;
    let n = 0;
    const run = () => {
      const p = n % 4;
      setPhase(p);
      Animated.timing(scale, { toValue: p === 0 || p === 1 ? 1.15 : 0.8, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
      n++;
      if (n > 12) setStep('goal'); // 3 vòng ≈ 48s
    };
    run();
    const id = setInterval(run, 4000);
    return () => clearInterval(id);
  }, [step, scale]);

  const finish = (outcome: 'resumed' | 'break' | 'ended') => {
    void create('recoveries', {
      session: sessionId ?? null,
      trigger,
      action,
      outcome,
      durationSeconds: Math.round((Date.now() - started.current) / 1000),
      startedAt: new Date(started.current).toISOString(),
      device,
    });
    onClose();
    if (outcome === 'resumed') onResume();
    if (outcome === 'break') onBreak();
    if (outcome === 'ended') onEnd();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(18,26,46,0.97)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
        <Text style={{ color: '#eef0ff', fontSize: 20, fontWeight: '800' }}>Quick Reset</Text>
        {step === 'choose' && (
          <View style={{ width: '100%', gap: 12 }}>
            <Muted style={{ color: '#9aa0c7', textAlign: 'center' }}>{tr('Bị gián đoạn là bình thường. Chọn cách quay lại:')}</Muted>
            <Button
              title={tr('Hít thở 4-4-4-4 (≈ 50 giây)')}
              onPress={() => {
                setAction('breathing');
                setStep('breathing');
              }}
            />
            <Button
              title={tr('Xem lại mục tiêu')}
              variant="secondary"
              onPress={() => {
                setAction('goal_reminder');
                setStep('goal');
              }}
            />
            <Button
              title={tr('Nghỉ ngắn')}
              variant="secondary"
              onPress={() => {
                setAction('take_break');
                finish('break');
              }}
            />
            <Pressable onPress={onClose}>
              <Text style={{ color: '#9aa0c7', textAlign: 'center', padding: 8 }}>{tr('Đóng')}</Text>
            </Pressable>
          </View>
        )}
        {step === 'breathing' && (
          <>
            <Animated.View
              style={{ width: 200, height: 200, borderRadius: 100, backgroundColor: colors.marker, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}
            >
              <Text style={{ color: colors.text, fontSize: 21, fontWeight: '800' }}>{PHASES[phase]}</Text>
            </Animated.View>
            <Pressable onPress={() => setStep('goal')}>
              <Text style={{ color: '#9aa0c7' }}>{tr('Bỏ qua')}</Text>
            </Pressable>
          </>
        )}
        {step === 'goal' && (
          <View style={{ width: '100%', gap: 12, alignItems: 'center' }}>
            <Muted style={{ color: '#9aa0c7' }}>{tr('Mục tiêu ban đầu của bạn:')}</Muted>
            <Text style={{ color: '#fff', fontSize: 19, fontWeight: '700', textAlign: 'center' }}>“{goal}”</Text>
            <Muted style={{ color: '#9aa0c7' }}>{tr('Chỉ cần làm bước nhỏ tiếp theo.')}</Muted>
            <Button title={tr('Tiếp tục học')} style={{ alignSelf: 'stretch' }} onPress={() => finish('resumed')} />
            <Button title={tr('Nghỉ ngắn')} variant="secondary" style={{ alignSelf: 'stretch' }} onPress={() => finish('break')} />
            <Pressable onPress={() => finish('ended')}>
              <Text style={{ color: colors.danger, padding: 8 }}>{tr('Kết thúc phiên')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
