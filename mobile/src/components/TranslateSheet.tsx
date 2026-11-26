import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { api, ApiError, errorMessage } from '../api/client';
import { colors } from '../theme';
import { Icon } from './Icon';
import { tr } from '../i18n';

type Dir = 'auto' | 'vi' | 'en';
interface Result {
  from: 'vi' | 'en' | 'other';
  to: 'vi' | 'en';
  translation: string;
  phonetic?: string | null;
  partOfSpeech?: string | null;
  alternatives: string[];
  example?: { source: string; target: string } | null;
}

const DIRS: { id: Dir; label: string }[] = [
  { id: 'auto', label: tr('Tự nhận') },
  { id: 'vi', label: tr('Anh → Việt') },
  { id: 'en', label: tr('Việt → Anh') },
];
const LANG_NAME = { vi: tr('Tiếng Việt'), en: tr('Tiếng Anh'), other: tr('Ngôn ngữ khác') } as const;

/** Ô dịch Anh ⇄ Việt trong phiên học – không cần rời app (dùng được khi đang ghim màn hình). */
export function TranslateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [dir, setDir] = useState<Dir>('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [aiOff, setAiOff] = useState(false);

  const run = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try {
      setResult(await api<Result>('/ai/translate', { method: 'POST', body: { text: value, to: dir }, timeoutMs: 45000 }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'AI_DISABLED') setAiOff(true);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, maxHeight: '88%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="translate" size={18} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{tr('Dịch Anh ⇄ Việt')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={tr('Đóng ô dịch')}>
              <Icon name="x" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: colors.surface2, borderRadius: 10, alignSelf: 'flex-start' }}>
            {DIRS.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => setDir(d.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: dir === d.id }}
                style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: dir === d.id ? colors.surface : 'transparent' }}
              >
                <Text style={{ fontSize: 13, color: dir === d.id ? colors.text : colors.text2, fontWeight: dir === d.id ? '700' : '500' }}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tr('Gõ một từ hoặc dán câu cần dịch')}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={2000}
            style={{ minHeight: 80, maxHeight: 160, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, padding: 12, fontSize: 15, color: colors.text, textAlignVertical: 'top' }}
          />
          <Pressable
            onPress={() => void run()}
            disabled={busy || !text.trim()}
            style={{ backgroundColor: colors.text, opacity: busy || !text.trim() ? 0.5 : 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{tr('Dịch')}</Text>}
          </Pressable>

          <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {!!error && (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.danger }}>{aiOff ? tr('Ô dịch dùng trợ lý AI nhưng AI chưa được bật trên máy chủ.') : error}</Text>
                {!!text.trim() && (
                  <Pressable onPress={() => void Linking.openURL(`https://translate.google.com/?sl=auto&tl=${dir === 'en' ? 'en' : 'vi'}&text=${encodeURIComponent(text)}`)}>
                    <Text style={{ color: colors.text, textDecorationLine: 'underline' }}>{tr('Mở Google Dịch')}</Text>
                  </Pressable>
                )}
              </View>
            )}
            {result && !error && (
              <View style={{ gap: 6, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.border, paddingTop: 10 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {LANG_NAME[result.from]} → {LANG_NAME[result.to]}
                </Text>
                <Text selectable style={{ fontSize: 17, lineHeight: 25, color: colors.text, backgroundColor: colors.markerSoft, alignSelf: 'flex-start', paddingHorizontal: 4 }}>
                  {result.translation}
                </Text>
                {!!(result.phonetic || result.partOfSpeech) && (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>{[result.phonetic, result.partOfSpeech].filter(Boolean).join('  ·  ')}</Text>
                )}
                {result.alternatives.length > 0 && (
                  <Text style={{ fontSize: 13, color: colors.text }}>
                    {tr('Nghĩa khác:')}{' '}<Text style={{ color: colors.muted }}>{result.alternatives.join(', ')}</Text>
                  </Text>
                )}
                {result.example && (
                  <View style={{ borderLeftWidth: 3, borderLeftColor: colors.marker, paddingLeft: 10, gap: 2 }}>
                    <Text style={{ fontSize: 13, color: colors.text }}>{result.example.source}</Text>
                    <Text style={{ fontSize: 13, color: colors.muted }}>{result.example.target}</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
