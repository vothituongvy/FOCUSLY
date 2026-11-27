/**
 * FOCUSLY Brain – bộ AI tự xây của FOCUSLY, chạy ngay trong backend (miễn phí, không cần GPU / API key).
 *
 *  text.ts      xử lý văn bản: tách câu, từ khoá (RAKE), tìm kiếm (BM25), tóm tắt (TextRank)
 *  generate.ts  soạn flashcard, câu hỏi (trắc nghiệm, nhiều đáp án, đúng/sai, điền từ), tóm tắt, giải thích
 *  assistant.ts trợ lý hỏi đáp dựa trên dữ liệu & tài liệu của người dùng; dịch miễn phí
 *  forecast.ts  model hồi quy logistic dự báo khả năng giữ tập trung theo giờ, học riêng cho từng người
 *  coach.ts     đề xuất, kế hoạch 7 ngày, phân tích tuần, phản hồi Active Recall
 *
 * Bật Claude thay cho Brain: đặt AI_PROVIDER=claude và ANTHROPIC_API_KEY.
 */
import { llmReady } from '../ai';
import { MaterialModel } from '../../models/Learn';
import { bm25, sentences, type Doc } from './text';
import { lookup } from './wiki';
import { knowledgeArticle, learnArticle } from './knowledge';
export { searchKnowledge, knowledgeArticle, knowledgeStats } from './knowledge';
export { answerFromWiki, lookup as wikiLookup } from './wiki';

export { makeFlashcards, makeQuiz, makeSummary, explainFromText } from './generate';
export { answer, directAnswer, contextFor, translateFree } from './assistant';
export { lookupWord, formatEntry } from './dictionary';
export { recordFeedback, prefsFor, feedbackStats } from './feedback';
export { memoryForecast } from './memory';
export { forecastFor, clearForecast } from './forecast';
export { recommendations, performanceReport, recallFeedback, type CoachInput } from './coach';

/** true = dùng FOCUSLY Brain (mặc định); false = dùng Claude */
/** true = không có LLM nào dùng được -> chỉ FOCUSLY Brain; false = LLM trả lời trước, lỗi thì Brain thay */
export const useBrain = () => !llmReady();

/**
 * Chế độ Brain không "biết" kiến thức bên ngoài: với một chủ đề, gom các đoạn liên quan
 * trong tài liệu của chính người dùng để làm nguồn soạn câu hỏi / flashcard.
 */
export async function topicText(userId: string, topic: string): Promise<{ text: string; sources: string[] }> {
  const mats = await MaterialModel.find({ user: userId, deletedAt: null, hasText: true }).select('+textContent title').limit(40).lean();
  const docs: Doc[] = [];
  for (const m of mats) {
    sentences((m as { textContent?: string }).textContent ?? '', 25, 400)
      .slice(0, 2000)
      .forEach((s, i) => docs.push({ id: `${m._id}:${i}`, text: s, source: m.title }));
  }
  const hits = bm25(docs, topic);
  if (!hits.length || hits[0].score < 1.2) {
    // tài liệu của người dùng không có chủ đề này -> thư viện kiến thức chung -> Wikipedia trực tiếp
    const lib = await knowledgeArticle(topic).catch(() => null);
    if (lib) return { text: lib.text, sources: [`Thư viện FOCUSLY – ${lib.title}`] };
    const a = await lookup(topic);
    if (a) void learnArticle(a).catch(() => undefined);
    return a ? { text: a.text, sources: [`Wikipedia – ${a.title}`] } : { text: '', sources: [] };
  }
  const best = hits[0].score;
  const keep = hits.filter((h) => h.score >= best * 0.25).slice(0, 80);
  // giữ thứ tự gốc trong tài liệu để câu văn liền mạch
  keep.sort((a, b) => (a.doc.id < b.doc.id ? -1 : 1));
  return { text: keep.map((h) => h.doc.text).join('\n'), sources: [...new Set(keep.map((h) => h.doc.source ?? ''))] };
}
