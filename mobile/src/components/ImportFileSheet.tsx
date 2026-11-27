import React, { useState } from 'react';
import { ActivityIndicator, Modal, NativeModules, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { api, errorMessage } from '../api/client';
import { colors } from '../theme';
import type { Question } from '../types';
import { Button, Chip, H3, Muted, Row, s } from './ui';
import { Icon } from './Icon';
import { tr } from '../i18n';

/**
 * "Tạo từ file": chọn Word / Excel / PDF / TXT trên điện thoại rồi gửi lên máy chủ.
 * File đã soạn sẵn câu hỏi/thẻ -> nhập thẳng; file bài giảng -> AI soạn. Trả về bản nháp để xem lại trước khi lưu.
 * Native module: android/app/src/main/java/com/focuslymobile/FilePickerModule.kt
 */
type Picked = { uri: string; name: string; type: string; size: number };
type FilePickerNative = { pick: (mimeTypes: string[]) => Promise<Picked | null> };
const native: FilePickerNative | undefined = Platform.OS === 'android' ? (NativeModules.FilePicker as FilePickerNative | undefined) : undefined;

const MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'text/comma-separated-values',
  'text/markdown',
  'text/tab-separated-values',
  'application/octet-stream',
];

/** Mở trình chọn file của Android; trả về null nếu người dùng huỷ */
export async function pickFile(mimeTypes: string[] = MIME): Promise<Picked | null> {
  if (!native) throw new Error(tr('Bản app này chưa hỗ trợ chọn file. Hãy cập nhật app lên bản mới nhất.'));
  return native.pick(mimeTypes);
}
export type { Picked };

export type QuizDraftFromFile = { title: string; questions: Question[] };
export type CardsDraftFromFile = { title: string; cards: { front: string; back: string; hint?: string }[] };
type Mode = 'auto' | 'parse' | 'ai';

const SAMPLE = {
  quiz: 'Câu 1: Thủ đô của Việt Nam là?\nA. Hà Nội\nB. Huế\nĐáp án: A\n\nCâu 2: Số nào là số nguyên tố?\nA. 2\nB. 4\nC. 5\nĐáp án: A, C\n\nCâu 3: Trái Đất quay quanh Mặt Trời.\nĐáp án: Đúng',
  flashcards: 'apple - quả táo\nbook - quyển sách\nQuang hợp | Quá trình cây tạo chất hữu cơ từ ánh sáng',
};

export function ImportFileSheet<T extends 'quiz' | 'flashcards'>({
  visible,
  target,
  onClose,
  onDraft,
}: {
  visible: boolean;
  target: T;
  onClose: () => void;
  onDraft: (draft: T extends 'quiz' ? QuizDraftFromFile : CardsDraftFromFile, mode: 'parsed' | 'ai') => void;
}) {
  const [file, setFile] = useState<Picked | null>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState(false);
  const [source, setSource] = useState<'file' | 'paste'>('file');
  const [pasted, setPasted] = useState('');

  const pick = async () => {
    setError('');
    if (!native) return setError(tr('Bản app này chưa hỗ trợ chọn file. Hãy cập nhật app lên bản mới nhất.'));
    try {
      const f = await native.pick(target === 'flashcards' ? [...MIME, 'application/apkg', 'application/zip'] : MIME);
      if (f) setFile(f);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const run = async () => {
    if (source === 'file' ? !file : !pasted.trim()) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      if (source === 'file' && file) fd.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      else fd.append('text', pasted);
      fd.append('target', target);
      fd.append('mode', mode);
      const r = await api<{ mode: 'parsed' | 'ai'; draft: never }>('/ai/import', { method: 'POST', body: fd, timeoutMs: 120000 });
      onDraft(r.draft, r.mode);
      setFile(null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const modes: [Mode, string, string][] = [
    ['auto', tr('Tự nhận biết'), tr('File có sẵn câu hỏi/thẻ thì nhập thẳng; nếu là bài giảng thì AI soạn.')],
    ['parse', tr('Nhập file soạn sẵn'), tr('Chỉ đọc câu hỏi/thẻ có sẵn trong file, không dùng AI.')],
    ['ai', tr('AI tạo từ nội dung'), target === 'quiz' ? tr('AI đọc tài liệu và soạn khoảng 10 câu hỏi.') : tr('AI đọc tài liệu và soạn khoảng 15 thẻ.')],
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={busy ? undefined : onClose} />
      <View style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <H3>{target === 'quiz' ? tr('Tạo bộ câu hỏi từ file') : tr('Tạo bộ flashcard từ file')}</H3>
            <Pressable hitSlop={10} onPress={onClose} disabled={busy}>
              <Icon name="x" size={22} color={colors.text} />
            </Pressable>
          </Row>
          <Muted>
            {target === 'flashcards'
              ? tr('Hỗ trợ Word, Excel, PDF, TXT, CSV và bộ thẻ Anki (.apkg) – tối đa 15 MB. Từ Quizlet: chọn “Dán văn bản” rồi dán nội dung xuất ra. Bạn sẽ xem lại bản nháp trước khi lưu.')
              : tr('Hỗ trợ Word (.docx), Excel (.xlsx), PDF, TXT, CSV – tối đa 15 MB. Bạn sẽ xem lại bản nháp trước khi lưu.')}
          </Muted>
          <Row>
            <Chip label={tr('Chọn file')} active={source === 'file'} onPress={() => setSource('file')} />
            <Chip label={target === 'flashcards' ? tr('Dán văn bản (Quizlet…)') : tr('Dán văn bản')} active={source === 'paste'} onPress={() => setSource('paste')} />
          </Row>
          {source === 'paste' && (
            <View style={{ gap: 6 }}>
              <TextInput
                value={pasted}
                onChangeText={setPasted}
                multiline
                placeholder={target === 'flashcards' ? tr('Dán nội dung, mỗi dòng một thẻ…') : tr('Dán câu hỏi hoặc nội dung bài học…')}
                placeholderTextColor="#9aa2b6"
                style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]}
              />
              {target === 'flashcards' && <Muted style={{ fontSize: 12 }}>{tr('Quizlet: mở học phần → ⋯ → Xuất → giữ “Tab” giữa thuật ngữ và định nghĩa, “Dòng mới” giữa các thẻ → Sao chép văn bản rồi dán vào đây.')}</Muted>}
            </View>
          )}

          {source === 'file' && <Pressable
            onPress={pick}
            disabled={busy}
            style={{ alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 100, padding: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: file ? colors.text : colors.borderStrong, backgroundColor: file ? colors.markerSoft : colors.surface }}
          >
            <Icon name="upload" size={24} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>{file ? file.name : tr('Chọn file từ máy')}</Text>
            {file && <Muted style={{ fontSize: 12 }}>{tr('{0} KB · chạm để đổi file', Math.max(1, Math.round(file.size / 1024)))}</Muted>}
          </Pressable>}

          {modes.map(([v, l, d]) => {
            const on = mode === v;
            return (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setMode(v)}
                style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.text : colors.border, backgroundColor: on ? colors.markerSoft : colors.surface }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.text : colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text }} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{l}</Text>
                  <Muted style={{ fontSize: 12 }}>{d}</Muted>
                </View>
              </Pressable>
            );
          })}

          <Pressable onPress={() => setSample(!sample)}>
            <Text style={{ color: colors.text2, fontWeight: '600', textDecorationLine: 'underline' }}>{sample ? tr('Ẩn mẫu định dạng') : tr('Xem mẫu file soạn sẵn')}</Text>
          </Pressable>
          {sample && (
            <View style={{ gap: 6 }}>
              <View style={{ backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                <Text selectable style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{SAMPLE[target]}</Text>
              </View>
              <Muted style={{ fontSize: 12 }}>
                {target === 'quiz'
                  ? tr('Có thể đánh dấu đáp án đúng bằng dấu * trước lựa chọn. Excel: cột Câu hỏi | A | B | C | D | Đáp án | Giải thích.')
                  : tr('Mỗi dòng một thẻ. Bảng Word/Excel 2 cột (mặt trước | mặt sau) cũng được.')}
              </Muted>
            </View>
          )}

          {!!error && <Text style={s.error}>{error}</Text>}
          {busy && (
            <Row>
              <ActivityIndicator color={colors.text} />
              <Muted>{mode === 'parse' ? tr('Đang đọc file...') : tr('Đang xử lý... (AI có thể mất 20–40 giây)')}</Muted>
            </Row>
          )}
          <Button title={tr('Tạo bản nháp')} icon="upload" disabled={(source === 'file' ? !file : !pasted.trim()) || busy} onPress={run} />
        </ScrollView>
      </View>
    </Modal>
  );
}
