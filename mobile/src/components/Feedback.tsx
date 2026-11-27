import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './AppText';
import { api } from '../api/client';
import { colors } from '../theme';
import { tr } from '../i18n';

/**
 * Nút 👍/👎 – FOCUSLY Brain học từ đánh giá này để lần sau tạo nội dung hợp ý bạn hơn.
 * kind: answer (câu trả lời trợ lý) · question (câu hỏi AI tạo) · card (flashcard AI tạo)
 */
export function Feedback({
  kind,
  origin,
  text,
  initial = 0,
  conversationId,
  index,
}: {
  kind: 'answer' | 'question' | 'card';
  origin?: string;
  text?: string;
  initial?: number;
  conversationId?: string;
  index?: number;
}) {
  const [vote, setVote] = useState(initial);
  const send = (v: 1 | -1) => {
    if (vote === v) return;
    setVote(v);
    api('/ai/feedback', { method: 'POST', body: { items: [{ kind, origin: origin || 'unknown', vote: v, text: (text ?? '').slice(0, 300) }], conversationId, index } }).catch(() => setVote(0));
  };
  const btn = (v: 1 | -1, label: string, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: vote === v }}
      hitSlop={6}
      onPress={() => send(v)}
      style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: vote === v ? (v === 1 ? colors.successSoft : colors.dangerSoft) : 'transparent', opacity: vote === v || vote === 0 ? 1 : 0.4 }}
    >
      <Text style={{ fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 }}>
      {btn(1, '👍', tr('Hữu ích'))}
      {btn(-1, '👎', tr('Chưa tốt'))}
      {vote !== 0 && <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>{tr('Cảm ơn! Brain sẽ học từ đánh giá này.')}</Text>}
    </View>
  );
}
