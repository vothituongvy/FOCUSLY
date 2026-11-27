/**
 * FOCUSLY Brain – Huấn luyện viên học tập: đề xuất, kế hoạch 7 ngày, phân tích tuần, phản hồi phần tự ghi nhớ.
 * Kết hợp số liệu học tập (analytics), luật sư phạm (insights) và model dự báo tập trung (forecast).
 */
import type { Insight } from '../analytics';
import type { Forecast } from './forecast';
import { isVietnamese, keyphrases, terms } from './text';

type Metrics = {
  plannedMinutes: number;
  actualFocusMinutes: number;
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
  quizAttempts: number;
  quizAccuracy: number | null;
};

export interface CoachInput {
  today: string; // YYYY-MM-DD theo múi giờ người dùng
  dailyTargetMinutes: number;
  metrics: Metrics;
  previous: Metrics;
  bySubject: { subjectId: string; name: string; focusMinutes: number; quizAccuracy: number | null; tasksDone: number; tasksTotal: number }[];
  insights: Insight[];
  forecast: Forecast;
  dueCards: number;
  tasks: { id: string; title: string; subjectId: string | null; subject: string | null; deadline: Date | null; estimatedMinutes: number; priority: string }[];
}

const PRIO: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function recommendations(c: CoachInput) {
  const m = c.metrics;
  const days = 7;
  const avgPerDay = Math.round(m.actualFocusMinutes / days);
  const f = c.forecast;

  /* ---------- nhận xét ---------- */
  const parts: string[] = [];
  parts.push(`7 ngày qua bạn tập trung ${m.actualFocusMinutes} phút (${avgPerDay} phút/ngày) so với mục tiêu ${c.dailyTargetMinutes} phút/ngày.`);
  if (m.completionRate != null) parts.push(`Hoàn thành ${pct(m.completionRate)} nhiệm vụ đã lên kế hoạch.`);
  if (f.trained) parts.push(`Khả năng giữ tập trung cao nhất của bạn vào khoảng ${f.bestHours.map((b) => `${b.hour}h`).join(', ')}.`);
  const summary = parts.join(' ');

  /* ---------- đề xuất ---------- */
  const recs: { title: string; reason: string }[] = [];
  if (f.trained && f.bestHours[0]) {
    recs.push({ title: `Học môn khó vào ${f.bestHours[0].hour}h`, reason: `Model dự báo khả năng giữ tập trung lúc này là ${pct(f.bestHours[0].probability)}, cao nhất trong ngày của bạn.` });
  }
  if (f.trained && Math.abs(f.suggestedMinutes - f.typicalMinutes) >= 10) {
    recs.push({ title: `Đổi độ dài phiên sang ~${f.suggestedMinutes} phút`, reason: `Bạn hay học phiên ${f.typicalMinutes} phút, nhưng số liệu cho thấy phiên ${f.suggestedMinutes} phút cho nhiều phút tập trung thực tế hơn.` });
  }
  if (avgPerDay < c.dailyTargetMinutes * 0.7) {
    recs.push({ title: 'Chia nhỏ mục tiêu ngày', reason: `Bạn đạt khoảng ${Math.round((avgPerDay / Math.max(1, c.dailyTargetMinutes)) * 100)}% mục tiêu. Thử 2 phiên ngắn cố định mỗi ngày thay vì một phiên dài.` });
  }
  if ((m.distractionsPerHour ?? 0) > 3) {
    recs.push({ title: 'Giảm phân tâm', reason: `Trung bình ${m.distractionsPerHour} lần phân tâm/giờ. Bật Focus Shield và để điện thoại xa bàn học.` });
  }
  const weak = c.bySubject.filter((s) => s.quizAccuracy != null && s.quizAccuracy < 0.7).sort((a, b) => (a.quizAccuracy ?? 1) - (b.quizAccuracy ?? 1))[0];
  if (weak) recs.push({ title: `Ôn lại ${weak.name}`, reason: `Độ chính xác kiểm tra môn này là ${pct(weak.quizAccuracy)}. Làm lại câu sai và chuyển chúng thành flashcard.` });
  if (c.dueCards >= 10) recs.push({ title: `Ôn ${c.dueCards} flashcard đến hạn`, reason: 'Ôn đúng hạn giúp nhớ lâu hơn nhiều so với ôn dồn.' });
  for (const i of c.insights) {
    if (recs.length >= 5) break;
    if (i.kind !== 'praise' && !recs.some((r) => r.title === i.title)) recs.push({ title: i.title, reason: i.detail });
  }
  if (!recs.length) recs.push({ title: 'Giữ nhịp hiện tại', reason: 'Các chỉ số đang ổn định. Tiếp tục học đều mỗi ngày vào khung giờ quen thuộc.' });

  /* ---------- kế hoạch 7 ngày ---------- */
  // bắt đầu ở giờ tốt nhất model dự báo; các mục trong ngày xếp nối tiếp, nghỉ 10 phút giữa các mục
  const startHour = f.bestHours[0]?.hour ?? 19;
  const queue = [...c.tasks].sort((a, b) => {
    const da = a.deadline ? +a.deadline : Infinity;
    const db = b.deadline ? +b.deadline : Infinity;
    return da - db || (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2);
  });
  const plan: { date: string; title: string; subject: string | null; subjectId: string | null; estimatedMinutes: number; taskId: string | null; timeOfDay: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(c.today, d);
    let left = c.dailyTargetMinutes;
    let clock = startHour * 60;
    const add = (title: string, minutes: number, extra: { subject?: string | null; subjectId?: string | null; taskId?: string | null } = {}) => {
      plan.push({ date, title, subject: extra.subject ?? null, subjectId: extra.subjectId ?? null, estimatedMinutes: minutes, taskId: extra.taskId ?? null, timeOfDay: hm(clock) });
      clock += minutes + 10;
      left -= minutes;
    };
    // khởi động bằng ôn flashcard đến hạn (việc nhẹ, vào guồng nhanh)
    if (c.dueCards > 0) add('Ôn flashcard đến hạn', 15);
    let added = 0;
    while (left >= 15 && queue.length && added < 3) {
      const t = queue.shift()!;
      add(t.title, Math.min(Math.max(15, t.estimatedMinutes || 30), Math.max(15, left)), { subject: t.subject, subjectId: t.subjectId, taskId: t.id });
      added++;
    }
    if (weak && d % 3 === 1 && left >= 20) add(`Ôn câu sai môn ${weak.name}`, 25, { subject: weak.name, subjectId: weak.subjectId });
  }
  return { summary, recommendations: recs.slice(0, 5), plan: plan.slice(0, 21) };
}

