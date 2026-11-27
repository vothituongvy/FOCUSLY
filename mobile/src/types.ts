import { tr } from './i18n';
// Bản sao kiểu dữ liệu dùng chung với web/src/lib/types.ts
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type SessionStatus = 'active' | 'paused' | 'on_break' | 'completed' | 'abandoned';
export type DistractionReason =
  | 'social_media'
  | 'notification'
  | 'message'
  | 'too_difficult'
  | 'tired'
  | 'other_task'
  | 'environment'
  | 'left_app'
  | 'blocked_site'
  | 'other';

export interface Pomodoro {
  focusMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  completedCycles?: number;
}

export interface FocusScheduleItem {
  _id?: string;
  days: number[];
  start: string;
  end: string;
  enabled: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  googleId?: string;
  hasPassword?: boolean;
  profile: {
    learningGoal: string;
    interestedSubjects: string[];
    preferredStudyTimes: { start: string; end: string }[];
    dailyTargetMinutes: number;
    timezone: string;
    language: 'vi' | 'en';
    defaultPomodoro: Pomodoro;
  };
  shield: {
    blockList: string[];
    autoEnableOnSession: boolean;
    allowList: string[];
    strictByDefault: boolean;
    hideDistractions: boolean;
    schedule: FocusScheduleItem[];
  };
  createdAt: string;
}

