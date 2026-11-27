'use client';

import Link from 'next/link';
import { useResource } from '@/lib/hooks';
import { tr } from '@/lib/i18n';
import { Progress } from '@/components/ui';

export interface GamifyStatus {
  streak: { current: number; best: number; todayDone: boolean; minMinutesPerDay: number; frozenDays: string[]; usedFreeze: string[] };
  freezes: number;
  nextFreezeIn: number;
  quests: { id: string; title: string; progress: number; target: number; done: boolean; xp: number; link: string }[];
  allDoneBonus: number;
  xp: number;
  level: number;
  into: number;
  need: number;
}

/** Chuỗi ngày học + thẻ đóng băng + 3 nhiệm vụ hôm nay */
export function DailyQuests() {
  const g = useResource<GamifyStatus>('/social/gamify', ['sessions', 'tasks', 'cards', 'quizAttempts']).data;
  if (!g) return null;
  const doneCount = g.quests.filter((q) => q.done).length;
  return (
    <section className="card quests" aria-label={tr('Chuỗi ngày học và nhiệm vụ hôm nay')}>
      <div className="quests-head">
        <div className={`streak-flame ${g.streak.todayDone ? 'lit' : ''}`} title={tr('Học ít nhất {0} phút mỗi ngày để giữ chuỗi', g.streak.minMinutesPerDay)}>
          <span className="streak-num">{g.streak.current}</span>
          <span className="small">{tr('ngày liên tiếp')}</span>
        </div>
        <div className="grow col" style={{ gap: 4 }}>
          <div className="row between wrap">
            <b>
              {tr('Cấp {0}', g.level)} · {g.xp} XP
            </b>
            <span className="small muted" title={tr('Mỗi 7 ngày liên tiếp được tặng 1 thẻ, giữ tối đa 2. Lỡ một ngày, thẻ tự dùng để giữ chuỗi.')}>
              ❄ {tr('{0} thẻ đóng băng', g.freezes)}
              {g.freezes < 2 && ` · ${tr('thêm thẻ sau {0} ngày', g.nextFreezeIn)}`}
            </span>
          </div>
          <Progress value={g.need ? g.into / g.need : 0} />
          {g.streak.usedFreeze.length > 0 && <span className="small" style={{ color: 'var(--ink-2)' }}>❄ {tr('Đã dùng thẻ đóng băng để giữ chuỗi cho {0}.', g.streak.usedFreeze.join(', '))}</span>}
          {!g.streak.todayDone && g.streak.current > 0 && <span className="small muted">{tr('Học {0} phút hôm nay để nối dài chuỗi.', g.streak.minMinutesPerDay)}</span>}
        </div>
      </div>
      <div className="quest-list">
        {g.quests.map((q) => (
          <Link key={q.id} href={q.link} className={`quest ${q.done ? 'done' : ''}`}>
            <span className="quest-check" aria-hidden>
              {q.done ? '✓' : ''}
            </span>
            <span className="grow">
              <span className="quest-title">{questTitle(q.id, q.target)}</span>
              <span className="small muted tabular">
                {q.progress}/{q.target} · +{q.xp} XP
              </span>
            </span>
          </Link>
        ))}
      </div>
      <p className="small muted">{doneCount === g.quests.length ? tr('Xong cả 3 nhiệm vụ hôm nay – thưởng thêm {0} XP!', g.allDoneBonus) : tr('Xong cả 3 nhiệm vụ để được thêm {0} XP.', g.allDoneBonus)}</p>
    </section>
  );
}

export function questTitle(id: string, target: number) {
  if (id === 'focus') return tr('Tập trung {0} phút', target);
  if (id === 'cards') return tr('Ôn {0} flashcard', target);
  if (id === 'quiz') return tr('Làm {0} bộ câu hỏi', target);
  return tr('Hoàn thành {0} nhiệm vụ', target);
}