/* ---------- Phân tích kết quả tuần (Markdown) ---------- */
export function performanceReport(c: CoachInput, range: 'week' | 'month') {
  const m = c.metrics;
  const p = c.previous;
  const trend = (a: number | null, b: number | null, higherBetter = true) => {
    if (a == null || b == null || b === 0) return '';
    const d = (a - b) / b;
    if (Math.abs(d) < 0.05) return ' (giữ nguyên)';
    const up = d > 0;
    return ` (${up ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}% so với kỳ trước${up === higherBetter ? ' 👍' : ''})`;
  };
  const strengths: string[] = [];
  const improve: string[] = [];
  const focusRatio = m.plannedMinutes ? m.actualFocusMinutes / m.plannedMinutes : null;
  if (focusRatio != null && focusRatio >= 0.8) strengths.push(`Bám sát kế hoạch: tập trung thực tế đạt ${pct(focusRatio)} thời gian dự kiến.`);
  else if (focusRatio != null) improve.push(`Tập trung thực tế mới đạt ${pct(focusRatio)} thời gian dự kiến – kế hoạch đang hơi tham.`);
  if ((m.completionRate ?? 0) >= 0.7) strengths.push(`Hoàn thành ${pct(m.completionRate)} nhiệm vụ.`);
  else if (m.completionRate != null) improve.push(`Tỉ lệ hoàn thành nhiệm vụ ${pct(m.completionRate)} – chia nhiệm vụ nhỏ hơn (25–50 phút).`);
  if (m.distractionsPerHour != null && m.distractionsPerHour <= 2) strengths.push(`Ít phân tâm: ${m.distractionsPerHour} lần/giờ.`);
  else if (m.distractionsPerHour != null) improve.push(`Phân tâm ${m.distractionsPerHour} lần/giờ – nên bật Focus Shield và cất điện thoại.`);
  if ((m.quizAccuracy ?? 0) >= 0.8) strengths.push(`Kiểm tra đạt độ chính xác ${pct(m.quizAccuracy)}.`);
  else if (m.quizAccuracy != null) improve.push(`Độ chính xác kiểm tra ${pct(m.quizAccuracy)} – ôn lại câu sai trước khi học bài mới.`);
  if (m.abandonedSessions > m.completedSessions && m.sessionCount >= 3) improve.push(`${m.abandonedSessions} phiên bị huỷ giữa chừng – thử phiên ngắn hơn.`);
  if (p.actualFocusMinutes && m.actualFocusMinutes > p.actualFocusMinutes * 1.05) strengths.push(`Tập trung nhiều hơn kỳ trước ${m.actualFocusMinutes - p.actualFocusMinutes} phút.`);
  if (p.distractionsPerHour != null && m.distractionsPerHour != null && m.distractionsPerHour < p.distractionsPerHour * 0.95) strengths.push('Ít phân tâm hơn kỳ trước.');
  if (p.quizAccuracy != null && m.quizAccuracy != null && m.quizAccuracy > p.quizAccuracy + 0.03) strengths.push(`Kết quả kiểm tra tiến bộ: ${pct(p.quizAccuracy)} → ${pct(m.quizAccuracy)}.`);
  if (!strengths.length) strengths.push('Bạn đã bắt đầu ghi lại việc học – đó là bước quan trọng nhất.');
  if (!improve.length) improve.push('Không có điểm yếu rõ rệt. Hãy tăng dần mục tiêu ngày thêm 10–15 phút.');

  const actions: string[] = [];
  if (c.forecast.trained && c.forecast.bestHours[0]) actions.push(`Đặt nhắc học lúc ${c.forecast.bestHours[0].hour}h mỗi ngày – khung giờ bạn tập trung tốt nhất.`);
  actions.push(`Học ${c.forecast.suggestedMinutes} phút mỗi phiên, nghỉ 5 phút giữa các phiên.`);
  if (c.dueCards) actions.push(`Ôn ${c.dueCards} flashcard đến hạn, mỗi ngày 10–15 phút.`);
  else actions.push('Sau mỗi phiên, viết lại 3 ý vừa học (Active Recall).');
  if (actions.length < 3) actions.push('Lên kế hoạch cho ngày mai trước khi đi ngủ.');

  const label = range === 'week' ? 'tuần' : 'tháng';
  return [
    `## Tổng quan ${label}`,
    `- Thời gian dự kiến: **${m.plannedMinutes} phút**`,
    `- Tập trung thực tế: **${m.actualFocusMinutes} phút**${trend(m.actualFocusMinutes, p.actualFocusMinutes)}`,
    `- Phân tâm: **${m.distractionCount} lần** (${m.distractionsPerHour ?? '—'}/giờ)${trend(m.distractionsPerHour, p.distractionsPerHour, false)}`,
    `- Hoàn thành nhiệm vụ: **${m.tasksDone}/${m.tasksTotal}** (${pct(m.completionRate)})`,
    `- Kiểm tra: **${m.quizAttempts} bài**, chính xác ${pct(m.quizAccuracy)}${trend(m.quizAccuracy, p.quizAccuracy)}`,
    '',
    '## Điểm mạnh',
    ...strengths.map((s) => `- ${s}`),
    '',
    '## Cần cải thiện',
    ...improve.map((s) => `- ${s}`),
    '',
    `## 3 việc cho ${label} tới`,
    ...actions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`),
    '',
    '_Phân tích bởi FOCUSLY Brain từ số liệu học tập của bạn._',
  ].join('\n');
}

/* ---------- Phản hồi phần tự ghi nhớ (Active Recall) ---------- */
export function recallFeedback(recall: string, reference: string, goal = '') {
  const vi = isVietnamese(recall + reference + goal) || !reference;
  const source = reference || goal;
  if (!source.trim()) {
    const n = terms(recall).length;
    return vi
      ? `Bạn đã ghi lại ${n} ý/từ khoá. Để nhận phản hồi chi tiết hơn, hãy gắn phiên học với một nhiệm vụ hoặc tài liệu có nội dung.\n\n**Tự kiểm tra:** đọc lại ghi chú và thử giải thích cho người khác trong 1 phút.`
      : `You wrote down ${n} ideas. Link the session to a task or material for more detailed feedback.`;
  }
  const keys = keyphrases(source, 15);
  const low = recall.toLowerCase();
  const covered = keys.filter((k) => low.includes(k.key) || k.key.split(' ').every((w) => low.includes(w)));
  const missing = keys.filter((k) => !covered.includes(k)).slice(0, 5);
  const ratio = keys.length ? covered.length / keys.length : 0;
  const grade = ratio >= 0.6 ? 'Rất tốt' : ratio >= 0.35 ? 'Khá' : 'Cần ôn thêm';
  return [
    `**${grade}** – bạn nhắc đến ${covered.length}/${keys.length} ý quan trọng của bài.`,
    '',
    covered.length ? `**Đã nắm:** ${covered.slice(0, 6).map((k) => k.text).join(', ')}.` : '**Đã nắm:** chưa thấy khái niệm chính nào – thử viết cụ thể hơn.',
    missing.length ? `**Còn thiếu:** ${missing.map((k) => k.text).join(', ')}.` : '',
    '',
    '**Tự kiểm tra tiếp:**',
    ...missing.slice(0, 2).map((k, i) => `${i + 1}. ${k.text[0].toUpperCase() + k.text.slice(1)} là gì và liên quan thế nào đến bài học?`),
    missing.length < 2 ? `${missing.length + 1}. Tóm tắt bài học trong 3 câu, không nhìn tài liệu.` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
