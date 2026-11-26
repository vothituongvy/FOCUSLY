import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../store/data';
import { review, cardStage } from '../offline/srs';
import { uid } from '../offline/db';
import { colors } from '../theme';
import type { Card, Question, Quiz } from '../types';
import type { AppStackParams } from '../navigation/types';
import { Button, Card as Box, Chip, Chips, Empty, H1, H3, Muted, ProgressBar, Row, Screen, s } from '../components/ui';
import { AppHeader } from '../components/AppHeader';

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
    <Screen header={<AppHeader title="Ôn tập" subtitle={due.length ? `${due.length} thẻ đến hạn hôm nay` : 'Không có thẻ đến hạn'} />}>
      <Button title={due.length ? `Ôn ${due.length} thẻ ngay` : 'Đã ôn xong hôm nay'} icon="cards" variant={due.length ? 'marker' : 'secondary'} disabled={!due.length} onPress={() => nav.navigate('Review', {})} />
      <Row>
        {[
          ['Cần ôn', String(due.length)],
          ['Tổng thẻ', String(cards.length)],
          ['Bài đã làm', String(quizAttempts.length)],
        ].map(([l, v]) => (
          <Box key={l} style={{ flex: 1, gap: 2, padding: 12 }}>
            <Muted>{l}</Muted>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{v}</Text>
          </Box>
        ))}
      </Row>

      <H3>🃏 Bộ flashcard</H3>
      {decks.length === 0 && <Empty text="Chưa có bộ thẻ – tạo trên Web hoặc dùng AI." />}
      {decks.map((d) => {
        const list = cards.filter((c) => c.deck === d.id && !c.suspended);
        const dDue = list.filter((c) => isDue(c, now)).length;
        const mature = list.filter((c) => cardStage(c.srs ?? {}) === 'mature').length;
        return (
          <Pressable key={d.id} onPress={() => dDue && nav.navigate('Review', { deckId: d.id })}>
            <Box style={{ borderLeftWidth: 4, borderLeftColor: d.color }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{d.title}</Text>
                <Text style={{ color: dDue ? colors.warning : colors.success, fontWeight: '700' }}>{dDue ? `${dDue} cần ôn` : '✓'}</Text>
              </Row>
              <Muted>
                {list.length} thẻ · đã thuộc lâu {mature}
              </Muted>
              <ProgressBar value={list.length ? mature / list.length : 0} color={colors.success} />
            </Box>
          </Pressable>
        );
      })}

      <H3>Bộ câu hỏi</H3>
      {quizzes.length === 0 && <Empty text="Chưa có bộ câu hỏi." />}
      {quizzes.map((q) => {
        const last = quizAttempts.find((a) => (typeof a.quiz === 'string' ? a.quiz : a.quiz?.id ?? a.quiz?._id) === q.id);
        return (
          <Pressable key={q.id} onPress={() => nav.navigate('QuizTake', { quizId: q.id })}>
            <Box>
              <Text style={{ fontWeight: '700', color: colors.text }}>{q.title}</Text>
              <Muted>
                {q.questions.length} câu{q.source === 'ai' ? ' · AI' : ''}
                {last ? ` · lần gần nhất ${Math.round(last.accuracy * 100)}%` : ''}
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
  { label: 'Quên', grade: 1, color: '#b91c1c' },
  { label: 'Khó', grade: 3, color: '#b45309' },
  { label: 'Nhớ', grade: 4, color: '#15803d' },
  { label: 'Dễ', grade: 5, color: '#1d4ed8' },
];

export function ReviewScreen({ route, navigation }: NativeStackScreenProps<AppStackParams, 'Review'>) {
  const { cards, patchLocal, queueCustom } = useData();
  const initial = useMemo(
    () => cards.filter((c) => isDue(c) && (!route.params?.deckId || c.deck === route.params.deckId)).sort((a, b) => a.srs.due.localeCompare(b.srs.due)),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [queue, setQueue] = useState<Card[]>(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [count, setCount] = useState(0);
  const card = queue[i];

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
          <H1>{count ? 'Hoàn thành!' : 'Không có thẻ cần ôn'}</H1>
          {!!count && <Muted>{count} lượt ôn – kết quả được đồng bộ khi có mạng.</Muted>}
          <Button title="Quay lại" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Muted>
        Thẻ {i + 1}/{queue.length}
      </Muted>
      <ProgressBar value={i / queue.length} />
      <Pressable onPress={() => setFlipped(!flipped)}>
        <Box style={{ minHeight: 280, justifyContent: 'center', alignItems: 'center', backgroundColor: flipped ? '#fbfbff' : colors.surface }}>
          <Muted>{flipped ? 'Mặt sau' : 'Mặt trước'}</Muted>
          <Text style={{ fontSize: 20, textAlign: 'center', color: colors.text }}>{flipped ? card.back : card.front}</Text>
          {!flipped && !!card.hint && <Muted>{card.hint}</Muted>}
        </Box>
      </Pressable>
      {!flipped ? (
        <Button title="Hiện đáp án" onPress={() => setFlipped(true)} />
      ) : (
        <Row>
          {GRADES.map((g) => (
            <Pressable key={g.label} onPress={() => grade(g.grade)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: colors.surface }}>
              <Text style={{ color: g.color, fontWeight: '800' }}>{g.label}</Text>
            </Pressable>
          ))}
        </Row>
      )}
      <Muted>Tự trả lời trong đầu trước khi lật thẻ (Active Recall).</Muted>
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
  if (q.type === 'mcq') return { correct: a === q.correctIndex, correctAnswer: q.options[q.correctIndex ?? 0] ?? '' };
  if (q.type === 'true_false') return { correct: a === q.correctBoolean, correctAnswer: q.correctBoolean ? 'Đúng' : 'Sai' };
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

  if (!quiz) return <Screen><Empty text="Không tìm thấy bộ câu hỏi." /></Screen>;

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
            {result.score}/{result.total} câu đúng
          </H1>
        </View>
        {result.items.map(({ q, correct, correctAnswer }, i) => (
          <Box key={q.qid} style={{ borderColor: correct ? colors.success : colors.danger }}>
            <Text style={{ fontWeight: '700', color: colors.text }}>
              {correct ? 'Đúng' : 'Sai'} · Câu {i + 1}. {q.prompt}
            </Text>
            {!correct && <Text style={{ color: colors.success }}>Đáp án: {correctAnswer}</Text>}
            {!!q.explanation && <Muted>{q.explanation}</Muted>}
          </Box>
        ))}
        <Button
          title="Làm lại"
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
          {q.type === 'true_false' && (
            <Chips>
              <Chip label="Đúng" active={answers[q.qid!] === true} onPress={() => setAnswers({ ...answers, [q.qid!]: true })} />
              <Chip label="Sai" active={answers[q.qid!] === false} onPress={() => setAnswers({ ...answers, [q.qid!]: false })} />
            </Chips>
          )}
          {q.type === 'short' && (
            <TextInput style={s.input} value={String(answers[q.qid!] ?? '')} onChangeText={(t) => setAnswers({ ...answers, [q.qid!]: t })} placeholder="Câu trả lời" placeholderTextColor="#a0a5c0" />
          )}
        </Box>
      ))}
      <Button title="Nộp bài" onPress={submit} />
    </Screen>
  );
}
