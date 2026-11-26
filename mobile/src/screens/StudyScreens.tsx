import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import { Text } from '../components/AppText';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { API_URL } from '../config';
import { useData } from '../store/data';
import { colors } from '../theme';
import type { Card as FlashCard, Deck, MaterialNote, Question, Quiz } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card, Chip, Chips, Empty, Field, H3, Muted, Row, Screen, s } from '../components/ui';
import { Icon } from '../components/Icon';
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
  const [kind, setKind] = useState<'link' | 'text'>(route.params?.kind ?? 'link');
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
      await api('/materials', {
        method: 'POST',
        body: { title, subject, category: category || undefined, type: kind, ...(kind === 'link' ? { url: /^https?:\/\//.test(url) ? url : `https://${url}` } : { textContent: body }) },
      });
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
        </Chips>
        <Field label={tr('Tiêu đề')} value={title} onChangeText={setTitle} />
        {kind === 'link' ? (
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
        <Muted style={{ fontSize: 12 }}>{tr('Tải file PDF, ảnh, Word lên từ trang web FOCUSLY.')}</Muted>
        {!!error && <Text style={s.error}>{error}</Text>}
        <Button title={tr('Lưu')} loading={busy} disabled={!title.trim() || (kind === 'link' ? !url.trim() : !body.trim())} onPress={save} />
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
    </Screen>
  );
}

/* ======================= Bộ câu hỏi: tạo bằng AI / quản lý ======================= */
export function QuizEditScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'QuizEdit'>) {
  const { quizzes, update, remove, sync } = useData();
  const quiz = quizzes.find((q) => q.id === route.params?.quizId);
  const [title, setTitle] = useState(quiz?.title ?? '');
  const [topic, setTopic] = useState('');
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: quiz ? quiz.title : tr('Bộ câu hỏi mới') });
  }, [quiz, navigation]);

  const generate = async () => {
    setBusy('ai');
    setError('');
    try {
      const r = await api<{ draft: QuizDraft }>('/ai/generate/quiz', { method: 'POST', body: { topic, count: 8 }, timeoutMs: 90000 });
      setDraft((d) => ({ title: d?.title || r.draft.title, questions: [...(d?.questions ?? []), ...r.draft.questions] }));
      if (!title) setTitle(r.draft.title);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    setError('');
    try {
      if (quiz) {
        await api(`/quizzes/${quiz.id}`, { method: 'PATCH', body: { title: title || quiz.title, questions: [...quiz.questions, ...draft.questions].map(({ qid, ...q }) => (qid ? { qid, ...q } : q)) } });
        await sync();
        setDraft(null);
      } else {
        const id = await saveQuizDraft({ title: title || draft.title, questions: draft.questions });
        await sync();
        navigation.replace('QuizTake', { quizId: id });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const questions = [...(quiz?.questions ?? []), ...(draft?.questions ?? [])];

  return (
    <Screen>
      <Card>
        <Field label={tr('Tên bộ câu hỏi')} value={title} onChangeText={setTitle} onEndEditing={() => quiz && title.trim() && update('quizzes', quiz.id, { title: title.trim() })} />
        {quiz && <Button title={tr('Làm bài')} icon="play" variant="marker" onPress={() => navigation.navigate('QuizTake', { quizId: quiz.id })} />}
      </Card>
      <Card>
        <H3>{tr('Tạo câu hỏi bằng AI')}</H3>
        <Field label={tr('Chủ đề')} value={topic} onChangeText={setTopic} placeholder={tr('VD: Phương trình bậc hai')} />
        <Button title={busy === 'ai' ? tr('Đang tạo...') : tr('Tạo 8 câu bằng AI')} variant="secondary" icon="ai" disabled={!topic.trim() || !!busy} onPress={generate} />
        {draft && <Button title={tr('Lưu {0} câu mới', draft.questions.length)} loading={busy === 'save'} onPress={save} />}
        {!!error && <Text style={s.error}>{error}</Text>}
        <Muted style={{ fontSize: 12 }}>{tr('Soạn câu hỏi thủ công chi tiết trên trang web.')}</Muted>
      </Card>
      <H3>{tr('{0} câu', questions.length)}</H3>
      {questions.length === 0 && <Empty text={tr('Chưa có câu hỏi.')} />}
      {questions.map((q, i) => (
        <Card key={q.qid ?? `d${i}`} style={{ gap: 4 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>
            {i + 1}. {q.prompt}
          </Text>
          {q.type === 'mcq' && q.options.map((o, j) => <Muted key={j}>{j === q.correctIndex ? '✓ ' : '• '}{o}</Muted>)}
          {q.type === 'true_false' && <Muted>{q.correctBoolean ? tr('Đáp án: Đúng') : tr('Đáp án: Sai')}</Muted>}
          {q.type === 'short' && <Muted>{tr('Đáp án: {0}', q.acceptedAnswers.join(' / '))}</Muted>}
          {!q.qid && <Muted style={{ fontSize: 11, color: colors.warning }}>{tr('Chưa lưu')}</Muted>}
        </Card>
      ))}
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
    </Screen>
  );
}
