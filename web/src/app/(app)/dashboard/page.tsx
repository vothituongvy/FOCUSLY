'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNow, useResource } from '@/lib/hooks';
import { fmtDate, fmtRelative, WEEKDAYS_VI } from '@/lib/format';
import { PRIORITY_LABEL, type Dashboard, type FocusSession } from '@/lib/types';
import { Icon, type IconName } from '@/components/Icon';
import { Empty, Spinner } from '@/components/ui';
import { LOCALE, tr } from '@/lib/i18n';

/** Lời mời xem hướng dẫn cho người mới, ẩn được và nhớ trên trình duyệt này */
function GuideHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem('focusly.guideHint') !== 'off');
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  const hide = () => {
    setShow(false);
    try {
      localStorage.setItem('focusly.guideHint', 'off');
    } catch {
      /* bỏ qua */
    }
  };
  return (
    <div className="banner info" role="note">
      <Icon name="help" size={18} />
      <span className="grow">{tr('Mới dùng FOCUSLY? Xem hướng dẫn 3 bước để bắt đầu phiên học đầu tiên.')}</span>
      <Link href="/guide" className="btn sm" onClick={hide}>
        {tr('Xem hướng dẫn')}
      </Link>
      <button className="icon-btn" onClick={hide} aria-label={tr('Ẩn gợi ý')}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

const ACTIVITY_ICON: Record<string, IconName> = {
  session_ended: 'check',
  session_started: 'play',
  task_done: 'check',
  distraction: 'zap',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return tr('Chào buổi sáng');
  if (h < 14) return tr('Chào buổi trưa');
  if (h < 18) return tr('Chào buổi chiều');
  return tr('Chào buổi tối');
}

/** "Thứ năm, 26 tháng 11" */
function todayLabel() {
  const s = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "1 giờ 25 phút" */
function spoken(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return tr('{0} phút', r);
  return r ? tr('{0} giờ {1} phút', h, r) : tr('{0} giờ', h);
}

/**
 * Thước kẻ của ngày: mỗi phiên tập trung là một vạch bút dạ quang
 * đặt đúng giờ bạn đã học. Khoảng nghỉ tô xám.
 */
function DayRuler({ sessions }: { sessions: FocusSession[] }) {
  const now = useNow(60_000);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const segs = sessions.flatMap((s) => s.segments.map((g) => ({ ...g, from: +new Date(g.startedAt), to: g.endedAt ? +new Date(g.endedAt) : now })));
  const firstHour = Math.min(6, ...segs.map((g) => new Date(g.from).getHours()));
  const from = +start + firstHour * 3600_000;
  const to = +start + 24 * 3600_000;
  const pos = (t: number) => `${Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100))}%`;
  const hours = Array.from({ length: 24 - firstHour + 1 }, (_, i) => firstHour + i);

  return (
    <div className="day-ruler" role="img" aria-label={tr('Các khoảng thời gian bạn đã tập trung hôm nay')}>
      {hours.map((h) => (
        <div key={h}>
          <div className={`tick ${h % 3 === 0 ? 'major' : ''}`} style={{ left: pos(+start + h * 3600_000), height: h % 3 === 0 ? 22 : 12 }} />
          {(h % 3 === 0 || h === firstHour) && h < 24 && (
            <span className={`tick-label ${h === firstHour ? 'first' : ''}`} style={{ left: pos(+start + h * 3600_000) }}>
              {h}h
            </span>
          )}
        </div>
      ))}
      {segs
        .filter((g) => g.to > from)
        .map((g, i) => (
          <div
            key={i}
            className={`block ${g.type === 'break' ? 'break' : ''}`}
            style={{ left: pos(g.from), width: `calc(${pos(g.to)} - ${pos(g.from)})` }}
            title={`${g.type === 'focus' ? tr('Tập trung') : tr('Nghỉ')} ${new Date(g.from).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}–${new Date(g.to).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`}
          />
        ))}
      <div className="now" style={{ left: pos(now) }} title={tr('Bây giờ')} />
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const { data, loading, error } = useResource<Dashboard>('/dashboard', ['sessions', 'tasks', 'distractions', 'user']);
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const today = useResource<{ items: FocusSession[] }>(`/sessions?from=${encodeURIComponent(todayStart)}&limit=100`, ['sessions']);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return null;

  const focusMin = data.studyTime.todaySeconds / 60;
  const target = data.dailyGoal.targetMinutes;
  const left = target - focusMin;
  const maxMinutes = Math.max(target, ...data.weeklyProgress.map((d) => d.focusMinutes), 1);
  const firstName = user?.name.split(' ').slice(-1)[0];

  const headline =
    focusMin < 1
      ? tr('Hôm nay bạn chưa có phiên học nào. Mục tiêu là {0}.', spoken(target))
      : left > 0
        ? tr('Hôm nay bạn đã tập trung {0}, còn {1} nữa là đạt mục tiêu.', spoken(focusMin), spoken(left))
        : tr('Hôm nay bạn đã tập trung {0}, vượt mục tiêu {1}.', spoken(focusMin), spoken(target));

  return (
    <div className="col" style={{ gap: 28 }}>
      <GuideHint />
      <header className="row between wrap" style={{ alignItems: 'flex-end', gap: 20 }}>
        <div style={{ maxWidth: 680 }}>
          <p className="muted small">{todayLabel()}</p>
          <h1 style={{ marginTop: 6 }}>
            {greeting()}, {firstName}.
          </h1>
          <p style={{ fontSize: 18, marginTop: 10, color: 'var(--ink-2)', lineHeight: 1.5 }}>{headline}</p>
        </div>
        {data.activeSession ? (
          <Link href="/focus" className="btn marker lg">
            <Icon name="focus" />{' '}{tr('Quay lại phiên đang mở')}
          </Link>
        ) : (
          <Link href="/focus" className="btn marker lg">
            <Icon name="play" size={16} />{' '}{tr('Bắt đầu tập trung')}
          </Link>
        )}
      </header>

      <section aria-label={tr('Thời gian tập trung hôm nay')}>
        <DayRuler sessions={today.data?.items ?? []} />
        {data.activeSession && data.activeSession.device !== 'web' && (
          <p className="small muted mt-8">{tr('Phiên hiện tại đang chạy trên điện thoại.')}</p>
        )}
      </section>

      <section className="metrics" aria-label={tr('Chỉ số hôm nay')}>
        <div>
          <div className="stat-label">{tr('Nhiệm vụ xong')}</div>
          <div className="stat-value">
            {data.tasks.completed}
            <span className="muted" style={{ fontSize: 18, fontWeight: 600 }}>/{data.tasks.total}</span>
          </div>
          {data.tasks.overdue > 0 && <div className="small" style={{ color: 'var(--stop)' }}>{tr('{0} việc quá hạn', data.tasks.overdue)}</div>}
        </div>
        <div>
          <div className="stat-label">{tr('Chuỗi ngày học')}</div>
          <div className="stat-value row" style={{ gap: 6 }}>
            {data.streak.current}
            <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>{tr('ngày')}</span>
          </div>
          <div className="small muted">{tr('Dài nhất {0} ngày', data.streak.best)}</div>
        </div>
        <div>
          <div className="stat-label">{tr('Lần phân tâm')}</div>
          <div className="stat-value">{data.distractionsToday.manual}</div>
          <div className="small muted">{tr('Rời app/tab {0} lần', data.distractionsToday.appLeaves)}</div>
        </div>
        <div title={data.focusScore.breakdown.map((b) => tr('{0}: {1}% (trọng số {2})', b.label, Math.round(b.value * 100), b.weight)).join('\n')}>
          <div className="stat-label">{tr('Điểm tập trung')}</div>
          <div className="stat-value">
            {data.focusScore.score}
            <span className="muted" style={{ fontSize: 18, fontWeight: 600 }}>/100</span>
          </div>
          <div className="small muted">{tr('Chỉ để tham khảo')}</div>
        </div>
      </section>

      <div className="grid grid-3-1" style={{ gap: 20 }}>
        <section className="card">
          <div className="card-title">
            <h3>{tr('Việc tiếp theo')}</h3>
            <Link href="/plan" className="small">
              {tr('Mở kế hoạch')}
            </Link>
          </div>
          {data.upcomingTasks.length === 0 ? (
            <Empty>
              {tr('Chưa có nhiệm vụ nào.')}{' '}<Link href="/plan">{tr('Thêm nhiệm vụ đầu tiên')}</Link>
            </Empty>
          ) : (
            <div className="list">
              {data.upcomingTasks.map((t) => {
                const overdue = t.deadline && new Date(t.deadline) < new Date();
                return (
                  <div className="list-item" key={t.id}>
                    <span className="dot" style={{ background: t.subject?.color ?? 'var(--rule-strong)' }} />
                    <div className="grow">
                      <div className="truncate" style={{ fontWeight: 600 }}>
                        {t.title}
                      </div>
                      <div className="small muted">
                        {t.subject ? `${t.subject.name}, ` : ''}
                        {tr('{0} phút', t.estimatedMinutes)}
                        {t.deadline && <span style={{ color: overdue ? 'var(--stop)' : undefined }}>{tr(', hạn {0}', fmtDate(t.deadline))}</span>}
                      </div>
                    </div>
                    {(t.priority === 'high' || t.priority === 'urgent') && <span className={`badge ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>}
                    <Link href={`/focus?task=${t.id}`} className="btn sm secondary" aria-label={tr('Học {0}', t.title)}>
                      <Icon name="play" size={12} />{' '}{tr('Học')}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h3>{tr('Bảy ngày qua')}</h3>
            <span className="small muted">{tr('Mục tiêu {0} phút', target)}</span>
          </div>
          <div className="bars" style={{ height: 160 }}>
            {data.weeklyProgress.map((d) => {
              const isToday = d.date === data.date;
              const wd = WEEKDAYS_VI[new Date(`${d.date}T12:00:00`).getDay()];
              return (
                <div className="bar-col" key={d.date} title={tr('{0} phút, {1} phiên', d.focusMinutes, d.sessions)}>
                  <span className="small muted tabular">{d.focusMinutes || ''}</span>
                  <div className={`bar ${isToday ? 'today' : d.focusMinutes < target ? 'under' : ''}`} style={{ height: `${(d.focusMinutes / maxMinutes) * 100}%` }} />
                  <span className="small" style={{ fontWeight: isToday ? 800 : 500 }}>
                    {wd}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="small muted mt-8">{tr('Cột vàng là ngày đạt mục tiêu.')}</p>
        </section>
      </div>

      <section>
        <h3 style={{ marginBottom: 6 }}>{tr('Gần đây')}</h3>
        {data.recentActivities.length === 0 ? (
          <p className="muted small">{tr('Các phiên học, nhiệm vụ đã xong và lần phân tâm sẽ hiện ở đây.')}</p>
        ) : (
          <div className="list" style={{ maxWidth: 720 }}>
            {data.recentActivities.map((a, i) => (
              <div className="list-item" key={`${a.refId}-${i}`}>
                <span style={{ color: a.type === 'distraction' ? 'var(--stop)' : 'var(--muted)' }}>
                  <Icon name={ACTIVITY_ICON[a.type] ?? 'check'} size={16} />
                </span>
                <span className="grow truncate">{a.title}</span>
                <span className="small muted">{fmtRelative(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
