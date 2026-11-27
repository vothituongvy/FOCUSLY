import { CardModel, DeckModel, MaterialModel, QuizModel } from '../../models/Learn';
import { notifyChange } from '../realtime';

/** Sao chép bộ thẻ (kèm thẻ, SRS mới tinh) vào tài khoản người học */
export async function copyDeck(sourceId: string, userId: string, sourceRef: string) {
  const src = await DeckModel.findOne({ _id: sourceId, deletedAt: null }).lean();
  if (!src) return null;
  const deck = await DeckModel.create({ user: userId, title: src.title, description: src.description, color: src.color, sourceRef });
  const cards = await CardModel.find({ deck: src._id, deletedAt: null }).select('front back hint tags').limit(5000).lean();
  if (cards.length) {
    await CardModel.insertMany(cards.map((c) => ({ user: userId, deck: deck._id, front: c.front, back: c.back, hint: c.hint, tags: c.tags, source: 'manual' })));
  }
  notifyChange(userId, 'decks', 'create', deck.toJSON());
  if (cards.length) notifyChange(userId, 'cards', 'bulk', null);
  return deck;
}

/** Sao chép bộ câu hỏi vào tài khoản người học */
export async function copyQuiz(sourceId: string, userId: string, sourceRef: string) {
  const src = await QuizModel.findOne({ _id: sourceId, deletedAt: null }).lean();
  if (!src) return null;
  const quiz = await QuizModel.create({
    user: userId,
    title: src.title,
    description: src.description,
    questions: src.questions,
    source: src.source,
    timeLimitMinutes: src.timeLimitMinutes,
    sourceRef,
  });
  notifyChange(userId, 'quizzes', 'create', quiz.toJSON());
  return quiz;
}

/** Sao chép tài liệu: dùng chung file gốc (không nhân bản file), kèm chữ đã trích để tìm kiếm & hỏi AI */
export async function copyMaterial(sourceId: string, userId: string, sourceRef: string) {
  const src = await MaterialModel.findOne({ _id: sourceId, deletedAt: null }).select('+textContent').lean();
  if (!src) return null;
  const m = await MaterialModel.create({
    user: userId,
    title: src.title,
    description: src.description,
    category: src.category,
    tags: src.tags,
    type: src.type,
    url: src.url,
    storageId: null, // file thuộc người chia sẻ – bản sao không xoá file gốc
    mimeType: src.mimeType,
    sizeBytes: src.sizeBytes,
    originalName: src.originalName,
    textContent: (src as { textContent?: string }).textContent ?? '',
    hasText: src.hasText,
    aiSummary: src.aiSummary,
    sourceRef,
  });
  notifyChange(userId, 'materials', 'create', m.toJSON());
  return m;
}
