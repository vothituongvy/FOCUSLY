import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, Switch, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AppStackParams } from '../navigation/types';
import { api, errorMessage } from '../api/client';
import { useApi } from '../components/useApi';
import { useData } from '../store/data';
import { colors } from '../theme';
import { Button, Card, Chip, Chips, Empty, Field, H1, H3, Loading, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { tr } from '../i18n';
import { Avatar } from './SocialScreens';
import { showAlert } from '../components/Dialog';

type Nav = NativeStackNavigationProp<AppStackParams>;

/* ======================= Thư viện cộng đồng ======================= */
type Kind = 'deck' | 'quiz' | 'material';
const TYPE_LABEL: Record<string, string> = { pdf: 'PDF', image: 'Ảnh', text: 'Văn bản', link: 'Link', document: 'Word/Excel' };
const kb = (n?: number) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const countLabel = (k: Kind, i: { itemCount: number; materialType?: string; sizeBytes?: number; category?: string }) =>
  k === 'deck' ? tr('{0} thẻ', i.itemCount) : k === 'quiz' ? tr('{0} câu', i.itemCount) : [tr(TYPE_LABEL[i.materialType ?? ''] ?? 'Tài liệu'), i.category ? tr(i.category) : '', kb(i.sizeBytes)].filter(Boolean).join(' · ');
interface LibItem {
  id: string;
  title: string;
  description: string;
  authorName: string;
  copies: number;
  itemCount: number;
  materialType?: string;
  category?: string;
  sizeBytes?: number;
  mine: boolean;
}
interface LibDetail extends LibItem {
  kind: Kind;
  preview: { front: string; back: string }[];
  excerpt?: string;
}

export function LibraryScreen() {
  const nav = useNavigation<Nav>();
  const { sync } = useData();
  const [kind, setKind] = useState<Kind>('deck');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'popular' | 'new'>('popular');
  const list = useApi<{ items: LibItem[] }>(`/library?kind=${kind}&sort=${sort}${query ? `&q=${encodeURIComponent(query)}` : ''}`);
  const [open, setOpen] = useState<LibDetail | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { decks, quizzes, cards, materials } = useData();
  const [shareTab, setShareTab] = useState<Kind>('deck');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);
  const preview = async (id: string) => {
    setError('');
    try {
      setOpen((await api<{ item: LibDetail }>(`/library/${kind}/${id}`)).item);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const copy = async (d: LibDetail) => {
    setBusy(true);
    try {
      const r = await api<{ id: string; kind: Kind }>(`/library/${d.kind}/${d.id}/copy`, { method: 'POST', body: {} });
      await sync();
      setOpen(null);
      if (r.kind === 'deck') nav.navigate('DeckEdit', { deckId: r.id });
      else if (r.kind === 'quiz') nav.navigate('QuizTake', { quizId: r.id });
      else nav.navigate('MaterialDetail', { materialId: r.id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Muted>{tr('Bộ flashcard và bộ câu hỏi do người học khác chia sẻ. Sao chép về để học – bản của bạn là bản riêng, sửa thoải mái.')}</Muted>
      <Button variant="marker" icon="upload" title={tr('Chia sẻ bộ của tôi')} onPress={() => setShareOpen(true)} />
      <Chips>
        <Chip label={`🃏 ${tr('Flashcard')}`} active={kind === 'deck'} onPress={() => setKind('deck')} />
        <Chip label={`📝 ${tr('Bộ câu hỏi')}`} active={kind === 'quiz'} onPress={() => setKind('quiz')} />
        <Chip label={`📄 ${tr('Tài liệu')}`} active={kind === 'material'} onPress={() => setKind('material')} />
        <Chip label={tr('Phổ biến nhất')} active={sort === 'popular'} onPress={() => setSort('popular')} />
        <Chip label={tr('Mới nhất')} active={sort === 'new'} onPress={() => setSort('new')} />
      </Chips>
      <TextInput value={q} onChangeText={setQ} placeholder={tr('Tìm theo tên, mô tả, tác giả…')} placeholderTextColor="#9aa2b6" style={s.input} />
      {!!error && <Text style={s.error}>{error}</Text>}
      {!list.data ? (
        <Muted>{tr('Đang tải…')}</Muted>
      ) : list.data.items.length === 0 ? (
        <Empty text={query ? tr('Không tìm thấy bộ nào phù hợp.') : tr('Chưa có gì được chia sẻ ở mục này. Hãy là người đầu tiên: bấm “Chia sẻ bộ của tôi”.')} />
      ) : (
        list.data.items.map((i) => (
          <Pressable key={i.id} onPress={() => preview(i.id)}>
            <Card style={{ gap: 4, borderTopWidth: 3, borderTopColor: colors.text }}>
              <Text style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>{i.title}</Text>
              {!!i.description && <Muted numberOfLines={2}>{i.description}</Muted>}
              <Muted>
                {countLabel(kind, i)} · {tr('{0} lượt sao chép', i.copies)} · {i.mine ? tr('Của bạn') : tr('bởi {0}', i.authorName || '—')}
              </Muted>
            </Card>
          </Pressable>
        ))
      )}
      <Modal visible={shareOpen} animationType="slide" onRequestClose={() => (setShareOpen(false), void list.reload())}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <H1>{tr('Chia sẻ bộ của tôi')}</H1>
            <Muted>{tr('Bật công tắc để đưa lên Thư viện cộng đồng (bộ thẻ/câu hỏi cần ít nhất 3 thẻ/câu). Người khác chỉ sao chép được, không sửa được bản của bạn. Tắt lúc nào cũng được.')}</Muted>
            <Chips>
              <Chip label={`🃏 ${tr('Bộ flashcard')}`} active={shareTab === 'deck'} onPress={() => setShareTab('deck')} />
              <Chip label={`📝 ${tr('Bộ câu hỏi')}`} active={shareTab === 'quiz'} onPress={() => setShareTab('quiz')} />
              <Chip label={`📄 ${tr('Tài liệu')}`} active={shareTab === 'material'} onPress={() => setShareTab('material')} />
            </Chips>
            {shareTab === 'material' && <Text style={{ color: colors.text2, fontSize: 13 }}>⚠️ {tr('Chỉ chia sẻ tài liệu do bạn tự soạn (ghi chú, đề cương, bài tóm tắt…) hoặc được tác giả cho phép. Không đăng sách, đề thi hay tài liệu có bản quyền của người khác.')}</Text>}
            {(shareTab === 'deck' ? decks : shareTab === 'quiz' ? quizzes : materials.filter((x) => !(x as unknown as { sourceRef?: string }).sourceRef?.startsWith('lib:')))
              .filter((x) => !x.id.startsWith('c_'))
              .map((x) => (
                <View key={x.id} style={{ gap: 4 }}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {x.title}{' '}
                    <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 12.5 }}>
                      ({shareTab === 'deck' ? tr('{0} thẻ', cards.filter((c) => c.deck === x.id).length) : shareTab === 'quiz' ? tr('{0} câu', (x as { questions?: unknown[] }).questions?.length ?? 0) : tr(TYPE_LABEL[(x as { type?: string }).type ?? ''] ?? 'Tài liệu')})
                    </Text>
                  </Text>
                  <ShareToLibrary kind={shareTab} id={x.id} />
                </View>
              ))}
            {(shareTab === 'deck' ? decks : shareTab === 'quiz' ? quizzes : materials).length === 0 && <Empty text={shareTab === 'deck' ? tr('Bạn chưa có bộ flashcard nào. Tạo ở mục Ôn tập & quiz trước nhé.') : shareTab === 'quiz' ? tr('Bạn chưa có bộ câu hỏi nào. Tạo ở mục Ôn tập & quiz trước nhé.') : tr('Bạn chưa có tài liệu nào. Thêm ở mục Tài liệu trước nhé.')} />}
            <Button variant="ghost" title={tr('Đóng')} onPress={() => (setShareOpen(false), void list.reload())} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          {open && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <H1>{open.title}</H1>
              {!!open.description && <Muted>{open.description}</Muted>}
              <Muted>
                {countLabel(open.kind, open)} · {tr('bởi {0}', open.authorName || '—')}
              </Muted>
              {open.kind === 'material' && <Card><Text style={{ color: colors.text2 }}>{open.excerpt ? `${open.excerpt}${open.excerpt.length >= 900 ? '…' : ''}` : tr('Tài liệu này chưa có phần chữ để xem trước. Sao chép về để mở bản gốc.')}</Text></Card>}
              {open.kind !== 'material' && <Card style={{ gap: 0, padding: 0 }}>
                {open.preview.map((p, i) => (
                  <View key={i} style={{ padding: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, gap: 2 }}>
                    <Text style={{ color: colors.text }}>{p.front}</Text>
                    {open.kind === 'deck' && <Muted>{p.back}</Muted>}
                  </View>
                ))}
              </Card>}
              <Button variant="marker" icon="download" title={tr('Sao chép về tài khoản của tôi')} loading={busy} onPress={() => copy(open)} />
              <Button variant="ghost" title={tr('Đóng')} onPress={() => setOpen(null)} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

/** Công tắc chia sẻ bộ thẻ / bộ câu hỏi lên Thư viện cộng đồng (dùng trong màn sửa bộ) */
export function ShareToLibrary({ kind, id }: { kind: Kind; id?: string }) {
  const info = useApi<{ item: { isPublic: boolean; copies: number } }>(id && !id.startsWith('c_') ? `/library/${kind}/${id}` : null);
  const [error, setError] = useState('');
  if (!id || !info.data) return null;
  const on = info.data.item.isPublic;
  return (
    <Card style={{ gap: 6 }}>
      <Row style={{ flexWrap: 'nowrap' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{tr('Chia sẻ lên Thư viện cộng đồng')}</Text>
          {on && <Muted>{tr('{0} lượt sao chép', info.data.item.copies)}</Muted>}
        </View>
        <Switch
          value={on}
          trackColor={{ true: colors.marker, false: colors.track }}
          thumbColor={colors.text}
          onValueChange={(v) => {
            const go = async () => {
              setError('');
              try {
                await api(`/library/${kind}/${id}/publish`, { method: 'POST', body: { isPublic: v, confirmRights: v && kind === 'material' } });
                void info.reload();
              } catch (e) {
                setError(errorMessage(e));
              }
            };
            // tài liệu: xác nhận có quyền chia sẻ trước khi công khai
            if (v && kind === 'material')
              showAlert(tr('Chia sẻ tài liệu'), tr('Bạn xác nhận tài liệu này do bạn tự soạn hoặc được tác giả cho phép chia sẻ công khai? Không đăng sách, đề thi hay tài liệu có bản quyền của người khác.'), [
                { text: tr('Huỷ'), style: 'cancel' },
                { text: tr('Tôi xác nhận'), onPress: () => void go() },
              ]);
            else void go();
          }}
        />
      </Row>
      {!!error && <Text style={s.error}>{error}</Text>}
    </Card>
  );
}

/* ======================= Lớp học ======================= */
interface ClassItem {
  id: string;
  name: string;
  code?: string;
  isTeacher: boolean;
  members: number;
  assignments: number;
}
interface Prog {
  started: boolean;
  percent: number;
  done: boolean;
  detail: string;
}
interface ClassDetail {
  id: string;
  name: string;
  description: string;
  isTeacher: boolean;
  code?: string;
  teacher: { name: string } | null;
  assignments: { id: string; kind: Kind; title: string; note: string; dueAt: string | null; progress?: Prog }[];
  students?: { id: string; name: string; avatarUrl: string | null; weekMinutes: number; progress: Prog[] }[];
  members?: number;
}

export function ClassesScreen() {
  const nav = useNavigation<Nav>();
  const list = useApi<{ items: ClassItem[] }>('/classes');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const go = async (path: string, body: unknown) => {
    setError('');
    try {
      const r = await api<{ id?: string; item?: { id: string } }>(path, { method: 'POST', body });
      nav.navigate('ClassDetail', { classId: r.id ?? r.item!.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Screen>
      <Muted>{tr('Giáo viên tạo lớp, gửi mã cho học sinh; giao bộ flashcard hoặc bài kiểm tra và theo dõi tiến độ cả lớp.')}</Muted>
      <Card>
        <H3>{tr('Vào lớp (học sinh)')}</H3>
        <Field label={tr('Mã lớp giáo viên gửi')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} placeholder="ABC123" />
        <Button title={tr('Vào lớp')} disabled={!code.trim()} onPress={() => go('/classes/join', { code: code.trim() })} />
      </Card>
      <Card>
        <H3>{tr('Tạo lớp (giáo viên)')}</H3>
        <Field label={tr('Tên lớp')} value={name} onChangeText={setName} placeholder={tr('VD: Tiếng Anh 10A2')} maxLength={100} />
        <Button variant="secondary" title={tr('Tạo lớp')} disabled={!name.trim()} onPress={() => go('/classes', { name: name.trim() })} />
      </Card>
      {!!error && <Text style={s.error}>{error}</Text>}
      {(list.data?.items ?? []).map((c) => (
        <Pressable key={c.id} onPress={() => nav.navigate('ClassDetail', { classId: c.id })}>
          <Card style={{ gap: 2 }}>
            <Row style={{ flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>{c.name}</Text>
              <Muted>{c.isTeacher ? tr('giáo viên') : tr('học sinh')}</Muted>
            </Row>
            <Muted>
              {tr('{0} học sinh', c.members)} · {tr('{0} bài được giao', c.assignments)}
              {c.code ? ` · ${tr('Mã {0}', c.code)}` : ''}
            </Muted>
          </Card>
        </Pressable>
      ))}
      {list.data && !list.data.items.length && <Empty text={tr('Bạn chưa ở lớp nào.')} />}
    </Screen>
  );
}

export function ClassDetailScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'ClassDetail'>) {
  const id = route.params.classId;
  const res = useApi<{ item: ClassDetail }>(`/classes/${id}`);
  const { sync, decks, quizzes } = useData();
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState('');
  const c = res.data?.item;
  useEffect(() => {
    if (c) navigation.setOptions({ title: c.name });
  }, [c?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return res.error ? <Screen><Text style={s.error}>{res.error}</Text></Screen> : <Loading />;
  const start = async (aid: string) => {
    setError('');
    try {
      const r = await api<{ kind: Kind; id: string }>(`/classes/${id}/assignments/${aid}/start`, { method: 'POST', body: {} });
      await sync();
      if (r.kind === 'deck') navigation.navigate('Review', { deckId: r.id });
      else navigation.navigate('QuizTake', { quizId: r.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const leave = () =>
    showAlert(c.isTeacher ? tr('Xoá lớp này?') : tr('Rời lớp này?'), '', [
      { text: tr('Huỷ'), style: 'cancel' },
      { text: c.isTeacher ? tr('Xoá lớp') : tr('Rời lớp'), style: 'destructive', onPress: () => void api(`/classes/${id}`, { method: 'DELETE' }).then(() => navigation.goBack()) },
    ]);

  return (
    <Screen>
      <Muted>{c.isTeacher ? `${tr('Mã lớp')}: ${c.code} · ${tr('{0} học sinh', c.students?.length ?? 0)}` : `${tr('Giáo viên: {0}', c.teacher?.name ?? '—')} · ${tr('{0} học sinh', c.members ?? 0)}`}</Muted>
      {!!c.description && <Text style={{ color: colors.text2 }}>{c.description}</Text>}
      {c.isTeacher && (
        <Row>
          <Button small variant="secondary" icon="send" title={tr('Gửi mã lớp')} onPress={() => void Share.share({ message: tr('Vào lớp “{0}” trên FOCUSLY với mã: {1}', c.name, c.code ?? '') })} />
          <Button small variant="marker" icon="plus" title={tr('Giao bài')} onPress={() => setAssignOpen(true)} />
        </Row>
      )}
      {!!error && <Text style={s.error}>{error}</Text>}

      {c.isTeacher ? (
        <>
          <H3>{tr('Tiến độ cả lớp')}</H3>
          {!c.students?.length ? (
            <Empty text={tr('Chưa có học sinh. Gửi mã lớp {0} để học sinh vào lớp.', c.code ?? '')} />
          ) : (
            c.students.map((st) => (
              <Card key={st.id} style={{ gap: 6 }}>
                <Row style={{ flexWrap: 'nowrap' }}>
                  <Avatar name={st.name} url={st.avatarUrl} size={30} />
                  <Text style={{ flex: 1, fontWeight: '700', color: colors.text }}>{st.name}</Text>
                  <Muted>{tr('{0} phút/tuần', st.weekMinutes)}</Muted>
                </Row>
                {c.assignments.map((a, i) => (
                  <View key={a.id} style={{ gap: 3 }}>
                    <Row style={{ flexWrap: 'nowrap' }}>
                      <Text style={{ flex: 1, color: colors.text2, fontSize: 13 }} numberOfLines={1}>
                        {a.kind === 'deck' ? '🃏' : '📝'} {a.title}
                      </Text>
                      <Muted>{st.progress[i]?.started ? `${st.progress[i].percent}%` : tr('chưa làm')}</Muted>
                    </Row>
                    {st.progress[i]?.started && <ProgressBar value={st.progress[i].percent / 100} />}
                  </View>
                ))}
              </Card>
            ))
          )}
          {c.assignments.length > 0 && <H3>{tr('Bài đã giao')}</H3>}
          {c.assignments.map((a) => (
            <Row key={a.id} style={{ flexWrap: 'nowrap' }}>
              <Text style={{ flex: 1, color: colors.text }}>
                {a.kind === 'deck' ? '🃏' : '📝'} {a.title}
                {a.dueAt ? ` · ${tr('hạn {0}', new Date(a.dueAt).toLocaleDateString())}` : ''}
              </Text>
              <Button small variant="ghost" title={tr('Huỷ')} onPress={() => void api(`/classes/${id}/assignments/${a.id}`, { method: 'DELETE' }).then(() => res.reload())} />
            </Row>
          ))}
        </>
      ) : (
        <>
          <H3>{tr('Bài được giao')}</H3>
          {!c.assignments.length && <Empty text={tr('Giáo viên chưa giao bài nào.')} />}
          {c.assignments.map((a) => (
            <Card key={a.id} style={{ gap: 6 }}>
              <Text style={{ fontWeight: '700', color: colors.text }}>
                {a.kind === 'deck' ? '🃏' : '📝'} {a.title}
              </Text>
              <Muted>
                {a.dueAt ? tr('Hạn {0}', new Date(a.dueAt).toLocaleDateString()) : tr('Không có hạn')}
                {a.progress?.detail ? ` · ${a.progress.detail}` : ''}
              </Muted>
              {!!a.note && <Text style={{ color: colors.text2 }}>{a.note}</Text>}
              {a.progress?.started && <ProgressBar value={a.progress.percent / 100} />}
              <Button small title={a.progress?.started ? (a.kind === 'deck' ? tr('Tiếp tục ôn') : tr('Làm lại')) : tr('Bắt đầu')} onPress={() => start(a.id)} />
            </Card>
          ))}
        </>
      )}
      <Button variant="danger" title={c.isTeacher ? tr('Xoá lớp') : tr('Rời lớp')} onPress={leave} />

      <AssignSheet visible={assignOpen} onClose={() => setAssignOpen(false)} classId={id} decks={decks.map((d) => ({ id: d.id, title: d.title }))} quizzes={quizzes.map((q) => ({ id: q.id, title: q.title }))} onDone={() => res.reload()} />
    </Screen>
  );
}

function AssignSheet({ visible, onClose, classId, decks, quizzes, onDone }: { visible: boolean; onClose: () => void; classId: string; decks: { id: string; title: string }[]; quizzes: { id: string; title: string }[]; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('deck');
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  const options = (kind === 'deck' ? decks : quizzes).filter((o) => !o.id.startsWith('c_'));
  const submit = async () => {
    setError('');
    try {
      const n = Number(days);
      const dueAt = n > 0 ? new Date(Date.now() + n * 86_400_000).toISOString() : null;
      await api(`/classes/${classId}/assignments`, { method: 'POST', body: { kind, source, note, dueAt } });
      onDone();
      onClose();
      setSource(null);
      setNote('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          <H1>{tr('Giao bài cho lớp')}</H1>
          <Chips>
            <Chip label={`🃏 ${tr('Bộ flashcard')}`} active={kind === 'deck'} onPress={() => (setKind('deck'), setSource(null))} />
            <Chip label={`📝 ${tr('Bài kiểm tra')}`} active={kind === 'quiz'} onPress={() => (setKind('quiz'), setSource(null))} />
          </Chips>
          <Text style={s.label}>{kind === 'deck' ? tr('Chọn bộ flashcard của bạn') : tr('Chọn bộ câu hỏi của bạn')}</Text>
          <Chips wrap>
            {options.map((o) => (
              <Chip key={o.id} label={o.title} active={source === o.id} onPress={() => setSource(o.id)} />
            ))}
          </Chips>
          {!options.length && <Muted>{tr('Chưa có bộ nào đã đồng bộ.')}</Muted>}
          <Field label={tr('Hạn nộp sau (số ngày, để trống nếu không có hạn)')} value={days} onChangeText={setDays} keyboardType="number-pad" />
          <Field label={tr('Lời dặn')} value={note} onChangeText={setNote} maxLength={500} />
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button title={tr('Giao bài & báo cho học sinh')} disabled={!source} onPress={submit} />
          <Button variant="ghost" title={tr('Huỷ')} onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
