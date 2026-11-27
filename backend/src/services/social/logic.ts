/**
 * Logic thuần (không đụng DB) cho streak, phòng học chung, kế hoạch ngày thi – dễ viết test.
 */

/* ---------------- Streak ---------------- */

/** days: [hôm nay, hôm qua, …] (YYYY-MM-DD). Ngày "đạt" = học đủ phút hoặc đã dùng thẻ đóng băng. */
export function computeStreak(days: string[], qualified: Set<string>, frozen: Set<string>) {
  const ok = (d: string) => qualified.has(d) || frozen.has(d);
  let current = 0;
  let i = qualified.has(days[0]) ? 0 : 1; // hôm nay chưa học thì chưa làm đứt chuỗi
  for (; i < days.length && ok(days[i]); i++) current++;
  let best = 0;
  let run = 0;
  for (const d of [...days].reverse()) {
    run = ok(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best, todayDone: qualified.has(days[0]) };
}

/**
 * Ngày cần dùng thẻ đóng băng để giữ chuỗi: các ngày bị lỡ liền nhau tính từ hôm qua về trước,
 * nếu số ngày lỡ ≤ số thẻ đang có và trước đó là một chuỗi đang có.
 */
export function daysToFreeze(days: string[], qualified: Set<string>, frozen: Set<string>, freezes: number): string[] {
  const ok = (d: string) => qualified.has(d) || frozen.has(d);
  const missed: string[] = [];
  let i = 1;
  for (; i < days.length && !ok(days[i]); i++) missed.push(days[i]);
  if (!missed.length || missed.length > freezes) return [];
  return i < days.length && ok(days[i]) ? missed : [];
}

/** Mỗi 7 ngày liên tiếp được 1 thẻ đóng băng, giữ tối đa 2 */
export function freezeReward(current: number, lastRewardStreak: number, freezes: number) {
  if (current < lastRewardStreak) lastRewardStreak = 0; // chuỗi đã đứt -> tính lại mốc
  let earned = 0;
  while (current >= lastRewardStreak + 7) {
    lastRewardStreak += 7;
    if (freezes + earned < 2) earned++;
  }
  return { freezes: freezes + earned, lastRewardStreak, earned };
}

export const levelOf = (xp: number) => {
  // cấp n cần 50·n·(n+1)/2 XP: 50, 150, 300, 500…
  let lvl = 1;
  while (xp >= (50 * lvl * (lvl + 1)) / 2) lvl++;
  const prev = (50 * (lvl - 1) * lvl) / 2;
  const next = (50 * lvl * (lvl + 1)) / 2;
  return { level: lvl, into: xp - prev, need: next - prev };
};

/* ---------------- Phòng học chung: đồng hồ Pomodoro dùng chung ---------------- */

export function roomPhase(runningSince: Date | string | null | undefined, focusMin: number, breakMin: number, now = new Date()) {
  if (!runningSince) return { phase: 'idle' as const, remainingSec: focusMin * 60, round: 0, endsAt: null as string | null };
  const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(runningSince).getTime()) / 1000));
  const cycle = (focusMin + breakMin) * 60;
  const round = Math.floor(elapsed / cycle) + 1;
  const pos = elapsed % cycle;
  const inFocus = pos < focusMin * 60;
  const remainingSec = inFocus ? focusMin * 60 - pos : cycle - pos;
  return { phase: inFocus ? ('focus' as const) : ('break' as const), remainingSec, round, endsAt: new Date(now.getTime() + remainingSec * 1000).toISOString() };
}

/* ---------------- Kế hoạch đếm ngược tới ngày thi ---------------- */

