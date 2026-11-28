import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { Icon, type IconName } from './Icon';
import { colors } from '../theme';

/** Lưới ô lối tắt (2 cột) dẫn tới các chức năng – dùng ở tab Học và Cùng nhau */
export function HubTiles({ items }: { items: { icon: IconName; label: string; note?: string; badge?: number; onPress: () => void }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map((t) => (
        <Pressable
          key={t.label}
          onPress={t.onPress}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          style={({ pressed }) => ({
            flexBasis: '47%',
            flexGrow: 1,
            minHeight: 74,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.cardBorder,
            backgroundColor: pressed ? colors.surface2 : colors.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.markerSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={t.icon} size={21} color={colors.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 14.5 }} numberOfLines={2}>
              {t.label}
            </Text>
            {!!t.note && (
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {t.note}
              </Text>
            )}
          </View>
          {!!t.badge && (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t.badge > 99 ? '99+' : t.badge}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
