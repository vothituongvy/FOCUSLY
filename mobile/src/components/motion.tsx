import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, ViewStyle } from 'react-native';

/**
 * Chuyển động nhẹ cho app. Tôn trọng cài đặt "Giảm chuyển động" của hệ điều hành:
 * khi bật, mọi thứ hiện ngay, không trượt.
 */
let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduced = v;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
  reduced = v;
});

export function useReducedMotion() {
  const [v, setV] = useState(reduced);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setV);
    return () => sub.remove();
  }, []);
  return v;
}

/** Hiện dần + trượt nhẹ lên khi xuất hiện. `delay` để các khối nối tiếp nhau. */
export function FadeIn({ children, delay = 0, from = 12, style }: { children: ReactNode; delay?: number; from?: number; style?: StyleProp<ViewStyle> }) {
  const p = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    const anim = Animated.timing(p, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [p, delay]);
  return (
    <Animated.View style={[style, { opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Thu nhỏ nhẹ khi nhấn – dùng trong Pressable qua onPressIn/onPressOut */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (v: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return {
    style: { transform: [{ scale }] },
    onPressIn: () => animate(to),
    onPressOut: () => animate(1),
  };
}

/** Giá trị chạy mượt tới `value` (dùng cho thanh tiến độ, cột biểu đồ) */
export function useAnimatedNumber(value: number, duration = 600) {
  const v = useRef(new Animated.Value(reduced ? value : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(value);
      return;
    }
    const anim = Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [v, value, duration]);
  return v;
}
