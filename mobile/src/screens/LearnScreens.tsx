import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../store/data';
import { review, cardStage } from '../offline/srs';
import { uid } from '../offline/db';
import { colors, tints } from '../theme';
import type { Card, Question, Quiz } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card as Box, Chip, Chips, Empty, H1, H3, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { AppHeader } from '../components/AppHeader';
import { Icon } from '../components/Icon';
import { MemoryForecast } from '../components/MemoryForecast';
import { prefGet, prefSet, tr } from '../i18n';
import { PronounceButton, SpeakButton } from '../components/Speech';
import { isEnglish, speak } from '../native';
import { HubTiles } from '../components/HubTiles';

/* ======================================================================
 * PHASE 2 trên Mobile: Flashcard (Spaced Repetition) & Quiz – chạy được OFFLINE
 * ==================================================================== */

const isDue = (c: Card, now = Date.now()) => !c.suspended && new Date(c.srs?.due ?? 0).getTime() <= now;

export function LearnScreen() {
  const nav = useNavigation<NativeStackNavigationProp<AppStackParams>>();
  const { decks, cards, quizzes, quizAttempts } = useData();
  const now = Date.now();
  const due = cards.filter((c) => isDue(c, now));

  return (
    <Screen header={<AppHeader title={tr('Học')} subtitle={due.length ? tr('{0} thẻ đến hạn hôm nay', due.length) : tr('Không có thẻ đến hạn')} />}>
      <HubTiles
        items={[
          { icon: 'materials', label: tr('Tài liệu'), onPress: () => nav.navigate('Materials') },
          { icon: 'ai', label: tr('Trợ lý AI'), onPress: () => nav.navigate('AIChat', {}) },
          { icon: 'target', label: tr('Ôn thi'), onPress: () => nav.navigate('Exams') },
          { icon: 'library', label: tr('Thư viện cộng đồng'), onPress: () => nav.navigate('Library') },
        ]}
      />
      <Button title={due.length ? tr('Ôn {0} thẻ ngay', due.length) : tr('Đã ôn xong hôm nay')} icon="cards" variant={due.length ? 'marker' : 'secondary'} disabled={!due.length} onPress={() => nav.navigate('Review', {})} />
      <Row>
        {[
          [tr('Cần ôn'), String(due.length)],
          [tr('Tổng thẻ'), String(cards.length)],
          [tr('Bài đã làm'), String(quizAttempts.length)],
        ].map(([l, v]) => (
          <Box key={l} style={{ flex: 1, gap: 2, padding: 12, alignItems: 'center', justifyContent: 'center' }}>
            <Muted style={{ textAlign: 'center' }}>{l}</Muted>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' }}>{v}</Text>
          </Box>
        ))}
      </Row>

      <MemoryForecast />

      <Row style={{ flexWrap: 'nowrap' }}>
        <Button title={tr('Ôn câu sai')} small variant="secondary" icon="repeat" style={{ flex: 1 }} onPress={() => nav.navigate('Mistakes')} />
        <Button title={tr('Tiến độ ghi nhớ')} small variant="secondary" icon="analytics" style={{ flex: 1 }} onPress={() => nav.navigate('LearnProgress')} />
      </Row>

      <Row style={{ justifyContent: 'space-between' }}>
        <H3>{tr('Bộ flashcard')}</H3>
        <Row style={{ gap: 6 }}>
          <Button title={tr('Từ file')} small variant="ghost" icon="upload" onPress={() => nav.navigate('DeckEdit', { fromFile: true })} />
          <Button title={tr('+ Bộ thẻ')} small variant="secondary" onPress={() => nav.navigate('DeckEdit', {})} />
        </Row>
      </Row>
      {decks.length === 0 && <Empty text={tr('Chưa có bộ thẻ. Bấm “+ Bộ thẻ” để tự tạo hoặc nhờ AI tạo.')} />}
      {decks.map((d) => {
        const list = cards.filter((c) => c.deck === d.id && !c.suspended);
        const dDue = list.filter((c) => isDue(c, now)).length;
        const mature = list.filter((c) => cardStage(c.srs ?? {}) === 'mature').length;
        return (
          <Pressable key={d.id} onPress={() => nav.navigate('DeckEdit', { deckId: d.id })}>
            <Box style={{ borderLeftWidth: 4, borderLeftColor: d.color }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{d.title}</Text>
                <Text style={{ color: dDue ? colors.warning : colors.success, fontWeight: '700' }}>{dDue ? tr('{0} cần ôn', dDue) : '✓'}</Text>
              </Row>
              <Muted>
                {tr('{0} thẻ · đã thuộc lâu {1}', list.length, mature)}
              </Muted>
              <ProgressBar value={list.length ? mature / list.length : 0} color={colors.success} />
              {dDue > 0 && <Button title={tr('Ôn {0} thẻ', dDue)} small variant="marker" icon="cards" onPress={() => nav.navigate('Review', { deckId: d.id })} />}
            </Box>
          </Pressable>
        );
      })}

      <Row style={{ justifyContent: 'space-between' }}>
        <H3>{tr('Bộ câu hỏi')}</H3>
        <Row style={{ gap: 6 }}>
          <Button title={tr('Từ file')} small variant="ghost" icon="upload" onPress={() => nav.navigate('QuizEdit', { fromFile: true })} />
          <Button title={tr('+ Bộ câu hỏi')} small variant="secondary" onPress={() => nav.navigate('QuizEdit', {})} />
        </Row>
      </Row>
      {quizzes.length === 0 && <Empty text={tr('Chưa có bộ câu hỏi.')} />}
      {quizzes.map((q) => {
        const last = quizAttempts.find((a) => (typeof a.quiz === 'string' ? a.quiz : a.quiz?.id ?? a.quiz?._id) === q.id);
        return (
          <Pressable key={q.id} onPress={() => nav.navigate('QuizTake', { quizId: q.id })}>
            <Box>
              <Row style={{ flexWrap: 'nowrap' }}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{q.title}</Text>
                <Pressable hitSlop={10} accessibilityLabel={tr('Sửa')} onPress={() => nav.navigate('QuizEdit', { quizId: q.id })}>
                  <Icon name="edit" size={18} color={colors.text2} />
                </Pressable>
              </Row>
              <Muted>
                {tr('{0} câu', q.questions.length)}{q.source === 'ai' ? ' · AI' : ''}
                {last ? tr(' · lần gần nhất {0}%', Math.round(last.accuracy * 100)) : ''}
              </Muted>
            </Box>
          </Pressable>
        );
      })}
    </Screen>
  );
}

/* ---------------- Ôn flashcard ---------------- */
const GRADES = [
  { label: tr('Quên'), grade: 1, color: '#b91c1c' },
  { label: tr('Khó'), grade: 3, color: '#b45309' },
  { label: tr('Nhớ'), grade: 4, color: '#15803d' },
  { label: tr('Dễ'), grade: 5, color: '#1d4ed8' },
];
const GRADE_TINT: Record<number, { bg: string; border: string }> = { 1: tints.peach, 3: tints.lemon, 4: tints.mint, 5: tints.sky };

export function ReviewScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'Review'>) {
  const { cards, patchLocal, queueCustom, online } = useData();
  // tự đọc mặt trước mỗi thẻ (lưu trên máy)
  const [autoRead, setAutoReadState] = useState(() => prefGet('autoRead') === '1');
  const setAutoRead = (v: boolean) => {
    setAutoReadState(v);
    prefSet('autoRead', v ? '1' : '0');
  };
  const initial = useMemo(
    () => cards.filter((c) => isDue(c) && (!route.params?.deckId || c.deck === route.params.deckId)).sort((a, b) => a.srs.due.localeCompare(b.srs.due)),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [queue, setQueue] = useState<Card[]>(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(0);
  const card = queue[i];
  useEffect(() => {
    if (autoRead && card && !flipped) void speak(card.front);
  }, [card?.id, i, autoRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = async (g: number) => {
    if (!card) return;
    const at = new Date();
    const next = review(card.srs ?? {}, g, at);
    // cập nhật ngay cục bộ (offline), server tính lại chính thức khi đồng bộ
    await patchLocal('cards', card.id, {
      srs: { ...next, due: next.due.toISOString(), lastReviewedAt: at.toISOString() },
    });
    await queueCustom('cards', 'review', card.id, { data: { grade: g, at: at.toISOString() } });
    if (g < 3) setQueue((q) => [...q, card]);
    setCount((c) => c + 1);
    setI((x) => x + 1);
    setFlipped(false);
  };

  if (!card) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
          <Text style={{ fontSize: 46 }}></Text>
          <H1>{count ? tr('Hoàn thành!') : tr('Không có thẻ cần ôn')}</H1>
          {!!count && <Muted>{tr('{0} lượt ôn – kết quả được đồng bộ khi có mạng.', count)}</Muted>}
          <Button title={tr('Quay lại')} onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>
        {tr('Thẻ {0}/{1}', i + 1, queue.length)}
      </Muted>
      <ProgressBar value={i / queue.length} />
      <Pressable onPress={() => setFlipped(!flipped)}>
        <Box style={{ minHeight: 280, justifyContent: 'center', alignItems: 'center', backgroundColor: flipped ? tints.lemon.bg : colors.card, borderColor: flipped ? tints.lemon.border : colors.cardBorder }}>
          <Muted>{flipped ? tr('Mặt sau') : tr('Mặt trước')}</Muted>
          <Text style={{ fontSize: 20, textAlign: 'center', color: colors.text }}>{flipped ? card.back : card.front}</Text>
          {!flipped && !!card.hint && <Muted>{card.hint}</Muted>}
        </Box>
      </Pressable>
      <Row style={{ justifyContent: 'center' }}>
        <SpeakButton text={flipped ? card.back : card.front} label={flipped ? tr('Nghe mặt sau') : tr('Nghe mặt trước')} />
        <Chip label={autoRead ? tr('✓ Tự đọc mặt trước') : tr('Tự đọc mặt trước')} active={autoRead} onPress={() => setAutoRead(!autoRead)} />
      </Row>
      <PronounceButton text={isEnglish(card.front) ? card.front : card.back} />
      {!online && <Muted style={{ textAlign: 'center' }}>{tr('Đang offline – kết quả ôn được lưu trên máy và tự đồng bộ khi có mạng.')}</Muted>}
      {!flipped ? (
        <Button title={tr('Hiện đáp án')} onPress={() => setFlipped(true)} />
      ) : (
        <Row>
          {GRADES.map((g) => (
            <Pressable key={g.label} onPress={() => grade(g.grade)} style={{ flex: 1, borderWidth: 1, borderColor: GRADE_TINT[g.grade]?.border ?? colors.border, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: GRADE_TINT[g.grade]?.bg ?? colors.card }}>
              <Text style={{ color: g.color, fontWeight: '800' }}>{g.label}</Text>
            </Pressable>
          ))}
        </Row>
      )}
      <Muted>{tr('Tự trả lời trong đầu trước khi lật thẻ (Active Recall).')}</Muted>
    </Screen>
  );
}

/* ---------------- Làm quiz (chấm tạm offline, server chấm chính thức) ---------------- */
const norm = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function localGrade(q: Question, a: unknown) {
  if (q.type === 'multi') {
    // đúng khi chọn ĐỦ và CHỈ các đáp án đúng
    const picked = new Set(Array.isArray(a) ? (a as number[]) : []);
    const right = q.correctIndexes ?? [];
    return {
      correct: picked.size === right.length && right.every((i) => picked.has(i)),
      correctAnswer: right.map((i) => q.options[i]).filter(Boolean).join('; '),
    };
  }
  if (q.type === 'mcq') return { correct: a === q.correctIndex, correctAnswer: q.options[q.correctIndex ?? 0] ?? '' };
  if (q.type === 'true_false') return { correct: a === q.correctBoolean, correctAnswer: q.correctBoolean ? tr('Đúng') : 'Sai' };
  const n = norm(String(a ?? ''));
  return { correct: Boolean(n) && q.acceptedAnswers.some((x) => norm(x) === n || (norm(x).length >= 4 && n.includes(norm(x)))), correctAnswer: q.acceptedAnswers[0] ?? '' };
}

export function QuizTakeScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'QuizTake'>) {
  const { quizzes, queueCustom, patchLocal } = useData();
  const quiz = quizzes.find((q) => q.id === route.params.quizId) as Quiz | undefined;
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ score: number; total: number; items: { q: Question; correct: boolean; correctAnswer: string; answer: unknown }[] } | null>(null);
  const started = useRef(Date.now());

  useEffect(() => {
    navigation.setOptions({ title: quiz?.title ?? 'Quiz' });
  }, [navigation, quiz?.title]);

  if (!quiz) return <Screen><Empty text={tr('Không tìm thấy bộ câu hỏi.')} /></Screen>;

  const submit = async () => {
    const items = quiz.questions.map((q) => ({ q, answer: answers[q.qid!] ?? null, ...localGrade(q, answers[q.qid!]) }));
    const score = items.filter((x) => x.correct).length;
    setResult({ score, total: items.length, items });
    const clientId = uid();
    const durationSeconds = Math.round((Date.now() - started.current) / 1000);
    // lưu tạm để hiển thị lịch sử khi offline
    await patchLocal('quizAttempts', clientId, {
      clientId,
      quiz: quiz.id,
      score,
      total: items.length,
      accuracy: score / items.length,
      durationSeconds,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      answers: [],
    });
    await queueCustom('quizAttempts', 'create', clientId, {
      clientId,
      data: { quiz: quiz.id, answers: quiz.questions.map((q) => ({ qid: q.qid, answer: answers[q.qid!] ?? null })), durationSeconds, startedAt: new Date(started.current).toISOString() },
    });
  };

  if (result) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <H1>
            {tr('{0}/{1} câu đúng', result.score, result.total)}
          </H1>
        </View>
        {result.items.map(({ q, correct, correctAnswer }, i) => (
          <Box key={q.qid} style={{ borderColor: correct ? colors.success : colors.danger }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {correct ? tr('Đúng') : 'Sai'}{' '}{tr('· Câu {0}. {1}', i + 1, q.prompt)}
            </Text>
            {!correct && <Text style={{ color: colors.success }}>{tr('Đáp án: {0}', correctAnswer)}</Text>}
            {!!q.explanation && <Muted>{q.explanation}</Muted>}
          </Box>
        ))}
        <Button
          title={tr('Làm lại')}
          onPress={() => {
            setAnswers({});
            setResult(null);
            started.current = Date.now();
          }}
        />
        <Button title="Xong" variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {quiz.questions.map((q, i) => (
        <Box key={q.qid}>
          <Text style={{ fontWeight: '700', color: colors.text }}>
            {i + 1}. {q.prompt}
          </Text>
          {q.type === 'mcq' && (
            <View style={{ gap: 8 }}>
              {q.options.map((o, k) => (
                <Pressable
                  key={k}
                  onPress={() => setAnswers({ ...answers, [q.qid!]: k })}
                  style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: answers[q.qid!] === k ? colors.primary : colors.border, backgroundColor: answers[q.qid!] === k ? colors.primary50 : colors.surface }}
                >
                  <Text style={{ color: colors.text }}>
                    {String.fromCharCode(65 + k)}. {o}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {q.type === 'multi' && (
            <View style={{ gap: 8 }}>
              <Muted style={{ fontSize: 12 }}>{tr('Chọn tất cả đáp án đúng')}</Muted>
              {q.options.map((o, k) => {
                const cur = (answers[q.qid!] as number[] | undefined) ?? [];
                const on = cur.includes(k);
                return (
                  <Pressable
                    key={k}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => setAnswers({ ...answers, [q.qid!]: on ? cur.filter((x) => x !== k) : [...cur, k].sort((x, y) => x - y) })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary50 : colors.surface }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? colors.text : colors.borderStrong, backgroundColor: on ? colors.marker : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ fontWeight: '800', color: colors.onMarker, fontSize: 12 }}>✓</Text>}
                    </View>
                    <Text style={{ flex: 1, color: colors.text }}>
                      {String.fromCharCode(65 + k)}. {o}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {q.type === 'true_false' && (
            <Chips>
              <Chip label={tr('Đúng')} active={answers[q.qid!] === true} onPress={() => setAnswers({ ...answers, [q.qid!]: true })} />
              <Chip label="Sai" active={answers[q.qid!] === false} onPress={() => setAnswers({ ...answers, [q.qid!]: false })} />
            </Chips>
          )}
          {q.type === 'short' && (
            <TextInput style={s.input} value={String(answers[q.qid!] ?? '')} onChangeText={(t) => setAnswers({ ...answers, [q.qid!]: t })} placeholder={tr('Câu trả lời')} placeholderTextColor="#a0a5c0" />
          )}
        </Box>
      ))}
      <Button title={tr('Nộp bài')} onPress={submit} />
    </Screen>
  );
}
