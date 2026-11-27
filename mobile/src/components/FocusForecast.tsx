import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from './AppText';
import { api } from '../api/client';
import { kvGet, kvSet } from '../offline/db';
import { colors } from '../theme';
import { Card, H3, Muted, Row } from './ui';
import { Icon } from './Icon';
import { tr } from '../i18n';

/** Kết quả model dự báo tập trung của FOCUSLY Brain (GET /ai/forecast) */
export interface Forecast {
  trained: boolean;
  samples: number;
  confidence: number;
  typicalMinutes: number;
  suggestedMinutes: number;
  byHour: { hour: number; probability: number; sessions: number }[];
  bestHours: { hour: number; probability: number }[];
  now: { hour: number; probability: number; level: 'high' | 'medium' | 'low' };
  tips: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Lấy dự báo; khi offline dùng bản đã lưu gần nhất */
export function useForecast(minutes?: number, strict?: boolean) {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    let alive = true;
    const path = `/ai/forecast?${minutes ? `minutes=${minutes}&` : ''}strict=${strict ? 1 : 0}`;
    api<Forecast>(path)
      .then(async (r) => {
        if (alive) setF(r);
        await kvSet('forecast', r);
      })
      .catch(async () => {
        const cached = await kvGet<Forecast>('forecast');
        if (alive && cached) setF(cached);
      });
    return () => {
      alive = false;
    };
  }, [minutes, strict]);
  return f;
}

const LEVEL_BG = { high: colors.successSoft, medium: colors.markerSoft, low: colors.dangerSoft } as const;
const LEVEL_TEXT = { high: tr('dễ giữ tập trung'), medium: tr('tập trung ở mức vừa'), low: tr('dễ bị phân tâm') } as const;

/** Dòng gợi ý ở màn Bắt đầu phiên */
export function ForecastHint({ minutes, strict, onUseMinutes }: { minutes?: number; strict?: boolean; onUseMinutes?: (m: number) => void }) {
  const f = useForecast(minutes, strict);
  if (!f) return null;
  if (!f.trained) {
    return (
      <Row style={{ flexWrap: 'nowrap', gap: 8 }}>
        <Icon name="ai" size={16} color={colors.muted} />
        <Muted style={{ flex: 1, fontSize: 12 }}>{tr('FOCUSLY Brain đang học thói quen của bạn ({0}/6 phiên).', f.samples)}</Muted>
      </Row>
    );
  }
  return (
    <View style={{ backgroundColor: LEVEL_BG[f.now.level], borderRadius: 12, padding: 12, gap: 6 }}>
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <Icon name="ai" size={18} color={colors.text} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 13.5, lineHeight: 19 }}>
          {tr('Lúc này ({0}h) bạn {1}: ', f.now.hour, LEVEL_TEXT[f.now.level])}
          <Text style={{ fontWeight: '800' }}>{pct(f.now.probability)}</Text>
          {tr(' · Giờ tốt nhất: {0}', f.bestHours.map((b) => `${b.hour}h`).join(', '))}
        </Text>
      </Row>
      {onUseMinutes && f.suggestedMinutes !== minutes && (
        <Pressable onPress={() => onUseMinutes(f.suggestedMinutes)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontWeight: '700', color: colors.text, textDecorationLine: 'underline' }}>{tr('Dùng phiên {0} phút', f.suggestedMinutes)}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Thẻ dự báo theo giờ cho màn Đề xuất & kế hoạch */
export function ForecastCard() {
  const f = useForecast();
  if (!f) {
    return (
      <Card>
        <ActivityIndicator color={colors.text} />
      </Card>
    );
  }
  const best = new Set(f.bestHours.map((b) => b.hour));
  const hours = f.byHour.filter((h) => h.hour >= 6);
  return (
    <Card>
      <H3>{tr('Dự báo tập trung')}</H3>
      <Muted style={{ fontSize: 12 }}>{tr('FOCUSLY Brain · học từ {0} phiên của bạn', f.samples)}</Muted>
      {!f.trained ? (
        <Muted>{tr('Cần ít nhất 6 phiên học (đã có {0}) để model hiểu bạn tập trung tốt nhất lúc nào. Cứ học đều vài ngày nhé!', f.samples)}</Muted>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 2 }} accessibilityLabel={tr('Khả năng giữ tập trung theo giờ')}>
            {hours.map((h) => (
              <View key={h.hour} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}>
                <View
                  style={{
                    width: '100%',
                    height: `${Math.max(4, h.probability * 85)}%`,
                    borderRadius: 3,
                    backgroundColor: best.has(h.hour) ? colors.marker : colors.track,
                    borderWidth: h.hour === f.now.hour ? 2 : best.has(h.hour) ? 1 : 0,
                    borderColor: colors.text,
                  }}
                />
                <Text style={{ fontSize: 9, color: colors.muted, height: 12 }}>{h.hour % 3 === 0 ? h.hour : ''}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.text }}>
            {tr('Giờ tốt nhất:')} <Text style={{ fontWeight: '800' }}>{f.bestHours.map((b) => `${b.hour}h (${pct(b.probability)})`).join(', ')}</Text>
          </Text>
          <Text style={{ color: colors.text }}>
            {tr('Phiên phù hợp:')} <Text style={{ fontWeight: '800' }}>{tr('{0} phút', f.suggestedMinutes)}</Text> · {tr('Độ tin cậy:')} {pct(f.confidence)}
          </Text>
        </>
      )}
      {f.tips.map((t) => (
        <Muted key={t} style={{ fontSize: 12 }}>
          • {t}
        </Muted>
      ))}
    </Card>
  );
}
