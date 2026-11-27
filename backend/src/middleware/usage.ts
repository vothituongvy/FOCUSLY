import { RequestHandler } from 'express';
import { UsageDayModel } from '../models/Social';
import { verifyAccessToken } from '../services/tokens';
import { dayKey } from '../utils/time';

/**
 * Ghi nhận số liệu sử dụng: mỗi người dùng/ngày dùng những tính năng nào, trên nền tảng nào.
 * Chỉ ghi lần đầu trong ngày cho mỗi (người, tính năng) -> rất nhẹ, không lưu nội dung.
 */
const FEATURE: Record<string, string> = {
  sessions: 'focus', shield: 'focus', distractions: 'focus',
  tasks: 'plan', goals: 'plan', subjects: 'plan', courses: 'plan', exams: 'exam',
  decks: 'flashcards', cards: 'flashcards', reviews: 'flashcards', learn: 'learn',
  quizzes: 'quiz', 'quiz-attempts': 'quiz',
  materials: 'materials', 'material-notes': 'materials',
  ai: 'ai', analytics: 'analytics', dashboard: 'dashboard', insights: 'analytics',
  social: 'social', library: 'library', classes: 'classes', chats: 'chat',
  journal: 'journal', notifications: 'notifications',
};
const seen = new Set<string>();
let seenDay = '';

export const trackUsage: RequestHandler = (req, _res, next) => {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ') && req.method !== 'OPTIONS') {
    try {
      const p = verifyAccessToken(h.slice(7));
      const day = dayKey(new Date(), 'Asia/Ho_Chi_Minh');
      if (day !== seenDay) {
        seen.clear();
        seenDay = day;
      }
      const seg = req.path.split('/').filter(Boolean)[0] ?? '';
      const feature = FEATURE[seg] ?? 'other';
      const platform = p.plt ?? 'unknown';
      const key = `${p.sub}:${feature}:${platform}`;
      if (!seen.has(key)) {
        seen.add(key);
        void UsageDayModel.updateOne({ day, user: p.sub }, { $addToSet: { features: feature, platforms: platform } }, { upsert: true }).catch(() => seen.delete(key));
      }
    } catch {
      /* token không hợp lệ: bỏ qua, requireAuth sẽ xử lý */
    }
  }
  next();
};