interface Base {
  id: string;
  clientId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Subject extends Base {
  name: string;
  description: string;
  color: string;
  icon: string;
  archived: boolean;
}

export interface Course extends Base {
  subject: string;
  name: string;
  description: string;
  order: number;
}

export interface Goal extends Base {
  subject: string | null;
  title: string;
  description: string;
  targetDate: string | null;
  status: 'active' | 'achieved' | 'abandoned';
}

export interface Recurrence {
  freq: 'none' | 'daily' | 'weekly' | 'monthly';
  interval: number;
  daysOfWeek: number[];
  until: string | null;
}

export interface Task extends Base {
  subject: string | null;
  course: string | null;
  goal: string | null;
  title: string;
  description: string;
  expectedOutcome: string;
  estimatedMinutes: number;
  actualFocusSeconds: number;
  priority: Priority;
  status: TaskStatus;
  scheduledDate: string | null;
  deadline: string | null;
  remindAt?: string | null;
  completedAt: string | null;
  recurrence: Recurrence;
}

export interface Segment {
  type: 'focus' | 'break';
  startedAt: string;
  endedAt: string | null;
  endReason?: string | null;
}

export interface FocusSession extends Base {
  subject: string | null | { id?: string; _id?: string; name: string; color: string; icon: string };
  task: string | null | { id?: string; _id?: string; title: string };
  goal: string;
  mode: 'pomodoro' | 'custom' | 'free';
  plannedMinutes: number;
  pomodoro: Pomodoro;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  segments: Segment[];
  actualFocusSeconds: number;
  breakSeconds: number;
  pauseCount: number;
  distractionCount: number;
  appLeaveCount: number;
  shieldEnabled: boolean;
  strict?: boolean;
  device: 'web' | 'android' | 'ios' | 'unknown';
  autoPausedAt: string | null;
  summary: { goalAchieved: boolean | null; rating: number | null; note: string };
  // chỉ có trong response "view"
  focusSecondsNow?: number;
  breakSecondsNow?: number;
  currentSegment?: Segment | null;
  serverTime?: string;
}

export interface Distraction extends Base {
  session: string | null;
  subject: string | null;
  task: string | null;
  reason: DistractionReason;
  category: 'digital' | 'internal' | 'external';
  note: string;
  occurredAt: string;
  minuteIntoSession: number | null;
  durationSeconds: number | null;
  source: 'manual' | 'auto';
}

export interface Dashboard {
  date: string;
  dailyGoal: { targetMinutes: number; focusMinutes: number; ratio: number };
  studyTime: { todaySeconds: number; todaySessions: number };
  tasks: { completed: number; total: number; overdue: number };
  upcomingTasks: (Omit<Task, 'subject'> & { subject: Subject | null })[];
  streak: { current: number; best: number; minMinutesPerDay: number };
  weeklyProgress: { date: string; focusMinutes: number; sessions: number }[];
  distractionsToday: { manual: number; appLeaves: number };
  focusScore: { score: number; isReference: boolean; breakdown: { key: string; label: string; weight: number; value: number }[]; note: string };
  recentActivities: { type: string; at: string; title: string; refId: string }[];
  activeSession: FocusSession | null;
}

export interface DistractionStats {
  days: number;
  total: number;
  manualCount: number;
  autoCount: number;
  perFocusHour: number | null;
  medianMinuteIntoSession: number | null;
  byReason: { reason: DistractionReason; label: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byHour: { hour: number; count: number }[];
  bySubject: { subjectId: string | null; name: string; count: number; medianMinuteIntoSession: number | null }[];
  trend: { date: string; count: number; focusMinutes: number }[];
  insights: string[];
}

export interface ShieldState {
  active: boolean;
  reason: 'session' | 'schedule' | null;
  blockList: string[];
  allowList: string[];
  strict: boolean;
  hideDistractions: boolean;
  session: { id: string; status: SessionStatus; goal: string; device: string; shieldEnabled: boolean; startedAt: string } | null;
}

export const REASONS: { value: DistractionReason; label: string; icon: string }[] = [
  { value: 'social_media', label: tr('Mạng xã hội'), icon: '' },
  { value: 'notification', label: tr('Thông báo'), icon: '' },
  { value: 'message', label: tr('Tin nhắn'), icon: '' },
  { value: 'too_difficult', label: tr('Nội dung quá khó'), icon: '' },
  { value: 'tired', label: tr('Mệt mỏi, buồn ngủ'), icon: '' },
  { value: 'other_task', label: tr('Muốn làm việc khác'), icon: '' },
  { value: 'environment', label: tr('Môi trường xung quanh'), icon: '' },
  { value: 'other', label: tr('Khác'), icon: '' },
];

export const REASON_LABEL: Record<DistractionReason, string> = {
  ...Object.fromEntries(REASONS.map((r) => [r.value, r.label])),
  left_app: tr('Rời ứng dụng/tab'),
  blocked_site: tr('Cố mở trang bị chặn'),
} as Record<DistractionReason, string>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: tr('Thấp'),
  medium: tr('Trung bình'),
  high: 'Cao',
  urgent: tr('Khẩn cấp'),
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: tr('Cần làm'),
  in_progress: tr('Đang học'),
  done: tr('Hoàn thành'),
  cancelled: tr('Đã huỷ'),
};

/* ======================= PHASE 2 ======================= */
export interface Material extends Base {
  subject: string | null;
  course: string | null;
  title: string;
  description: string;
  category: string;
  tags: string[];
  type: 'pdf' | 'image' | 'text' | 'link' | 'document';
  url: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
  hasText: boolean;
  bookmarked: boolean;
  lastOpenedAt: string | null;
  progress: { page: number; totalPages: number; percent: number };
  aiSummary: string;
  aiSummaryAt: string | null;
  snippet?: string;
}

export interface MaterialNote extends Base {
  material: string;
  kind: 'note' | 'highlight' | 'bookmark';
  page: number | null;
  quote: string;
  content: string;
  color: string;
}

export interface Deck extends Base {
  subject: string | null;
  material: string | null;
  title: string;
  description: string;
  color: string;
}

export interface DeckStats extends Deck {
  total: number;
  due: number;
  new: number;
  learning: number;
  young: number;
  mature: number;
}

export interface Card extends Base {
  deck: string;
  front: string;
  back: string;
  hint: string;
  tags: string[];
  source: 'manual' | 'ai' | 'quiz_mistake';
  suspended: boolean;
  srs: { ease: number; interval: number; repetitions: number; lapses: number; due: string; lastReviewedAt: string | null };
}

export type QuestionType = 'mcq' | 'multi' | 'true_false' | 'short';
export interface Question {
  qid?: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex?: number | null;
  correctIndexes?: number[];
  correctBoolean?: boolean | null;
  /** cách AI tạo câu – để chấm 👍/👎 */
  origin?: string;
  acceptedAnswers: string[];
  explanation?: string;
}

export interface Quiz extends Base {
  subject: string | null;
  material: string | null;
  task: string | null;
  title: string;
  description: string;
  questions: Question[];
  source: 'manual' | 'ai';
  timeLimitMinutes: number;
}

export interface QuizAttempt extends Base {
  quiz: string | { id?: string; _id?: string; title: string };
  score: number;
  total: number;
  accuracy: number;
  durationSeconds: number;
  completedAt: string;
  answers: { qid: string; answer: unknown; correct: boolean; prompt: string; correctAnswer: string; explanation: string }[];
}

export interface Mistake {
  key: string;
  quizId: string;
  quizTitle: string;
  qid: string;
  prompt: string;
  yourAnswer: unknown;
  correctAnswer: string;
  explanation: string;
  at: string;
}

export interface LearnOverview {
  dueTotal: number;
  cardTotal: number;
  reviewsToday: number;
  retention30d: number | null;
  reviewDays: { date: string; reviews: number }[];
  decks: DeckStats[];
  recentAttempts: QuizAttempt[];
  avgQuizAccuracy: number | null;
}

export interface AppNotification {
  id: string;
  type: 'study_reminder' | 'task_reminder' | 'break_reminder' | 'daily_summary' | 'review_due' | 'system';
  title: string;
  body: string;
  data: { link?: string; [k: string]: unknown };
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSettings {
  studyReminder: boolean;
  taskReminder: boolean;
  taskReminderMinutes: number;
  breakReminder: boolean;
  dailySummary: boolean;
  dailySummaryTime: string;
  reviewReminder: boolean;
  push: boolean;
  quietStart: string;
  quietEnd: string;
}

/* ======================= PHASE 3 ======================= */
export interface Metrics {
  plannedMinutes: number;
  actualFocusMinutes: number;
  studyMinutes: number;
  breakMinutes: number;
  sessionCount: number;
  completedSessions: number;
  abandonedSessions: number;
  avgSessionMinutes: number | null;
  distractionCount: number;
  appLeaveCount: number;
  distractionsPerHour: number | null;
  tasksTotal: number;
  tasksDone: number;
  completionRate: number | null;
  goalAchievedRate: number | null;
  quizAttempts: number;
  quizAccuracy: number | null;
  cardReviews: number;
  retention: number | null;
  recoveries: number;
  recoveryResumeRate: number | null;
}

export interface Analytics {
  range: 'day' | 'week' | 'month';
  from: string;
  to: string;
  metrics: Metrics;
  previous: Metrics;
  change: Record<'actualFocusMinutes' | 'completionRate' | 'distractionsPerHour' | 'quizAccuracy', number | null>;
  dailyTargetMinutes: number;
  series: { date: string; focusMinutes: number; plannedMinutes: number; distractions: number; tasksDone: number; quizAccuracy: number | null }[];
  bySubject: {
    subjectId: string;
    name: string;
    color: string;
    icon: string;
    focusMinutes: number;
    sessions: number;
    tasksDone: number;
    tasksTotal: number;
    quizAccuracy: number | null;
    distractions: number;
    distractionsPerHour: number | null;
  }[];
  byHour: { hour: number; focusMinutes: number; distractions: number }[];
  bestFocusTimes: { hour: number; focusMinutes: number; distractionsPerHour: number | null; quality: number }[];
  distractionReasons: { reason: DistractionReason; count: number }[];
}

export interface Insight {
  id: string;
  kind: 'praise' | 'tip' | 'warning';
  title: string;
  detail: string;
  metric?: string;
  action?: { label: string; link: string };
}

export interface Conversation {
  id: string;
  title: string;
  material: string | null;
  subject: string | null;
  messages?: { role: 'user' | 'assistant'; content: string; at: string; origin?: string; vote?: number; attachments?: { name: string; kind: string; uri?: string }[] }[];
  updatedAt: string;
}
