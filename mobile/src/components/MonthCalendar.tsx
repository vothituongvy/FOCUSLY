import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme';
import { Icon } from './Icon';
import { LANG, tr } from '../i18n';

/** Khoá ngày theo giờ máy: YYYY-MM-DD */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const keyToDate = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export interface DayMark {
  tasks: number; // nhiệm vụ có ngày học hôm đó
  done: number;
  deadline: boolean; // có hạn chót
  reminder: boolean; // có hẹn giờ nhắc
}

const WEEK_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const WEEK_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Lịch tháng gọn cho điện thoại (tuần bắt đầu Thứ 2, giống bản Web).
 * Dùng cho màn Lịch của Kế hoạch và làm bộ chọn ngày khi tạo nhiệm vụ.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  marks,
  compact,
}: {
  month: Date;
  onMonthChange: (d: Date) => void;
  selected?: string | null;
  onSelect: (key: string) => void;
  marks?: Map<string, DayMark>;
  compact?: boolean;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - offset);
  const weeks = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = dayKey(new Date());
  const cell = compact ? 38 : 48;
  const title = LANG === 'en' ? month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : tr('Tháng {0}/{1}', month.getMonth() + 1, month.getFullYear());

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityLabel={tr('Tháng trước')} hitSlop={8} onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ padding: 8 }}>
          <Icon name="chevronLeft" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => onMonthChange(new Date())} accessibilityLabel={tr('Về tháng này')}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }}>{title}</Text>
        </Pressable>
        <Pressable accessibilityLabel={tr('Tháng sau')} hitSlop={8} onPress={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ padding: 8 }}>
          <Icon name="chevronRight" size={20} color={colors.text} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {(LANG === 'en' ? WEEK_EN : WEEK_VI).map((w) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.muted }}>
            {w}
          </Text>
        ))}
      </View>
      {Array.from({ length: weeks }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {days.slice(r * 7, r * 7 + 7).map((d) => {
            const k = dayKey(d);
            const other = d.getMonth() !== month.getMonth();
            const on = selected === k;
            const isToday = k === today;
            const m = marks?.get(k);
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${d.toLocaleDateString()}${m?.tasks ? `, ${tr('{0} nhiệm vụ', m.tasks)}` : ''}`}
                onPress={() => onSelect(k)}
                style={{ flex: 1, height: cell, alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <View
                  style={{
                    width: compact ? 32 : 36,
                    height: compact ? 32 : 36,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? colors.text : isToday ? colors.marker : 'transparent',
                    borderWidth: isToday && !on ? 0 : 0,
                  }}
                >
                  <Text style={{ fontWeight: on || isToday ? '800' : '600', color: on ? colors.onText : isToday ? colors.onMarker : other ? colors.borderStrong : colors.text }}>{d.getDate()}</Text>
                </View>
                {!compact && (
                  <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
                    {!!m?.tasks && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.done >= m.tasks ? colors.success : colors.text }} />}
                    {m?.reminder && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#e5a800' }} />}
                    {m?.deadline && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger }} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
