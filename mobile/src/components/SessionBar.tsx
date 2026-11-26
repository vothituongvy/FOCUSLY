import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../store/session';
import { fmtClock, timerInfo } from '../offline/sessionLogic';
import { colors } from '../theme';
import { tr } from '../i18n';
import { Icon } from './Icon';

/**
 * Thanh nhỏ nằm trên thanh tab khi đang có phiên học mà bạn đang xem màn hình khác:
 * luôn thấy đồng hồ, chạm để quay lại phiên.
 */
export function SessionBar({ onOpen }: { onOpen: () => void }) {
  const session = useSession((s) => s.session);
  const offsetMs = useSession((s) => s.offsetMs);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);
  if (!session) return null;

  const info = timerInfo(session, now + offsetMs);
  const label = session.status === 'active' ? tr('Đang tập trung') : session.status === 'on_break' ? tr('Đang nghỉ') : tr('Tạm dừng');
  const dot = session.status === 'active' ? colors.marker : session.status === 'on_break' ? '#7fd1a6' : colors.focusMuted;

  return (
    <View style={{ paddingHorizontal: 12, paddingTop: 8, backgroundColor: colors.bg }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${fmtClock(info.total)}. ${tr('Quay lại phiên đang mở')}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: colors.focusBg,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.focusMuted, fontSize: 11.5 }}>{label}</Text>
          <Text numberOfLines={1} style={{ color: colors.focusText, fontWeight: '700', fontSize: 14 }}>
            {session.goal}
          </Text>
        </View>
        <Text style={{ color: colors.focusText, fontWeight: '800', fontSize: 17, fontVariant: ['tabular-nums'] }}>{fmtClock(info.total)}</Text>
        <Icon name="chevronRight" size={18} color={colors.focusMuted} />
      </Pressable>
    </View>
  );
}
