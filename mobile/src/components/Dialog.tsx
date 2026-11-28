import React, { useEffect, useRef } from 'react';
import { Alert, Animated, Modal, Pressable, View, type AlertButton } from 'react-native';
import { create } from 'zustand';
import { Text } from './AppText';
import { colors, fonts } from '../theme';
import { tr } from '../i18n';

/**
 * Hộp thoại FOCUSLY thay cho Alert.alert của hệ thống (giao diện thô, không theo màu app).
 * Cách dùng giống hệt: showAlert(tiêu đề, nội dung?, [{ text, style: 'cancel' | 'destructive', onPress }])
 */
interface Req {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}
const useDialogs = create<{ queue: Req[] }>(() => ({ queue: [] }));
let seq = 0;
let mounted = false;

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (!mounted) return Alert.alert(title, message, buttons); // chưa dựng giao diện (hiếm)
  useDialogs.setState((s) => ({ queue: [...s.queue, { id: ++seq, title, message, buttons: buttons?.length ? buttons : [{ text: tr('Đã hiểu') }] }] }));
}

const dangerWord = /^(xoá|xóa|huỷ|hủy|rời|khoá|khóa|chặn|gỡ|đăng xuất|delete|remove|leave|block|log out)/i;

export function DialogHost() {
  const queue = useDialogs((s) => s.queue);
  useEffect(() => {
    mounted = true;
    return () => {
      mounted = false;
    };
  }, []);
  const d = queue[0];
  const scale = useRef(new Animated.Value(0.94)).current;
  useEffect(() => {
    if (!d) return;
    scale.setValue(0.94);
    Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;

  const close = (b?: AlertButton) => {
    useDialogs.setState((s) => ({ queue: s.queue.filter((x) => x.id !== d.id) }));
    // chạy sau khi hộp thoại đóng (VD: nút mở hộp thoại khác)
    if (b?.onPress) setTimeout(() => b.onPress?.(), 0);
  };
  const cancelBtn = d.buttons.find((b) => b.style === 'cancel');
  const danger = d.buttons.some((b) => b.style === 'destructive') || (d.buttons.length > 1 && dangerWord.test(d.title));
  // nút "chính" (vàng/đỏ) để cuối, nút huỷ để đầu – giống thói quen trên điện thoại
  const ordered = [...d.buttons].sort((a, b) => (a.style === 'cancel' ? -1 : b.style === 'cancel' ? 1 : 0));
  const stacked = ordered.length > 2 || ordered.some((b) => (b.text ?? '').length > 14);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(cancelBtn)}>
      <Pressable onPress={() => cancelBtn && close(cancelBtn)} style={{ flex: 1, backgroundColor: 'rgba(12,10,6,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Animated.View style={{ width: '100%', maxWidth: 400, transform: [{ scale }] }}>
          <Pressable
            accessibilityRole="alert"
            style={{ backgroundColor: colors.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 16, gap: 10, borderWidth: 1, borderColor: colors.cardBorder, elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }}
          >
            <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? colors.dangerSoft : colors.marker, marginBottom: 2 }}>
              <Text style={{ fontSize: 22, fontWeight: '900', color: danger ? colors.danger : colors.onMarker }}>{danger ? '!' : d.buttons.length > 1 ? '?' : 'i'}</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, fontFamily: fonts.display }}>{d.title}</Text>
            {!!d.message && <Text style={{ fontSize: 15.5, lineHeight: 22, color: colors.text2 }}>{d.message}</Text>}
            <View style={{ flexDirection: stacked ? 'column-reverse' : 'row', gap: 10, marginTop: 8 }}>
              {ordered.map((b, i) => {
                const isCancel = b.style === 'cancel';
                const isDanger = b.style === 'destructive';
                const primary = !isCancel && (isDanger || i === ordered.length - 1);
                return (
                  <Pressable
                    key={`${b.text}-${i}`}
                    onPress={() => close(b)}
                    accessibilityRole="button"
                    style={({ pressed }) => ({
                      flex: stacked ? undefined : 1,
                      minHeight: 46,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      opacity: pressed ? 0.8 : 1,
                      backgroundColor: isDanger ? colors.danger : primary ? colors.marker : colors.surface2,
                      borderColor: isDanger ? colors.danger : primary ? colors.marker : colors.borderStrong,
                    })}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 15, color: isDanger ? '#fff' : primary ? colors.onMarker : colors.text }}>{b.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
