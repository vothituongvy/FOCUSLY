import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { Icon } from './Icon';
import { colors } from '../theme';
import { tr } from '../i18n';
import { isEnglish, listen, similarity, speak, speechAvailable } from '../native';

/** Nút nghe đọc thành tiếng */
export function SpeakButton({ text, label }: { text: string; label?: string }) {
  if (!speechAvailable()) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={tr('Đọc thành tiếng')} onPress={() => void speak(text)} hitSlop={6} style={pill}>
      <Icon name="volume" size={16} color={colors.text} />
      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{label ?? tr('Nghe')}</Text>
    </Pressable>
  );
}

/** Luyện phát âm tiếng Anh: nói vào máy, chấm độ giống */
export function PronounceButton({ text }: { text: string }) {
  const [result, setResult] = useState<{ heard: string; score: number } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setResult(null);
    setErr('');
  }, [text]);
  if (!speechAvailable() || !isEnglish(text)) return null;
  const run = async () => {
    setErr('');
    try {
      const heard = await listen(tr('Đọc to: {0}', text));
      if (!heard?.length) return;
      const best = heard.map((h) => ({ heard: h, score: similarity(h, text) })).sort((a, b) => b.score - a.score)[0];
      setResult(best);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const pct = result ? Math.round(result.score * 100) : 0;
  const tone = pct >= 85 ? { bg: colors.successSoft, fg: colors.success } : pct >= 60 ? { bg: colors.markerSoft, fg: colors.warning } : { bg: colors.dangerSoft, fg: colors.danger };
  return (
    <View style={{ gap: 6, alignItems: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('Luyện phát âm')} onPress={run} hitSlop={6} style={pill}>
        <Icon name="mic" size={16} color={colors.text} />
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{tr('Luyện phát âm')}</Text>
      </Pressable>
      {result && (
        <Text style={{ backgroundColor: tone.bg, color: tone.fg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 12.5, textAlign: 'center' }}>
          {pct >= 85 ? tr('Chuẩn lắm!') : pct >= 60 ? tr('Gần đúng') : tr('Thử lại')} {pct}% · {tr('Nghe được: “{0}”', result.heard)}
        </Text>
      )}
      {!!err && <Text style={{ color: colors.danger, fontSize: 12 }}>{err}</Text>}
    </View>
  );
}

const pill = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface };
