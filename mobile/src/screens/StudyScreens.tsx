import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { API_URL } from '../config';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { Card as FlashCard, Deck, MaterialNote, Question, Quiz } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, H3, Muted, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
import { ImportFileSheet, pickFile, type Picked } from '../components/ImportFileSheet';
import { LOCALE, tr } from '../i18n';

const plain = (t: string) => t.replace(/\*\*/g, '').replace(/^#+\s/gm, '').replace(/`/g, '');
const absUrl = (u: string) => (/^https?:\/\//.test(u) ? u : `${API_URL}${u.startsWith('/') ? '' : '/'}${u}`);

interface CardDraft {
  front: string;
  back: string;
  hint?: string;
}
interface QuizDraft {
  title: string;
  questions: Question[];
}

/** Tạo bộ thẻ từ bản nháp AI rồi trả về id bộ thẻ */
async function saveCardDraft(title: string, cards: CardDraft[], extra: { material?: string | null; subject?: string | null } = {}) {
  const r = await api<{ item: Deck }>('/decks', { method: 'POST', body: { title: title || tr('Bộ thẻ mới'), subject: extra.subject ?? null, material: extra.material ?? null } });
  for (const c of cards.filter((x) => x.front.trim() && x.back.trim())) {
    await api('/cards', { method: 'POST', body: { deck: r.item.id, front: c.front, back: c.back, hint: c.hint ?? '', source: 'ai' } });
  }
  return r.item.id;
}

async function saveQuizDraft(d: QuizDraft, material: string | null = null) {
  const r = await api<{ item: Quiz }>('/quizzes', {
    method: 'POST',
    body: { title: d.title || tr('Bộ câu hỏi'), material, subject: null, task: null, source: 'ai', questions: d.questions },
  });
  return r.item.id;
}

/* ======================= Tài liệu: chi tiết ======================= */
export function MaterialDetailScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'MaterialDetail'>) {
  const id = route.params.materialId;
  const { materials, subjects, update, remove, sync } = useData();
  const m = materials.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [showText, setShowText] = useState(false);
  const [notes, setNotes] = useState<MaterialNote[] | null>(null);
  const [note, setNote] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      setNotes((await api<{ items: MaterialNote[] }>(`/material-notes?material=${id}`)).items);
    } catch {
      setNotes([]);
    }
  }, [id]);

  useEffect(() => {
    void api(`/materials/${id}/open`, { method: 'POST', body: {} }).catch(() => undefined);
    void loadNotes();
  }, [id, loadNotes]);

  useEffect(() => {
    if (m) navigation.setOptions({ title: m.title });
  }, [m, navigation]);

  if (!m) return <Screen><Empty text={tr('Tài liệu không tồn tại')} /></Screen>;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const subject = subjects.find((x) => x.id === m.subject);

  return (
    <Screen>
      <Card>
        <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{m.title}</Text>
            <Muted>
              {[m.category, subject ? `${subject.icon} ${subject.name}` : '', m.type.toUpperCase()].filter(Boolean).join(' · ')}
            </Muted>
          </View>
          <Pressable hitSlop={10} accessibilityLabel={tr('Đánh dấu')} onPress={() => update('materials', m.id, { bookmarked: !m.bookmarked })}>
            <Text style={{ fontSize: 26, color: m.bookmarked ? '#e5a800' : colors.muted }}>{m.bookmarked ? '★' : '☆'}</Text>
          </Pressable>
        </Row>
        {!!m.description && <Text style={{ color: colors.text2 }}>{m.description}</Text>}
        <Row>
          {!!m.url && <Button title={m.type === 'link' ? tr('Mở link') : tr('Mở tài liệu')} small icon="link" onPress={() => void Linking.openURL(absUrl(m.url))} />}
          {m.hasText && <Button title={tr('Hỏi AI')} small variant="secondary" icon="ai" onPress={() => navigation.navigate('AIChat', { materialId: m.id })} />}
        </Row>
      </Card>

      {m.hasText && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H3>{tr('Nội dung')}</H3>
            <Button
              title={showText ? tr('Thu gọn') : tr('Xem nội dung')}
              small
              variant="ghost"
              onPress={async () => {
                if (!showText && !text) {
                  await run('text', async () => setText((await api<{ text: string }>(`/materials/${id}/text?limit=20000`)).text));
                }
                setShowText(!showText);
              }}
            />
          </Row>
          {busy === 'text' && <ActivityIndicator color={colors.text} />}
          {showText && <Text selectable style={{ color: colors.text, lineHeight: 21 }}>{text || tr('Không có nội dung văn bản.')}</Text>}
        </Card>
      )}

      <Card>
        <H3>{tr('Trợ lý AI cho tài liệu')}</H3>
        {!m.hasText ? (
          <Muted>{tr('AI cần nội dung văn bản. Tài liệu ảnh/link/PDF dạng scan chưa trích được chữ – bạn có thể thêm “Ghi chú văn bản” rồi dùng AI.')}</Muted>
        ) : (
          <>
            <Row>
              <Button
                title={busy === 'sum' ? tr('Đang tóm tắt...') : tr('Tóm tắt')}
                small
                disabled={!!busy}
                onPress={() =>
                  run('sum', async () => {
                    await api('/ai/summarize', { method: 'POST', body: { materialId: m.id }, timeoutMs: 90000 });
                    await sync();
                  })
                }
              />
              <Button
                title={busy === 'quiz' ? tr('Đang tạo...') : tr('Tạo 10 câu hỏi')}
                small
                variant="secondary"
                disabled={!!busy}
                onPress={() =>
                  run('quiz', async () => {
                    const r = await api<{ draft: QuizDraft }>('/ai/generate/quiz', { method: 'POST', body: { materialId: m.id, count: 10 }, timeoutMs: 90000 });
                    const qid = await saveQuizDraft(r.draft, m.id);
                    await sync();
                    navigation.navigate('QuizTake', { quizId: qid });
                  })
                }
              />
              <Button
                title={busy === 'cards' ? tr('Đang tạo...') : tr('Tạo flashcard')}
                small
                variant="secondary"
                disabled={!!busy}
                onPress={() =>
                  run('cards', async () => {
                    const r = await api<{ draft: { title: string; cards: CardDraft[] } }>('/ai/generate/flashcards', { method: 'POST', body: { materialId: m.id, count: 15 }, timeoutMs: 90000 });
                    const deckId = await saveCardDraft(r.draft.title, r.draft.cards, { material: m.id, subject: m.subject });
                    await sync();
                    navigation.navigate('DeckEdit', { deckId });
                  })
                }
              />
            </Row>
            {!!m.aiSummary && (
              <View style={{ backgroundColor: colors.markerSoft, borderRadius: 10, padding: 12, gap: 4 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{tr('Tóm tắt AI')}</Text>
                <Text selectable style={{ color: colors.text, lineHeight: 21 }}>{plain(m.aiSummary)}</Text>
              </View>
            )}
            <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field label={tr('Giải thích khái niệm')} value={concept} onChangeText={setConcept} placeholder={tr('VD: quang hợp')} />
              </View>
              <Button
                title={tr('Giải thích')}
                small
                disabled={!concept.trim() || !!busy}
                onPress={() =>
                  run('explain', async () => {
                    setExplanation((await api<{ explanation: string }>('/ai/explain', { method: 'POST', body: { concept, materialId: m.id }, timeoutMs: 90000 })).explanation);
                  })
                }
              />
            </Row>
            {busy === 'explain' && <ActivityIndicator color={colors.text} />}
            {!!explanation && <Text selectable style={{ color: colors.text, lineHeight: 21 }}>{plain(explanation)}</Text>}
          </>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
      </Card>

      <Card>
        <H3>{tr('Ghi chú ({0})', notes?.length ?? 0)}</H3>
        <Field label={tr('Ghi chú mới')} value={note} onChangeText={setNote} multiline placeholder={tr('Điều bạn rút ra từ tài liệu này...')} />
        <Button
          title={tr('Lưu ghi chú')}
          small
          disabled={!note.trim()}
          onPress={() =>
            run('note', async () => {
              await api('/material-notes', { method: 'POST', body: { material: id, kind: 'note', content: note, page: null } });
              setNote('');
              await loadNotes();
            })
          }
        />
        {notes === null && <ActivityIndicator color={colors.text} />}
        {notes?.map((n) => (
          <Row key={n.id} style={{ flexWrap: 'nowrap', alignItems: 'flex-start', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1, gap: 2 }}>
              {!!n.quote && <Text style={{ color: colors.text2, fontStyle: 'italic' }}>“{n.quote}”</Text>}
              {!!n.content && <Text style={{ color: colors.text }}>{n.content}</Text>}
              <Muted style={{ fontSize: 11 }}>
                {n.page ? tr('Trang {0} · ', n.page) : ''}
                {new Date(n.createdAt).toLocaleDateString(LOCALE)}
              </Muted>
            </View>
            <Pressable
              hitSlop={8}
              accessibilityLabel={tr('Xoá')}
              onPress={async () => {
                await api(`/material-notes/${n.id}`, { method: 'DELETE' }).catch(() => undefined);
                void loadNotes();
              }}
            >
              <Icon name="trash" size={18} color={colors.muted} />
            </Pressable>
          </Row>
        ))}
      </Card>

      <Button
        title={tr('Xoá tài liệu')}
        variant="danger"
        onPress={() =>
          Alert.alert(tr('Xoá tài liệu?'), m.title, [
            { text: tr('Huỷ'), style: 'cancel' },
            {
              text: tr('Xoá'),
              style: 'destructive',
              onPress: async () => {
                await remove('materials', m.id);
                navigation.goBack();
              },
            },
          ])
        }
      />
    </Screen>
  );
}

/* ======================= Tài liệu: thêm link / ghi chú văn bản ======================= */
export function MaterialAddScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'MaterialAdd'>) {
  const { subjects, sync } = useData();
  const [kind, setKind] = useState<'link' | 'text' | 'file'>(route.params?.kind ?? 'link');
  const [file, setFile] = useState<Picked | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (kind === 'file') {
        if (!file) throw new Error(tr('Chọn file'));
        const fd = new FormData();
        fd.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
        if (title.trim()) fd.append('title', title.trim());
        if (subject) fd.append('subject', subject);
        if (category) fd.append('category', category);
        await api('/materials/upload', { method: 'POST', body: fd, timeoutMs: 120000 });
      } else {
        await api('/materials', {
          method: 'POST',
          body: { title, subject, category: category || undefined, type: kind, ...(kind === 'link' ? { url: /^https?:\/\//.test(url) ? url : `https://${url}` } : { textContent: body }) },
        });
      }
      await sync();
      navigation.goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Chips>
          <Chip label={tr('Link')} active={kind === 'link'} onPress={() => setKind('link')} />
          <Chip label={tr('Ghi chú văn bản')} active={kind === 'text'} onPress={() => setKind('text')} />
          <Chip label={tr('Tải file lên')} active={kind === 'file'} onPress={() => setKind('file')} />
        </Chips>
        <Field label={kind === 'file' ? tr('Tiêu đề (để trống thì dùng tên file)') : tr('Tiêu đề')} value={title} onChangeText={setTitle} />
        {kind === 'file' ? (
          <Pressable
            onPress={async () => {
              setError('');
              try {
                const f = await pickFile(['application/pdf', 'image/*', 'text/*', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
                if (f) setFile(f);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
            style={{ alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 90, padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: file ? colors.text : colors.borderStrong, backgroundColor: file ? colors.markerSoft : colors.surface }}
          >
            <Icon name="upload" size={22} color={colors.text} />
            <Text style={{ fontWeight: '700', color: colors.text, textAlign: 'center' }}>{file ? file.name : tr('Chọn PDF, Word, Excel, ảnh hoặc TXT')}</Text>
          </Pressable>
        ) : kind === 'link' ? (
          <Field label="URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." />
        ) : (
          <Field label={tr('Nội dung')} value={body} onChangeText={setBody} multiline placeholder={tr('Dán hoặc gõ nội dung. AI có thể tóm tắt và tạo câu hỏi từ phần này.')} />
        )}
        <Field label={tr('Danh mục')} value={category} onChangeText={setCategory} placeholder={tr('VD: Bài giảng')} />
        {subjects.length > 0 && (
          <>
            <Muted>{tr('Môn học')}</Muted>
            <Chips>
              <Chip label={tr('Không')} active={!subject} onPress={() => setSubject(null)} />
              {subjects.map((x) => (
                <Chip key={x.id} label={`${x.icon} ${x.name}`} active={subject === x.id} onPress={() => setSubject(x.id)} />
              ))}
            </Chips>
          </>
        )}
        {kind === 'file' && <Muted style={{ fontSize: 12 }}>{tr('Tối đa 20 MB. Chữ trong PDF, Word, Excel được đọc để AI tóm tắt và tạo câu hỏi.')}</Muted>}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={kind === 'file' ? tr('Tải lên') : tr('Lưu')} loading={busy} disabled={kind === 'file' ? !file : !title.trim() || (kind === 'link' ? !url.trim() : !body.trim())} onPress={save} />
      </Card>
    </Screen>
  );
}

/* ======================= Bộ flashcard: tạo / sửa ======================= */
export function DeckEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'DeckEdit'>) {
  const { decks, cards, subjects, create, update, remove, sync } = useData();
  const [deckId, setDeckId] = useState<string | undefined>(route.params?.deckId);
  const deck = decks.find((d) => d.id === deckId);
  const list = cards.filter((c) => c.deck === deckId);
  const [title, setTitle] = useState(deck?.title ?? '');
  const [subject, setSubject] = useState<string | null>(deck?.subject ?? null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editing, setEditing] = useState<FlashCard | null>(null);
  const [topic, setTopic] = useState('');
  const [drafts, setDrafts] = useState<(CardDraft & { keep: boolean })[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(Boolean(route.params?.fromFile));
  const [importNote, setImportNote] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: deck ? deck.title : tr('Bộ thẻ mới') });
  }, [deck, navigation]);

  const ensureDeck = async () => {
    if (deckId) return deckId;
    const d = await create<Deck>('decks', { title: title.trim() || tr('Bộ thẻ mới'), subject, material: null, description: '', color: '#ffcf2e' });
    setDeckId(d.id);
    return d.id;
  };

  const saveCard = async () => {
    if (!front.trim() || !back.trim()) return;
    if (editing) {
      await update('cards', editing.id, { front, back });
      setEditing(null);
    } else {
      const id = await ensureDeck();
      await create('cards', { deck: id, front, back, hint: '', tags: [], source: 'manual', suspended: false });
    }
    setFront('');
    setBack('');
  };

  const generate = async () => {
    setBusy('ai');
    setError('');
    try {
      const r = await api<{ draft: { title: string; cards: CardDraft[] } }>('/ai/generate/flashcards', { method: 'POST', body: { topic, count: 15 }, timeoutMs: 90000 });
      if (!title) setTitle(r.draft.title);
      setDrafts((cur) => [...cur, ...r.draft.cards.map((c) => ({ ...c, keep: true }))]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const saveDrafts = async () => {
    setBusy('save');
    setError('');
    try {
      const keep = drafts.filter((d) => d.keep);
      if (deckId) {
        for (const c of keep) await create('cards', { deck: deckId, front: c.front, back: c.back, hint: c.hint ?? '', tags: [], source: 'ai', suspended: false });
      } else {
        const id = await saveCardDraft(title, keep, { subject });
        await sync();
        setDeckId(id);
      }
      setDrafts([]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen>
      <Card>
        <Field label={tr('Tên bộ thẻ')} value={title} onChangeText={setTitle} placeholder={tr('VD: Từ vựng Unit 5')} onEndEditing={() => deckId && title.trim() && update('decks', deckId, { title: title.trim() })} />
        {subjects.length > 0 && (
          <Chips>
            <Chip label={tr('Không môn')} active={!subject} onPress={() => { setSubject(null); if (deckId) void update('decks', deckId, { subject: null }); }} />
            {subjects.map((x) => (
              <Chip key={x.id} label={`${x.icon} ${x.name}`} active={subject === x.id} onPress={() => { setSubject(x.id); if (deckId) void update('decks', deckId, { subject: x.id }); }} />
            ))}
          </Chips>
        )}
        {!deckId && <Button title={tr('Tạo bộ thẻ')} disabled={!title.trim()} onPress={() => void ensureDeck()} />}
        {!!deckId && list.length > 0 && <Button title={tr('Ôn bộ thẻ này')} icon="cards" variant="marker" onPress={() => navigation.navigate('Review', { deckId })} />}
      </Card>

      <Card>
        <H3>{tr('Tạo từ file')}</H3>
        <Muted>{tr('Word, Excel, PDF hoặc TXT: file có sẵn danh sách thẻ thì nhập thẳng, file bài giảng thì AI soạn thẻ.')}</Muted>
        <Button title={tr('Chọn file')} icon="upload" variant="secondary" onPress={() => setImportOpen(true)} />
        {!!importNote && <Text style={{ color: colors.success }}>{importNote}</Text>}
      </Card>

      <Card>
        <H3>{tr('Tạo thẻ bằng AI')}</H3>
        <Field label={tr('Chủ đề')} value={topic} onChangeText={setTopic} placeholder={tr('Chủ đề để AI tạo thẻ, vd: Từ vựng chủ đề Môi trường')} />
        <Button title={busy === 'ai' ? tr('Đang tạo...') : tr('Tạo bằng AI')} variant="secondary" icon="ai" disabled={!topic.trim() || !!busy} onPress={generate} />
        {drafts.length > 0 && (
          <>
            <Muted>{tr('Bản nháp từ AI ({0}/{1} được chọn)', drafts.filter((d) => d.keep).length, drafts.length)}</Muted>
            {drafts.map((d, i) => (
              <Pressable key={i} onPress={() => setDrafts(drafts.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, opacity: d.keep ? 1 : 0.45 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: d.keep ? colors.text : colors.borderStrong, backgroundColor: d.keep ? colors.marker : colors.surface, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                  {d.keep && <Icon name="check" size={13} color={colors.text} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{d.front}</Text>
                  <Muted>{d.back}</Muted>
                </View>
              </Pressable>
            ))}
            <Button title={tr('Lưu các thẻ đã chọn')} loading={busy === 'save'} disabled={!drafts.some((d) => d.keep)} onPress={saveDrafts} />
          </>
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
      </Card>

      <Card>
        <H3>{editing ? tr('Sửa thẻ') : tr('Thêm thẻ')}</H3>
        <Field label={tr('Mặt trước')} value={front} onChangeText={setFront} multiline />
        <Field label={tr('Mặt sau')} value={back} onChangeText={setBack} multiline />
        <Row>
          <Button title={editing ? tr('Lưu thẻ') : tr('Thêm thẻ')} small disabled={!front.trim() || !back.trim()} onPress={() => void saveCard()} />
          {editing && <Button title={tr('Huỷ')} small variant="ghost" onPress={() => { setEditing(null); setFront(''); setBack(''); }} />}
        </Row>
      </Card>

      <H3>{tr('{0} thẻ', list.length)}</H3>
      {list.length === 0 && <Empty text={tr('Chưa có thẻ nào.')} />}
      {list.map((c) => (
        <Card key={c.id} style={{ gap: 4 }}>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{c.front}</Text>
              <Muted>{c.back}</Muted>
            </View>
            <Pressable hitSlop={8} accessibilityLabel={tr('Sửa')} onPress={() => { setEditing(c); setFront(c.front); setBack(c.back); }} style={{ padding: 4 }}>
              <Icon name="edit" size={18} color={colors.text2} />
            </Pressable>
            <Pressable hitSlop={8} accessibilityLabel={tr('Xoá')} onPress={() => void remove('cards', c.id)} style={{ padding: 4 }}>
              <Icon name="trash" size={18} color={colors.muted} />
            </Pressable>
          </Row>
        </Card>
      ))}

      {!!deckId && (
        <Button
          title={tr('Xoá bộ thẻ')}
          variant="danger"
          onPress={() =>
            Alert.alert(tr('Xoá bộ thẻ?'), tr('Toàn bộ {0} thẻ trong bộ cũng bị xoá.', list.length), [
              { text: tr('Huỷ'), style: 'cancel' },
              {
                text: tr('Xoá'),
                style: 'destructive',
                onPress: async () => {
                  for (const c of list) await remove('cards', c.id);
                  await remove('decks', deckId);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      )}
      <ImportFileSheet
        visible={importOpen}
        target="flashcards"
        onClose={() => setImportOpen(false)}
        onDraft={(d, mode) => {
          if (!title.trim()) setTitle(d.title);
          setDrafts((cur) => [...cur, ...d.cards.map((c) => ({ ...c, keep: true }))]);
          setImportNote(mode === 'parsed' ? tr('Đã đọc {0} thẻ từ file – kiểm tra bên dưới rồi bấm Lưu.', d.cards.length) : tr('AI đã soạn {0} thẻ từ file – kiểm tra rồi bấm Lưu.', d.cards.length));
        }}
      />
    </Screen>
  );
}

/* ======================= Bộ câu hỏi: tự soạn + tạo bằng AI ======================= */
type QType = 'mcq' | 'multi' | 'true_false' | 'short';
const QTYPES: { id: QType; label: string }[] = [
  { id: 'mcq', label: tr('Trắc nghiệm') },
  { id: 'multi', label: tr('Nhiều đáp án đúng') },
  { id: 'true_false', label: tr('Đúng / Sai') },
  { id: 'short', label: tr('Trả lời ngắn') },
];
const emptyQ = (type: QType = 'mcq'): Question => ({ type, prompt: '', options: ['', '', '', ''], correctIndex: 0, correctIndexes: [], correctBoolean: true, acceptedAnswers: [], explanation: '' });

/** Kiểm tra một câu hỏi đã đủ thông tin chưa; trả về lời nhắc nếu thiếu */
function checkQuestion(q: Question): string {
  if (!q.prompt.trim()) return tr('Nhập nội dung câu hỏi.');
  if (q.type === 'mcq') {
    const filled = q.options.filter((o) => o.trim());
    if (filled.length < 2) return tr('Cần ít nhất 2 lựa chọn.');
    if (q.correctIndex == null || !q.options[q.correctIndex]?.trim()) return tr('Chạm vào một lựa chọn để đánh dấu đáp án đúng.');
  }
  if (q.type === 'multi') {
    if (q.options.filter((o) => o.trim()).length < 2) return tr('Cần ít nhất 2 lựa chọn.');
    if (!(q.correctIndexes ?? []).some((i) => q.options[i]?.trim())) return tr('Đánh dấu ít nhất 1 đáp án đúng.');
  }
  if (q.type === 'short' && !q.acceptedAnswers.some((a) => a.trim())) return tr('Nhập ít nhất một đáp án được chấp nhận.');
  return '';
}

/** Chuẩn hoá trước khi gửi lên máy chủ: bỏ lựa chọn trống và giữ đúng chỉ số đáp án */
function cleanQuestion(q: Question): Question {
  if (q.type === 'mcq' || q.type === 'multi') {
    const kept = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
    const at = (i: number) => kept.findIndex((x) => x.i === i);
    return q.type === 'mcq'
      ? { ...q, options: kept.map((x) => x.o), correctIndex: Math.max(0, at(q.correctIndex ?? 0)), correctIndexes: [], acceptedAnswers: [], correctBoolean: null }
      : { ...q, options: kept.map((x) => x.o), correctIndexes: (q.correctIndexes ?? []).map(at).filter((i) => i >= 0).sort((a, b) => a - b), correctIndex: null, acceptedAnswers: [], correctBoolean: null };
  }
  if (q.type === 'true_false') return { ...q, options: [], acceptedAnswers: [], correctIndex: null };
  return { ...q, options: [], correctIndex: null, correctBoolean: null, acceptedAnswers: q.acceptedAnswers.map((a) => a.trim()).filter(Boolean) };
}

function QuestionForm({ initial, onSubmit, onCancel }: { initial: Question; onSubmit: (q: Question) => void; onCancel?: () => void }) {
  const [q, setQ] = useState<Question>(initial);
  const [answersText, setAnswersText] = useState(initial.acceptedAnswers.join(', '));
  const [hint, setHint] = useState('');
  useEffect(() => {
    setQ(initial);
    setAnswersText(initial.acceptedAnswers.join(', '));
    setHint('');
  }, [initial]);
  const submit = () => {
    const full = { ...q, acceptedAnswers: q.type === 'short' ? answersText.split(',') : q.acceptedAnswers };
    const problem = checkQuestion(full);
    if (problem) return setHint(problem);
    onSubmit(cleanQuestion(full));
  };
  return (
    <View style={{ gap: 10 }}>
      <Chips>
        {QTYPES.map((t) => (
          <Chip key={t.id} label={t.label} active={q.type === t.id} onPress={() => setQ({ ...emptyQ(t.id), prompt: q.prompt, explanation: q.explanation })} />
        ))}
      </Chips>
      <Field label={tr('Câu hỏi')} value={q.prompt} onChangeText={(v) => setQ({ ...q, prompt: v })} multiline placeholder={tr('VD: 2 + 3 bằng bao nhiêu?')} />

      {(q.type === 'mcq' || q.type === 'multi') && (
        <View style={{ gap: 8 }}>
          <Muted style={{ fontSize: 12 }}>{q.type === 'mcq' ? tr('Chạm vào vòng tròn để chọn đáp án đúng.') : tr('Chạm vào ô vuông để đánh dấu TẤT CẢ đáp án đúng.')}</Muted>
          {q.options.map((o, i) => {
            const multi = q.type === 'multi';
            const right = multi ? (q.correctIndexes ?? []).includes(i) : q.correctIndex === i;
            return (
              <Row key={i} style={{ flexWrap: 'nowrap' }}>
                <Pressable
                  hitSlop={8}
                  accessibilityRole={multi ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: right }}
                  accessibilityLabel={tr('Đáp án đúng')}
                  onPress={() =>
                    multi
                      ? setQ({ ...q, correctIndexes: right ? (q.correctIndexes ?? []).filter((x) => x !== i) : [...(q.correctIndexes ?? []), i] })
                      : setQ({ ...q, correctIndex: i })
                  }
                  style={{ width: 28, height: 28, borderRadius: multi ? 7 : 14, borderWidth: 2, borderColor: right ? colors.success : colors.borderStrong, backgroundColor: right ? colors.success : colors.surface, alignItems: 'center', justifyContent: 'center' }}
                >
                  {right && <Icon name="check" size={15} color="#ffffff" />}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[s.input, right && { borderColor: colors.success }]}
                    value={o}
                    onChangeText={(v) => setQ({ ...q, options: q.options.map((x, j) => (j === i ? v : x)) })}
                    placeholder={tr('Lựa chọn {0}', String.fromCharCode(65 + i))}
                    placeholderTextColor="#9aa2b6"
                  />
                </View>
                {q.options.length > 2 && (
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel={tr('Xoá')}
                    onPress={() => {
                      const options = q.options.filter((_, j) => j !== i);
                      const ci = q.correctIndex ?? 0;
                      const shift = (x: number) => (x > i ? x - 1 : x);
                      setQ({ ...q, options, correctIndex: ci === i ? 0 : shift(ci), correctIndexes: (q.correctIndexes ?? []).filter((x) => x !== i).map(shift) });
                    }}
                  >
                    <Icon name="x" size={18} color={colors.muted} />
                  </Pressable>
                )}
              </Row>
            );
          })}
          {q.options.length < 6 && <Button title={tr('+ Thêm lựa chọn')} small variant="ghost" onPress={() => setQ({ ...q, options: [...q.options, ''] })} />}
        </View>
      )}

      {q.type === 'true_false' && (
        <Row>
          <Muted>{tr('Đáp án đúng:')}</Muted>
          <Chip label={tr('Đúng')} active={q.correctBoolean === true} onPress={() => setQ({ ...q, correctBoolean: true })} />
          <Chip label={tr('Sai')} active={q.correctBoolean === false} onPress={() => setQ({ ...q, correctBoolean: false })} />
        </Row>
      )}

      {q.type === 'short' && (
        <Field label={tr('Đáp án được chấp nhận (cách nhau bằng dấu phẩy)')} value={answersText} onChangeText={setAnswersText} placeholder={tr('VD: 5, năm')} />
      )}

      <Field label={tr('Giải thích (không bắt buộc)')} value={q.explanation ?? ''} onChangeText={(v) => setQ({ ...q, explanation: v })} multiline />
      {!!hint && <Text style={s.error}>{hint}</Text>}
      <Row>
        <Button title={onCancel ? tr('Lưu câu hỏi') : tr('Thêm câu hỏi')} small icon={onCancel ? 'check' : 'plus'} onPress={submit} />
        {onCancel && <Button title={tr('Huỷ')} small variant="ghost" onPress={onCancel} />}
      </Row>
    </View>
  );
}

export function QuizEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'QuizEdit'>) {
  const { quizzes, remove, sync } = useData();
  const quiz = quizzes.find((q) => q.id === route.params?.quizId);
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [questions, setQuestions] = useState<Question[]>(quiz?.questions ?? []);
  const [dirty, setDirty] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [blank, setBlank] = useState<Question>(emptyQ());
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState<'manual' | 'ai'>(quiz?.source ?? 'manual');
  const [importOpen, setImportOpen] = useState(Boolean(route.params?.fromFile));
  const [importNote, setImportNote] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: quiz ? quiz.title : tr('Bộ câu hỏi mới') });
  }, [quiz, navigation]);

  const change = (next: Question[]) => {
    setQuestions(next);
    setDirty(true);
  };

  const generate = async () => {
    setBusy('ai');
    setError('');
    try {
      const r = await api<{ draft: QuizDraft }>('/ai/generate/quiz', { method: 'POST', body: { topic: topic.trim() || title.trim(), count: 8 }, timeoutMs: 90000 });
      if (!title.trim()) setTitle(r.draft.title);
      setSource('ai');
      change([...questions, ...r.draft.questions]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const save = async (thenTake = false) => {
    if (!questions.length) return setError(tr('Thêm ít nhất 1 câu hỏi trước khi lưu.'));
    setBusy('save');
    setError('');
    try {
      const body = { title: title.trim() || tr('Bộ câu hỏi'), source, questions };
      let id = quiz?.id;
      if (id) await api(`/quizzes/${id}`, { method: 'PATCH', body });
      else id = (await api<{ item: Quiz }>('/quizzes', { method: 'POST', body: { ...body, subject: null, material: null, task: null } })).item.id;
      await sync();
      setDirty(false);
      if (thenTake) navigation.replace('QuizTake', { quizId: id });
      else if (!quiz) navigation.replace('QuizEdit', { quizId: id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen>
      <Card>
        <Field label={tr('Tên bộ câu hỏi')} value={title} onChangeText={(v) => { setTitle(v); setDirty(true); }} placeholder={tr('VD: Ôn tập chương 3')} />
        {quiz && !dirty && questions.length > 0 && <Button title={tr('Làm bài')} icon="play" variant="marker" onPress={() => navigation.navigate('QuizTake', { quizId: quiz.id })} />}
      </Card>

      <Card>
        <H3>{tr('Tự soạn câu hỏi')}</H3>
        <QuestionForm
          initial={blank}
          onSubmit={(q) => {
            change([...questions, q]);
            setBlank(emptyQ(q.type));
          }}
        />
      </Card>

      <Card>
        <H3>{tr('Tạo từ file')}</H3>
        <Muted>{tr('Word, Excel, PDF hoặc TXT: đề có sẵn (Câu 1, A. B. C., Đáp án) thì nhập thẳng, tài liệu học thì AI soạn câu hỏi.')}</Muted>
        <Button title={tr('Chọn file')} icon="upload" variant="secondary" onPress={() => setImportOpen(true)} />
        {!!importNote && <Text style={{ color: colors.success }}>{importNote}</Text>}
      </Card>

      <Card>
        <H3>{tr('Tạo câu hỏi bằng AI')}</H3>
        <Field label={tr('Chủ đề')} value={topic} onChangeText={setTopic} placeholder={tr('VD: Phương trình bậc hai')} />
        <Button
          title={busy === 'ai' ? tr('Đang tạo...') : tr('Tạo 8 câu bằng AI')}
          variant="secondary"
          icon="ai"
          disabled={!(topic.trim() || title.trim()) || !!busy}
          onPress={generate}
        />
        {!topic.trim() && !!title.trim() && <Muted style={{ fontSize: 12 }}>{tr('Để trống chủ đề thì AI dùng tên bộ câu hỏi.')}</Muted>}
      </Card>

      <Row style={{ justifyContent: 'space-between' }}>
        <H3>{tr('{0} câu', questions.length)}</H3>
        {dirty && <Muted style={{ color: colors.warning }}>{tr('Chưa lưu')}</Muted>}
      </Row>
      {questions.length === 0 && <Empty text={tr('Chưa có câu hỏi. Tự soạn ở trên hoặc nhờ AI tạo.')} />}
      {questions.map((q, i) =>
        editIndex === i ? (
          <Card key={q.qid ?? `n${i}`}>
            <QuestionForm
              initial={{ ...emptyQ(q.type), ...q, options: q.type === 'mcq' || q.type === 'multi' ? q.options : ['', '', '', ''] }}
              onSubmit={(nq) => {
                change(questions.map((x, j) => (j === i ? { ...nq, qid: x.qid } : x)));
                setEditIndex(null);
              }}
              onCancel={() => setEditIndex(null)}
            />
          </Card>
        ) : (
          <Card key={q.qid ?? `n${i}`} style={{ gap: 4 }}>
            <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>
                {i + 1}. {q.prompt}
              </Text>
              <Pressable hitSlop={8} accessibilityLabel={tr('Sửa')} onPress={() => setEditIndex(i)} style={{ padding: 4 }}>
                <Icon name="edit" size={18} color={colors.text2} />
              </Pressable>
              <Pressable hitSlop={8} accessibilityLabel={tr('Xoá')} onPress={() => change(questions.filter((_, j) => j !== i))} style={{ padding: 4 }}>
                <Icon name="trash" size={18} color={colors.muted} />
              </Pressable>
            </Row>
            {q.type === 'mcq' && q.options.map((o, j) => <Muted key={j}>{j === q.correctIndex ? '✓ ' : '• '}{o}</Muted>)}
            {q.type === 'multi' && q.options.map((o, j) => <Muted key={j}>{(q.correctIndexes ?? []).includes(j) ? '✓ ' : '• '}{o}</Muted>)}
            {q.type === 'true_false' && <Muted>{q.correctBoolean ? tr('Đáp án: Đúng') : tr('Đáp án: Sai')}</Muted>}
            {q.type === 'short' && <Muted>{tr('Đáp án: {0}', q.acceptedAnswers.join(' / '))}</Muted>}
          </Card>
        ),
      )}

      {!!error && <Text style={s.error}>{error}</Text>}
      {(dirty || !quiz) && (
        <>
          <Button title={tr('Lưu bộ câu hỏi')} loading={busy === 'save'} disabled={!questions.length || !!busy} onPress={() => void save(false)} />
          <Button title={tr('Lưu và làm bài')} variant="secondary" disabled={!questions.length || !!busy} onPress={() => void save(true)} />
        </>
      )}

      {quiz && (
        <Button
          title={tr('Xoá bộ câu hỏi')}
          variant="danger"
          onPress={() =>
            Alert.alert(tr('Xoá bộ câu hỏi?'), quiz.title, [
              { text: tr('Huỷ'), style: 'cancel' },
              {
                text: tr('Xoá'),
                style: 'destructive',
                onPress: async () => {
                  await remove('quizzes', quiz.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      )}
      <ImportFileSheet
        visible={importOpen}
        target="quiz"
        onClose={() => setImportOpen(false)}
        onDraft={(d, mode) => {
          if (!title.trim()) setTitle(d.title);
          if (mode === 'ai') setSource('ai');
          change([...questions, ...d.questions]);
          setImportNote(mode === 'parsed' ? tr('Đã đọc {0} câu từ file – kiểm tra rồi bấm Lưu bộ câu hỏi.', d.questions.length) : tr('AI đã soạn {0} câu từ file – kiểm tra rồi bấm Lưu bộ câu hỏi.', d.questions.length));
        }}
      />
    </Screen>
  );
}
