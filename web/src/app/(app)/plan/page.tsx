'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { del, patch } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { useResource } from '@/lib/hooks';
import { fmtDate, fmtDuration, toDateInput, WEEKDAYS_VI } from '@/lib/format';
import { PRIORITY_LABEL, STATUS_LABEL, type Course, type Goal, type Subject, type Task } from '@/lib/types';
import { CourseForm, GoalForm, SubjectForm, TaskForm } from '@/components/PlanForms';
import { Empty, Spinner } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { tr } from '@/lib/i18n';

type View = 'list' | 'calendar' | 'goals';
type ModalState =
  | { kind: 'subject'; subject?: Subject | null }
  | { kind: 'course'; course?: Course | null }
  | { kind: 'goal'; goal?: Goal | null }
  | { kind: 'task'; task?: Task | null; scheduledDate?: string }
  | null;

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

export default function PlanPage() {
  const { subjects, courses, goals } = useLearning();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [status, setStatus] = useState('todo,in_progress');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (subjectId) p.set('subject', subjectId);
    if (courseId) p.set('course', courseId);
    if (view === 'list' && status) p.set('status', status);
    if (view === 'list' && search) p.set('search', search);
    if (view === 'calendar') {
      const start = new Date(month);
      start.setDate(start.getDate() - 7);
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 8);
      p.set('from', start.toISOString());
      p.set('to', end.toISOString());
    }
    return p.toString();
  }, [subjectId, courseId, status, search, view, month]);

  const { data, loading, reload, setData } = useResource<{ items: Task[] }>(`/tasks?${query}`, ['tasks']);
  const tasks = data?.items ?? [];
  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const subjectCourses = courses.filter((c) => c.subject === subjectId);

  const toggleDone = async (t: Task) => {
    const next = t.status === 'done' ? 'todo' : 'done';
    setData({ items: tasks.map((x) => (x.id === t.id ? { ...x, status: next } : x)) });
    await patch(`/tasks/${t.id}`, { status: next });
    void reload();
  };

  const sorted = [...tasks].sort((a, b) => {
    const ad = a.deadline ? +new Date(a.deadline) : Infinity;
    const bd = b.deadline ? +new Date(b.deadline) : Infinity;
    return ad - bd || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="page-header">
        <div>
          <h1>{tr('Kế hoạch học tập')}</h1>
          <p className="muted">{tr('Tổ chức việc học theo môn học, chủ đề, mục tiêu và nhiệm vụ.')}</p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setModal({ kind: 'goal' })}>
            {tr('+ Mục tiêu')}
          </button>
          <button className="btn" onClick={() => setModal({ kind: 'task' })}>
            {tr('+ Nhiệm vụ')}
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 260px) 1fr', alignItems: 'start' }}>
        {/* ----- Môn học ----- */}
        <div className="card col" style={{ gap: 4 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <h3>{tr('Môn học')}</h3>
            <button className="icon-btn" title={tr('Thêm môn học')} onClick={() => setModal({ kind: 'subject' })}>
              ＋
            </button>
          </div>
          <button
            className={`nav-link ${!subjectId ? 'active' : ''}`}
            style={{ border: 'none', background: !subjectId ? undefined : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
            onClick={() => {
              setSubjectId(null);
              setCourseId(null);
            }}
          >
            {tr('Tất cả')}
          </button>
          {subjects.map((s) => (
            <div key={s.id} className="row" style={{ gap: 2 }}>
              <button
                className={`nav-link grow ${subjectId === s.id ? 'active' : ''}`}
                style={{ border: 'none', background: subjectId === s.id ? undefined : 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                onClick={() => {
                  setSubjectId(s.id);
                  setCourseId(null);
                }}
              >
                <span className="dot" style={{ background: s.color }} /> {s.icon} <span className="truncate">{s.name}</span>
              </button>
              <button className="icon-btn" title={tr('Sửa')} onClick={() => setModal({ kind: 'subject', subject: s })}>
                ✎
              </button>
            </div>
          ))}
          {subjects.length === 0 && <p className="small muted">{tr('Chưa có môn học nào.')}</p>}

          {subject && (
            <div className="mt-16 col" style={{ gap: 4 }}>
              <div className="row between">
                <span className="small muted" style={{ fontWeight: 600 }}>
                  {tr('CHỦ ĐỀ / KHOÁ HỌC')}
                </span>
                <button className="icon-btn" onClick={() => setModal({ kind: 'course' })}>
                  ＋
                </button>
              </div>
              {subjectCourses.map((c) => (
                <div key={c.id} className="row" style={{ gap: 2 }}>
                  <button
                    className={`chip grow ${courseId === c.id ? 'active' : ''}`}
                    style={{ textAlign: 'left' }}
                    onClick={() => setCourseId(courseId === c.id ? null : c.id)}
                  >
                    {c.name}
                  </button>
                  <button className="icon-btn" onClick={() => setModal({ kind: 'course', course: c })}>
                    ✎
                  </button>
                </div>
              ))}
              {subjectCourses.length === 0 && <p className="small muted">{tr('Chưa có chủ đề.')}</p>}
            </div>
          )}
        </div>

        {/* ----- Nội dung ----- */}
        <div className="card">
          <div className="tabs">
            {(
              [
                ['list', tr('Danh sách nhiệm vụ')],
                ['calendar', tr('Lịch')],
                ['goals', tr('Mục tiêu')],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button key={v} className={`tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>

          {view === 'list' && (
            <>
              <div className="row wrap" style={{ marginBottom: 12 }}>
                <input placeholder={tr('Tìm nhiệm vụ...')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
                <div className="chips">
                  {[
                    ['todo,in_progress', tr('Chưa xong')],
                    ['done', tr('Hoàn thành')],
                    ['', tr('Tất cả')],
                  ].map(([v, l]) => (
                    <button key={v} className={`chip ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {loading && !data ? (
                <Spinner />
              ) : sorted.length === 0 ? (
                <Empty>
                  {tr('Không có nhiệm vụ.')} 
                  <button className="btn sm" onClick={() => setModal({ kind: 'task' })}>
                    {tr('Tạo nhiệm vụ')}
                  </button>
                </Empty>
              ) : (
                <div className="list">
                  {sorted.map((t) => {
                    const s = subjects.find((x) => x.id === t.subject);
                    const c = courses.find((x) => x.id === t.course);
                    const overdue = t.status !== 'done' && t.deadline && new Date(t.deadline) < new Date();
                    return (
                      <div className="list-item" key={t.id}>
                        <button className={`check ${t.status === 'done' ? 'on' : ''}`} onClick={() => toggleDone(t)} aria-label={tr('Hoàn thành')}>
                          {t.status === 'done' ? '✓' : ''}
                        </button>
                        <div className="grow" style={{ cursor: 'pointer' }} onClick={() => setModal({ kind: 'task', task: t })}>
                          <div className={`truncate ${t.status === 'done' ? 'strike' : ''}`} style={{ fontWeight: 600 }}>
                            {t.title} {t.recurrence?.freq !== 'none' && <span title={tr('Lặp lại')}></span>}
                          </div>
                          <div className="small muted">
                            {s && (
                              <>
                                <span className="dot" style={{ background: s.color, width: 8, height: 8 }} /> {s.name}
                                {c ? ` › ${c.name}` : ''} ·{' '}
                              </>
                            )}
                            {tr('{0}p dự kiến', t.estimatedMinutes)}
                            {t.actualFocusSeconds > 0 && tr(' · đã học {0}', fmtDuration(t.actualFocusSeconds))}
                            {t.scheduledDate && ` · ${fmtDate(t.scheduledDate)}`}
                            {t.deadline && <span style={{ color: overdue ? 'var(--danger)' : undefined }}> · {fmtDate(t.deadline, true)}</span>}
                          </div>
                        </div>
                        {t.status === 'in_progress' && <span className="badge in_progress">{STATUS_LABEL[t.status]}</span>}
                        <span className={`badge ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                        {t.status !== 'done' && (
                          <Link href={`/focus?task=${t.id}`} className="btn sm secondary">
                            <Icon name="play" size={16} />
                          </Link>
                        )}
                        <button
                          className="icon-btn"
                          title={tr('Xoá')}
                          onClick={async () => {
                            if (!confirm(tr('Xoá "{0}"?', t.title))) return;
                            await del(`/tasks/${t.id}`);
                            void reload();
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === 'calendar' && (
            <CalendarView month={month} setMonth={setMonth} tasks={tasks} onDayClick={(d) => setModal({ kind: 'task', scheduledDate: d })} onTaskClick={(t) => setModal({ kind: 'task', task: t })} />
          )}

          {view === 'goals' && <GoalsView goals={goals.filter((g) => !subjectId || g.subject === subjectId)} onEdit={(g) => setModal({ kind: 'goal', goal: g })} onAdd={() => setModal({ kind: 'goal' })} />}
        </div>
      </div>

      {modal?.kind === 'subject' && <SubjectForm key={modal.subject?.id ?? 'new'} open onClose={() => setModal(null)} subject={modal.subject} />}
      {modal?.kind === 'course' && subjectId && (
        <CourseForm key={modal.course?.id ?? 'new'} open onClose={() => setModal(null)} subjectId={subjectId} course={modal.course} />
      )}
      {modal?.kind === 'goal' && <GoalForm key={modal.goal?.id ?? 'new'} open onClose={() => setModal(null)} goal={modal.goal} defaultSubject={subjectId} />}
      {modal?.kind === 'task' && (
        <TaskForm
          key={modal.task?.id ?? `new-${modal.scheduledDate ?? ''}`}
          open
          onClose={() => setModal(null)}
          task={modal.task}
          defaults={{ subject: subjectId, course: courseId, scheduledDate: modal.scheduledDate ?? null }}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function CalendarView({
  month,
  setMonth,
  tasks,
  onDayClick,
  onTaskClick,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  tasks: Task[];
  onDayClick: (isoDate: string) => void;
  onTaskClick: (t: Task) => void;
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // tuần bắt đầu từ Thứ 2
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const todayKey = toDateInput(new Date().toISOString());
  const byDay = new Map<string, { task: Task; kind: 'scheduled' | 'deadline' }[]>();
  for (const t of tasks) {
    if (t.scheduledDate) {
      const k = toDateInput(t.scheduledDate);
      byDay.set(k, [...(byDay.get(k) ?? []), { task: t, kind: 'scheduled' }]);
    }
    if (t.deadline && toDateInput(t.deadline) !== (t.scheduledDate && toDateInput(t.scheduledDate))) {
      const k = toDateInput(t.deadline);
      byDay.set(k, [...(byDay.get(k) ?? []), { task: t, kind: 'deadline' }]);
    }
  }
  const headers = [1, 2, 3, 4, 5, 6, 0].map((i) => WEEKDAYS_VI[i]);

  return (
    <div>
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn secondary sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
          ‹
        </button>
        <h3>
          {tr('Tháng {0}/', month.getMonth() + 1)}{month.getFullYear()}
        </h3>
        <button className="btn secondary sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
          ›
        </button>
      </div>
      <div className="calendar">
        {headers.map((h) => (
          <div className="cal-head" key={h}>
            {h}
          </div>
        ))}
        {days.map((d) => {
          const key = toDateInput(d.toISOString());
          const items = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`cal-cell ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${key === todayKey ? 'today' : ''}`}
              onClick={() => onDayClick(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString())}
            >
              <span className="cal-day">{d.getDate()}</span>
              {items.slice(0, 3).map(({ task, kind }) => (
                <div
                  key={`${task.id}-${kind}`}
                  className={`cal-task ${task.status === 'done' ? 'done' : kind === 'deadline' ? 'deadline' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTaskClick(task);
                  }}
                  title={task.title}
                >
                  {task.title}
                </div>
              ))}
              {items.length > 3 && <div className="small muted">{tr('+{0} nữa', items.length - 3)}</div>}
            </div>
          );
        })}
      </div>
      <p className="small muted mt-8">{tr('Nhấn vào một ngày để thêm nhiệm vụ cho ngày đó. = hạn hoàn thành.')}</p>
    </div>
  );
}

function GoalsView({ goals, onEdit, onAdd }: { goals: Goal[]; onEdit: (g: Goal) => void; onAdd: () => void }) {
  const subjects = useLearning((s) => s.subjects);
  if (goals.length === 0)
    return (
      <Empty>
        {tr('Chưa có mục tiêu.')} 
        <button className="btn sm" onClick={onAdd}>
          {tr('Thêm mục tiêu')}
        </button>
      </Empty>
    );
  const label = { active: tr('Đang theo đuổi'), achieved: tr('Đã đạt '), abandoned: tr('Tạm bỏ') };
  return (
    <div className="list">
      {goals.map((g) => {
        const s = subjects.find((x) => x.id === g.subject);
        return (
          <div key={g.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => onEdit(g)}>
            <div className="grow">
              <div style={{ fontWeight: 600 }}>{g.title}</div>
              <div className="small muted">
                {s ? `${s.icon} ${s.name}` : 'Chung'}
                {g.targetDate && tr(' · Hạn {0}', fmtDate(g.targetDate))}
              </div>
            </div>
            <span className={`badge ${g.status === 'achieved' ? 'done' : ''}`}>{label[g.status]}</span>
          </div>
        );
      })}
    </div>
  );
}
