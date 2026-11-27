import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { jsonOptions, syncFields, syncable } from './common';

/* ======================================================================
 * PHASE 2 – Learning Experience
 * Materials · Notes/Highlights · Flashcards (SRS) · Quiz · Active Recall · Focus Recovery
 * ==================================================================== */

/* ---------- Learning Materials ---------- */
export const MATERIAL_TYPES = ['pdf', 'image', 'text', 'link', 'document'] as const;

const materialSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, default: 'Khác', trim: true, maxlength: 60 },
    tags: { type: [String], default: [] },
    type: { type: String, enum: MATERIAL_TYPES, required: true },
    url: { type: String, default: '' }, // file URL hoặc link ngoài
    storageId: { type: String, default: null, select: false },
    mimeType: { type: String, default: '' },
    sizeBytes: { type: Number, default: 0 },
    originalName: { type: String, default: '' },
    /** Nội dung văn bản (trích từ PDF/text) dùng cho tìm kiếm & AI – không trả về mặc định */
    textContent: { type: String, default: '', select: false },
    hasText: { type: Boolean, default: false },
    bookmarked: { type: Boolean, default: false },
    lastOpenedAt: { type: Date, default: null },
    progress: {
      page: { type: Number, default: 0 },
      totalPages: { type: Number, default: 0 },
      percent: { type: Number, default: 0, min: 0, max: 100 },
    },
    aiSummary: { type: String, default: '' },
    aiSummaryAt: { type: Date, default: null },
  },
  jsonOptions,
);
syncable(materialSchema);
materialSchema.index({ user: 1, lastOpenedAt: -1 });
materialSchema.index({ title: 'text', description: 'text', tags: 'text', textContent: 'text' }, { weights: { title: 10, tags: 5, description: 3, textContent: 1 }, default_language: 'none' });
export const MaterialModel = model('Material', materialSchema);
export type Material = InferSchemaType<typeof materialSchema>;

/* ---------- Notes / Highlights / Bookmarks trong tài liệu ---------- */
const materialNoteSchema = new Schema(
  {
    ...syncFields,
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    kind: { type: String, enum: ['note', 'highlight', 'bookmark'], default: 'note' },
    page: { type: Number, default: null },
    quote: { type: String, default: '', maxlength: 2000 }, // đoạn được highlight
    content: { type: String, default: '', maxlength: 5000 }, // ghi chú
    color: { type: String, default: '#fde68a' },
  },
  jsonOptions,
);
syncable(materialNoteSchema);
export const MaterialNoteModel = model('MaterialNote', materialNoteSchema);

/** Chia sẻ công khai (thư viện cộng đồng) + nguồn khi sao chép (thư viện / bài tập lớp) */
const publicFields = {
  isPublic: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
  authorName: { type: String, default: '' },
  copies: { type: Number, default: 0 },
  itemCount: { type: Number, default: 0 },
  /** "lib:<id>" khi lấy từ thư viện, "assign:<assignmentId>" khi là bài tập lớp */
  sourceRef: { type: String, default: '', index: true },
} as const;

/* ---------- Flashcards ---------- */
const deckSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    material: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 1000 },
    color: { type: String, default: '#6366f1' },
    ...publicFields,
  },
  jsonOptions,
);
syncable(deckSchema);
deckSchema.index({ isPublic: 1, copies: -1 });
export const DeckModel = model('Deck', deckSchema);

const cardSchema = new Schema(
  {
    ...syncFields,
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', required: true, index: true },
    front: { type: String, required: true, maxlength: 2000 },
    back: { type: String, required: true, maxlength: 4000 },
    hint: { type: String, default: '', maxlength: 500 },
    tags: { type: [String], default: [] },
    source: { type: String, enum: ['manual', 'ai', 'quiz_mistake'], default: 'manual' },
    suspended: { type: Boolean, default: false },
    /** Trạng thái lặp lại ngắt quãng (SM-2) */
    srs: {
      ease: { type: Number, default: 2.5 },
      interval: { type: Number, default: 0 }, // ngày
      repetitions: { type: Number, default: 0 },
      lapses: { type: Number, default: 0 },
      due: { type: Date, default: Date.now },
      lastReviewedAt: { type: Date, default: null },
    },
  },
  jsonOptions,
);
syncable(cardSchema);
cardSchema.index({ user: 1, 'srs.due': 1 });
export const CardModel = model('Card', cardSchema);
export type CardDoc = HydratedDocument<InferSchemaType<typeof cardSchema>>;

const reviewLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    card: { type: Schema.Types.ObjectId, ref: 'Card', required: true },
    deck: { type: Schema.Types.ObjectId, ref: 'Deck', required: true },
    grade: { type: Number, min: 0, max: 5, required: true },
    intervalBefore: Number,
    intervalAfter: Number,
    easeAfter: Number,
    reviewedAt: { type: Date, default: Date.now },
    clientId: { type: String },
  },
  { versionKey: false },
);
reviewLogSchema.index({ user: 1, reviewedAt: -1 });
reviewLogSchema.index({ user: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });
export const ReviewLogModel = model('ReviewLog', reviewLogSchema);

/* ---------- Quiz ---------- */
// mcq: 1 đáp án đúng · multi: chọn TẤT CẢ đáp án đúng · true_false · short: tự gõ câu trả lời
export const QUESTION_TYPES = ['mcq', 'multi', 'true_false', 'short'] as const;

const questionSchema = new Schema(
  {
    qid: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    prompt: { type: String, required: true, maxlength: 2000 },
    options: { type: [String], default: [] }, // mcq
    correctIndex: { type: Number, default: null }, // mcq
    correctIndexes: { type: [Number], default: [] }, // multi
    correctBoolean: { type: Boolean, default: null }, // true_false
    acceptedAnswers: { type: [String], default: [] }, // short
    explanation: { type: String, default: '', maxlength: 2000 },
    origin: { type: String, default: '' }, // cách AI tạo câu (học từ 👍/👎)
  },
  { _id: false },
);

const quizSchema = new Schema(
  {
    ...syncFields,
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
    material: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    task: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    questions: { type: [questionSchema], default: [] },
    source: { type: String, enum: ['manual', 'ai'], default: 'manual' },
    timeLimitMinutes: { type: Number, default: 0 },
    ...publicFields,
  },
  jsonOptions,
);
syncable(quizSchema);
quizSchema.index({ isPublic: 1, copies: -1 });
export const QuizModel = model('Quiz', quizSchema);
export type QuizDoc = HydratedDocument<InferSchemaType<typeof quizSchema>>;

const attemptSchema = new Schema(
  {
    ...syncFields,
    quiz: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    session: { type: Schema.Types.ObjectId, ref: 'FocusSession', default: null },
    answers: [
      {
        _id: false,
        qid: String,
        answer: Schema.Types.Mixed,
        correct: Boolean,
        prompt: String,
        correctAnswer: String,
        explanation: String,
      },
    ],
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 }, // 0..1
    durationSeconds: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: Date.now },
  },
  jsonOptions,
);
syncable(attemptSchema);
attemptSchema.index({ user: 1, completedAt: -1 });
export const QuizAttemptModel = model('QuizAttempt', attemptSchema);

/* ---------- Active Recall (tự nhớ lại sau phiên) ---------- */
const recallSchema = new Schema(
  {
    ...syncFields,
    session: { type: Schema.Types.ObjectId, ref: 'FocusSession', default: null },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    prompt: { type: String, default: 'Hãy viết lại những gì bạn vừa học' },
    content: { type: String, required: true, maxlength: 10000 },
    selfRating: { type: Number, min: 1, max: 5, default: null },
    aiFeedback: { type: String, default: '' },
  },
  jsonOptions,
);
syncable(recallSchema);
export const RecallModel = model('Recall', recallSchema);

/* ---------- Focus Recovery ---------- */
export const RECOVERY_ACTIONS = ['breathing', 'goal_reminder', 'take_break', 'stretch'] as const;
const recoverySchema = new Schema(
  {
    ...syncFields,
    session: { type: Schema.Types.ObjectId, ref: 'FocusSession', default: null, index: true },
    distraction: { type: Schema.Types.ObjectId, ref: 'Distraction', default: null },
    trigger: { type: String, enum: ['manual', 'distraction', 'app_leave'], default: 'manual' },
    action: { type: String, enum: RECOVERY_ACTIONS, default: 'breathing' },
    outcome: { type: String, enum: ['resumed', 'ended', 'break'], default: 'resumed' },
    durationSeconds: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    device: { type: String, enum: ['web', 'android', 'ios', 'unknown'], default: 'web' },
  },
  jsonOptions,
);
syncable(recoverySchema);
export const RecoveryModel = model('Recovery', recoverySchema);
