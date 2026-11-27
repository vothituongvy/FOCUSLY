import React from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Text } from './AppText';
import { Card, H3, Muted, ProgressBar } from './ui';
import { colors } from '../theme';
import { tr } from '../i18n';
import { useApi } from './useApi';

export interface GamifyStatus {
  streak: { current: number; best: number; todayDone: boolean; minMinutesPerDay: number; usedFreeze: string[] };
  freezes: number;
  nextFreezeIn: number;
  quests: { id: string; progress: number; target: number; done: boolean; xp: number }[];
  allDoneBonus: number;
  xp: number;
  level: number;
  into: number;
  need: number;
}

export function questTitle(id: string, target: number) {
  if (id === 'focus') return tr('Tập trung {0} phút', target);
  if (id === 'cards') return tr('Ôn {0} flashcard', target);
  if (id === 'quiz') return tr('Làm {0} bộ câu hỏi', target);
  return tr('Hoàn thành {0} nhiệm vụ', target);
}

/** Chuỗi ngày học + thẻ đóng băng + 3 nhiệm vụ hôm nay */
export function DailyQuests() {
  const nav = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = useApi<GamifyStatus>('/social/gamify').data;
  if (!g) return null;
  const go = (id: string) => {
    if (id === 'focus') nav.navigate('Focus');
    else if (id === 'cards') nav.navigate('Review');
    else if (id === 'quiz') nav.navigate('Learn');
    else nav.navigate('Plan');
  };
  const all = g.quests.every((q) => q.done);
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View
          style={{
            minWidth: 78,
            paddingVertical: 8,
            paddingHorizontal: 8,
            borderRadius: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: g.streak.todayDone ? colors.text : colors.borderStrong,
            backgroundColor: g.streak.todayDone ? colors.marker : colors.surface,
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{g.streak.current}</Text>
          <Text style={{ fontSize: 11.5, color: colors.text2, textAlign: 'center' }}>{tr('ngày liên tiếp')}</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontWeight: '800', color: colors.text }}>
            {tr('Cấp {0}', g.level)} · {g.xp} XP
          </Text>
          <ProgressBar value={g.need ? g.into / g.need : 0} />
          <Muted>
            ❄ {tr('{0} thẻ đóng băng', g.freezes)}
            {g.freezes < 2 ? ` · ${tr('thêm thẻ sau {0} ngày', g.nextFreezeIn)}` : ''}
          </Muted>
        </View>
      </View>
      {g.streak.usedFreeze.length > 0 && <Muted>❄ {tr('Đã dùng thẻ đóng băng để giữ chuỗi cho {0}.', g.streak.usedFreeze.join(', '))}</Muted>}
      <H3>{tr('Nhiệm vụ hôm nay')}</H3>
      {g.quests.map((q) => (
        <Pressable
          key={q.id}
          onPress={() => go(q.id)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: q.done ? colors.successSoft : colors.border, backgroundColor: q.done ? colors.successSoft : colors.surface }}
        >
          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: q.done ? colors.success : colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
            {q.done && <Text style={{ color: colors.success, fontWeight: '800' }}>✓</Text>}
          </View>
          <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{questTitle(q.id, q.target)}</Text>
          <Muted>
            {q.progress}/{q.target} · +{q.xp}
          </Muted>
        </Pressable>
      ))}
      <Muted>{all ? tr('Xong cả 3 nhiệm vụ hôm nay – thưởng thêm {0} XP!', g.allDoneBonus) : tr('Xong cả 3 nhiệm vụ để được thêm {0} XP.', g.allDoneBonus)}</Muted>
    </Card>
  );
}
