import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { colors, getThemeMode, isDark, wantsDark, type ThemeMode } from '../theme';
import { prefSet, tr } from '../i18n';
import { reloadApp } from '../focusLock';
import { showAlert } from './Dialog';

/** Chọn giao diện Sáng / Tối / Theo hệ thống. Đổi xong app tự tải lại để mọi màn đổi màu một lượt. */
export function ThemeSwitch() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const opts: [ThemeMode, string, string][] = [
    ['light', '☀️', tr('Sáng')],
    ['dark', '🌙', tr('Tối')],
    ['system', '📱', tr('Theo máy')],
  ];
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
      {opts.map(([m, icon, label]) => {
        const on = mode === m;
        return (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={async () => {
              if (on) return;
              prefSet('theme', m);
              setMode(m);
              if (wantsDark() === isDark) return; // màu không đổi (VD: chọn "Theo máy" khi máy đang sáng)
              prefSet('reopenTab', 'Profile');
              if (await reloadApp()) return;
              prefSet('reopenTab', '');
              showAlert(tr('Đã đổi giao diện'), tr('Đóng và mở lại FOCUSLY để áp dụng.'));
            }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, backgroundColor: on ? colors.marker : 'transparent' }}
          >
            <Text style={{ fontSize: 14, fontWeight: on ? '800' : '500', color: on ? colors.onMarker : colors.text2 }}>
              {icon} {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
