import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from './AppText';
import { api } from '../api/client';
import { colors } from '../theme';
import { Card, H3, Muted } from './ui';
import { tr } from '../i18n';

interface Memory {
  atRisk: { cardId: string; front: string; recallNow: number }[];
  forgettingSoon: number;
  averageRecall: number | null;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** FOCUSLY Brain dự báo thẻ sắp quên (Half-Life Regression) */
export function MemoryForecast() {
  const [m, setM] = useState<Memory | null>(null);
  useEffect(() => {
    api<Memory>('/ai/memory')
      .then(setM)
      .catch(() => setM(null));
  }, []);
  if (!m || !m.atRisk.length) return null;
  return (
    <Card>
      <H3>{tr('Brain dự báo: thẻ sắp quên')}</H3>
      <Muted style={{ fontSize: 12 }}>
        {tr('Trí nhớ trung bình {0}', pct(m.averageRecall ?? 0))} · {tr('{0} thẻ dưới 70% trong 24 giờ tới', m.forgettingSoon)}
      </Muted>
      {m.atRisk.slice(0, 5).map((c) => (
        <View key={c.cardId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, color: colors.text }} numberOfLines={1}>
            {c.front}
          </Text>
          <View style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(c.recallNow * 100)}%`, height: '100%', backgroundColor: c.recallNow < 0.5 ? colors.danger : c.recallNow < 0.7 ? '#e0a100' : colors.success }} />
          </View>
          <Text style={{ width: 38, textAlign: 'right', fontWeight: '700', color: colors.text, fontSize: 12 }}>{pct(c.recallNow)}</Text>
        </View>
      ))}
    </Card>
  );
}