export interface PlanTopic {
  id: string;
  title: string;
  minutes: number;
  done: boolean;
}
export interface PlanDay {
  date: string;
  minutes: number;
  items: { kind: 'topic' | 'review' | 'cards' | 'mock'; title: string; minutes: number; topicId?: string }[];
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/**
 * Chia các chủ đề chưa xong ngược từ ngày thi về hôm nay.
 * - Ngày cuối trước thi dành cho ôn tổng + đề thử.
 * - Mỗi ngày không vượt dailyCap; nếu không kịp thì dồn đều và báo "quá tải".
 * - Học chậm hơn kế hoạch (behindMinutes) -> chia phần thiếu vào các ngày còn lại.
 * - Thẻ sắp quên được thêm vào hôm nay.
 */
export function buildExamPlan(opts: {
  today: string;
  examDate: string;
  topics: PlanTopic[];
  dailyCap: number;
  forgettingCards?: number;
  /** số phút đã thực học cho môn này từ khi lập kế hoạch – trừ dần vào các chủ đề chưa xong */
  creditMinutes?: number;
}) {
  const daysLeft = daysBetween(opts.today, opts.examDate);
  let credit = Math.max(0, opts.creditMinutes ?? 0);
  const remaining = opts.topics
    .filter((t) => !t.done)
    .map((t) => {
      const used = Math.min(credit, t.minutes);
      credit -= used;
      return { ...t, minutes: t.minutes - used };
    })
    .filter((t) => t.minutes > 0);
  const total = opts.topics.reduce((a, t) => a + t.minutes, 0);
  const left = remaining.reduce((a, t) => a + t.minutes, 0);
  if (daysLeft < 0) return { daysLeft, days: [] as PlanDay[], perDay: 0, overloaded: false, progress: total ? 1 - left / total : 0, leftMinutes: left };

  const studyDays = Math.max(1, daysLeft - 1); // chừa ngày cuối để ôn tổng (nếu còn ≥ 2 ngày)
  const reviewDay = daysLeft >= 2;
  const perDay = Math.ceil(left / (reviewDay ? studyDays : Math.max(1, daysLeft)));
  const overloaded = perDay > opts.dailyCap;
  const days: PlanDay[] = [];
  const queue = remaining.map((t) => ({ ...t, left: t.minutes }));
  const slots = reviewDay ? studyDays : Math.max(1, daysLeft);
  for (let d = 0; d < slots; d++) {
    const date = addDays(opts.today, d);
    const budget = Math.max(15, Math.ceil(queue.reduce((a, t) => a + t.left, 0) / (slots - d)));
    const day: PlanDay = { date, minutes: 0, items: [] };
    let room = budget;
    while (room > 0 && queue.length) {
      const t = queue[0];
      const take = Math.min(t.left, room);
      day.items.push({ kind: 'topic', title: t.title, minutes: take, topicId: t.id });
      day.minutes += take;
      t.left -= take;
      room -= take;
      if (t.left <= 0) queue.shift();
    }
    // ôn lại chủ đề đã học 2 ngày trước (lặp lại ngắt quãng nhẹ)
    const prev = days[d - 2]?.items.find((i) => i.kind === 'topic');
    if (prev) {
      day.items.push({ kind: 'review', title: `Ôn lại: ${prev.title}`, minutes: 10 });
      day.minutes += 10;
    }
    days.push(day);
  }
  if (opts.forgettingCards && days[0]) {
    const m = Math.min(30, Math.max(5, Math.ceil(opts.forgettingCards / 4)));
    days[0].items.unshift({ kind: 'cards', title: `Ôn ${opts.forgettingCards} thẻ sắp quên`, minutes: m });
    days[0].minutes += m;
  }
  if (reviewDay) {
    days.push({
      date: addDays(opts.examDate, -1),
      minutes: Math.min(opts.dailyCap, 90),
      items: [
        { kind: 'mock', title: 'Làm đề thử / bộ câu hỏi tổng hợp', minutes: 45 },
        { kind: 'review', title: 'Ôn tổng các ý chính + công thức', minutes: Math.min(opts.dailyCap, 90) - 45 },
      ],
    });
  }
  return { daysLeft, days, perDay, overloaded, progress: total ? 1 - left / total : 0, leftMinutes: left };
}

/** Mã ngắn dễ đọc (bỏ 0/O/1/I) */
export function shortCode(len = 6) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
