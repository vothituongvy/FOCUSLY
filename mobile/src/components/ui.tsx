import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import { useData } from '../store/data';
import { Icon, type IconName } from './Icon';
import { tr } from '../i18n';
import { FadeIn, useAnimatedNumber, usePressScale } from './motion';

/**
 * Khung màn hình: header cố định phía trên (nếu có) + nội dung cuộn.
 */
export function Screen({ children, scroll = true, padded = true, header }: { children: ReactNode; scroll?: boolean; padded?: boolean; header?: ReactNode }) {
  // Nội dung nằm trên một "trang giấy" trắng đặt trên nền bàn, hiện ra nhẹ nhàng khi mở màn hình
  const content = padded ? (
    <FadeIn style={{ padding: 16 }}>
      <View style={{ gap: 14 }}>{children}</View>
    </FadeIn>
  ) : (
    <View>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={header ? [] : ['top']}>
      {header}
      <SyncBar />
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 32 }}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

/** Thanh trạng thái offline / đang đồng bộ */
export function SyncBar() {
  const { online, pending, syncing } = useData();
  if (online && !pending) return null;
  return (
    <View style={[s.syncBar, { backgroundColor: online ? colors.markerSoft : colors.dangerSoft }]}>
      <Icon name="sync" size={13} color={online ? colors.text : colors.danger} />
      <Text style={{ fontSize: 12, color: online ? colors.text : colors.danger, fontWeight: '600' }}>
        {online ? (syncing ? tr('Đang đồng bộ…') : tr('{0} thay đổi chờ đồng bộ', pending)) : tr('Đang offline, {0} thay đổi sẽ gửi khi có mạng', pending)}
      </Text>
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H3({ children }: { children: ReactNode }) {
  return <Text style={s.h3}>{children}</Text>;
}
export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

const LAYOUT_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'position', 'top', 'left', 'right', 'bottom'] as const;

/** Khung thẻ: tách kiểu bố cục (flex, margin…) ra lớp ngoài, kiểu hiển thị vào lớp trong */
export function Paper({ children, style, radius: r = radius + 2, depth = 4 }: { children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; depth?: number }) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) ((LAYOUT_KEYS as readonly string[]).includes(k) ? outer : inner)[k] = v;
  void depth;
  return (
    <View style={outer as ViewStyle}>
      <View style={[{ borderRadius: r, flexGrow: 1 }, inner as ViewStyle]}>{children}</View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Paper style={[s.card, style]}>{children}</Paper>;
}

/** Tiêu đề nhóm nội dung trên nền bàn (không đóng khung) */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Text style={s.h3}>{title}</Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'marker';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary: { bg: colors.text, fg: '#fff', border: colors.text },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.text2, border: 'transparent' },
    danger: { bg: colors.surface, fg: colors.danger, border: '#efc4bb' },
    marker: { bg: colors.marker, fg: colors.text, border: colors.text },
  }[variant];
  const press = usePressScale();
  return (
    <Animated.View style={[style, press.style]}>
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        s.btn,
        small && { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 9 },
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : 1 },
        variant === 'marker' && !pressed && { borderBottomWidth: 3, borderRightWidth: 3 }, // bóng cứng kiểu in ấn
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Icon name={icon} size={small ? 16 : 20} color={v.fg} />}
          <Text style={{ color: v.fg, fontWeight: '700', fontSize: small ? 13 : 15 }}>{title}</Text>
        </View>
      )}
    </Pressable>
    </Animated.View>
  );
}

export function IconButton({ name, onPress, label, color = colors.text, badge }: { name: IconName; onPress: () => void; label: string; color?: string; badge?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: colors.surface2 }]}>
      <Icon name={name} size={23} color={color} />
      {!!badge && (
        <View style={s.badgeDot}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9aa2b6" style={[s.input, props.multiline && { minHeight: 84, textAlignVertical: 'top' }]} {...props} />
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[s.chip, active && { borderColor: colors.text, backgroundColor: colors.marker }]}>
      <Text style={{ color: active ? colors.text : colors.text2, fontWeight: active ? '700' : '500', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>;
}

export function ProgressBar({ value, color = colors.marker }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const w = useAnimatedNumber(pct, 700);
  return (
    <View style={{ height: 10, backgroundColor: colors.surface2, borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      <Animated.View
        style={{
          width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          height: '100%',
          backgroundColor: color,
          borderRightWidth: pct > 0 && pct < 100 ? 1 : 0,
          borderRightColor: colors.text,
        }}
      />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return <Text style={[s.muted, { textAlign: 'center', paddingVertical: 24 }]}>{text}</Text>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.text} />
    </View>
  );
}

/** Logo: ô mực với vạch dạ quang */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.27, backgroundColor: colors.text, justifyContent: 'center', paddingHorizontal: size * 0.23 }}>
      <View style={{ height: size * 0.19, borderRadius: 2, backgroundColor: colors.marker }} />
    </View>
  );
}

export const s = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.6 },
  h3: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted, fontSize: 13 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius + 2,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  btn: { borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeDot: { position: 'absolute', top: 5, right: 4, minWidth: 16, height: 16, borderRadius: 5, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  chip: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surface },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  syncBar: { paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  error: { color: colors.danger, fontSize: 13 },
});
