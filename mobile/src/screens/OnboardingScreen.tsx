import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, tints } from '../theme';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/ui';
import { LangSwitch } from '../components/LangSwitch';
import { tr } from '../i18n';

const { width: W } = Dimensions.get('window');

interface Slide {
  key: string;
  tone: { bg: string; border: string; ink: string };
  icons: IconName[];
  title: string;
  body: string;
}

const slides = (): Slide[] => [
  {
    key: 'plan',
    tone: tints.mint,
    icons: ['plan', 'calendar', 'check'],
    title: tr('Lên kế hoạch rõ ràng'),
    body: tr('Chia việc học thành môn học, mục tiêu và những nhiệm vụ nhỏ vừa sức. Biết hôm nay cần học gì.'),
  },
  {
    key: 'focus',
    tone: tints.lilac,
    icons: ['focus', 'lock', 'shield'],
    title: tr('Tập trung thật sự'),
    body: tr('Bật phiên học, chặn ứng dụng gây xao nhãng. Đồng hồ chỉ tính lúc bạn thật sự học.'),
  },
  {
    key: 'review',
    tone: tints.peach,
    icons: ['cards', 'analytics', 'flame'],
    title: tr('Ôn tập và nhìn lại'),
    body: tr('Flashcard nhắc đúng lúc sắp quên, biểu đồ cho thấy bạn tiến bộ mỗi ngày.'),
  },
];

/** Màn hình chờ có thương hiệu khi app đang khởi động */
export function SplashScreen() {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [p]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <Logo size={64} />
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: 1 }}>FOCUSLY</Text>
      <Text style={{ fontSize: 14, color: colors.muted }}>Learn with focus. Grow with consistency.</Text>
      <View style={{ width: 120, height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden', marginTop: 8 }}>
        <Animated.View
          style={{
            width: 48,
            height: '100%',
            borderRadius: 3,
            backgroundColor: colors.marker,
            transform: [{ translateX: p.interpolate({ inputRange: [0, 1], outputRange: [-48, 120] }) }],
          }}
        />
      </View>
    </View>
  );
}

/** Hình minh hoạ cho mỗi trang giới thiệu: 3 ô icon xếp lệch nhau trên nền màu */
function Art({ slide, active }: { slide: Slide; active: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 8 }).start();
  }, [active, v]);
  const tile = (name: IconName, i: number) => (
    <Animated.View
      key={name}
      style={{
        position: 'absolute',
        left: [18, 96, 52][i],
        top: [36, 8, 104][i],
        width: [84, 92, 78][i],
        height: [84, 92, 78][i],
        borderRadius: 24,
        backgroundColor: i === 1 ? colors.text : '#ffffff',
        borderWidth: 1,
        borderColor: slide.tone.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24 + i * 10, 0] }) },
          { rotate: ['-8deg', '6deg', '-3deg'][i] },
        ],
      }}
    >
      <Icon name={name} size={[34, 40, 30][i]} color={i === 1 ? colors.marker : slide.tone.ink} strokeWidth={2} />
    </Animated.View>
  );
  return (
    <View style={{ width: 230, height: 230, borderRadius: 115, backgroundColor: slide.tone.bg, alignSelf: 'center' }}>
      <View style={{ position: 'absolute', left: 20, top: 30, width: 200, height: 190 }}>{slide.icons.map(tile)}</View>
    </View>
  );
}

/** Giới thiệu FOCUSLY lần đầu mở app (3 trang, vuốt ngang) */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const data = slides();
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<Slide>>(null);
  const last = index === data.length - 1;

  const go = (i: number) => {
    list.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 10 }}>
        <Logo size={28} />
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: colors.text, letterSpacing: 0.6 }}>FOCUSLY</Text>
        <LangSwitch compact />
      </View>

      <FlatList
        ref={list}
        data={data}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item, index: i }) => (
          <View style={{ width: W, paddingHorizontal: 28, justifyContent: 'center', gap: 28 }}>
            <Art slide={item} active={i === index} />
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.8, lineHeight: 34 }}>{item.title}</Text>
              <Text style={{ fontSize: 16, lineHeight: 24, color: colors.text2 }}>{item.body}</Text>
            </View>
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }} accessibilityLabel={tr('Trang {0}/{1}', index + 1, data.length)}>
          {data.map((s, i) => (
            <View key={s.key} style={{ width: i === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? colors.text : colors.track }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {!last && (
            <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button" style={{ paddingVertical: 14, paddingHorizontal: 6 }}>
              <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 15 }}>{tr('Bỏ qua')}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => (last ? onDone() : go(index + 1))}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 15,
              borderRadius: 14,
              backgroundColor: last ? colors.marker : colors.text,
              borderWidth: last ? 1 : 0,
              borderColor: colors.text,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text style={{ color: last ? colors.text : '#ffffff', fontWeight: '800', fontSize: 16 }}>{last ? tr('Bắt đầu') : tr('Tiếp')}</Text>
            <Icon name="chevronRight" size={20} color={last ? colors.text : '#ffffff'} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
