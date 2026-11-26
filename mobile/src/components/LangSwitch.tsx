import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from './AppText';
import { LANG, setLang, type Lang } from '../i18n';
import { colors } from '../theme';

const OPTIONS: { id: Lang; label: string }[] = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
];

/** Đổi ngôn ngữ giao diện. Phần lớn chữ đổi ngay; vài nhãn cố định đổi sau khi mở lại app. */
export function LangSwitch({ compact = false }: { compact?: boolean }) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Ngôn ngữ / Language"
      style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: colors.surface2, borderRadius: 10, alignSelf: compact ? 'flex-end' : 'flex-start' }}
    >
      {OPTIONS.map((o) => {
        const on = LANG === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              setLang(o.id);
              Alert.alert(
                o.id === 'en' ? 'Language changed' : 'Đã đổi ngôn ngữ',
                o.id === 'en' ? 'Close and reopen FOCUSLY to switch every label.' : 'Đóng và mở lại FOCUSLY để đổi toàn bộ chữ.',
              );
            }}
            style={{ paddingVertical: compact ? 4 : 7, paddingHorizontal: compact ? 8 : 12, borderRadius: 8, backgroundColor: on ? colors.surface : 'transparent' }}
          >
            <Text style={{ fontSize: compact ? 12 : 14, fontWeight: on ? '800' : '500', color: on ? colors.text : colors.text2 }}>{compact ? o.id.toUpperCase() : o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
