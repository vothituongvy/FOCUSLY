'use client';

import { FormEvent, useState } from 'react';
import { del, errorMessage, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { fromDateInput, toDateInput, toDateTimeInput, WEEKDAYS_VI } from '@/lib/format';
import { PRIORITY_LABEL, STATUS_LABEL, type Course, type Goal, type Priority, type Subject, type Task, type TaskStatus } from '@/lib/types';
import { Modal } from './ui';
import { tr } from '@/lib/i18n';

const COLORS = ['#16203a', '#2f6fb3', '#0f7c86', '#1f7a4d', '#a8780b', '#b8402f', '#c2557a', '#7b4fa3', '#5b6475', '#d4a017'];
const ICONS = ['📘', '📱', '💻', '🇬🇧', '🧮', '🧪', '🎨', '🎵', '📊', '🧠', '✍️', '🌏'];

/* ================= SUBJECT ================= */
export function SubjectForm({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject | null }) {
  const load = useLearning((s) => s.load);
  const [form, setForm] = useState({
    name: subject?.name ?? '',
    description: subject?.description ?? '',
    color: subject?.color ?? COLORS[0],
    icon: subject?.icon ?? ICONS[0],
  });
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (subject) await patch(`/subjects/${subject.id}`, form);
      else await post('/subjects', form);
      await load();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={subject ? tr('Sửa môn học') : tr('Thêm môn học')}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          {tr('Tên môn học')}
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr('VD: Tiếng Anh')} />
        </label>
        <label className="field">
          {tr('Mô tả')}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="field">
          {tr('Biểu tượng')}
          <div className="chips">
            {ICONS.map((i) => (
              <button type="button" key={i} className={`chip ${form.icon === i ? 'active' : ''}`} onClick={() => setForm({ ...form, icon: i })}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          {tr('Màu')}
          <div className="chips">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #111' : '2px solid #fff', cursor: 'pointer' }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="row between">
          {subject ? (
            <button
              type="button"
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(tr('Xoá môn "{0}"? Các khoá học thuộc môn sẽ bị xoá, nhiệm vụ được giữ lại.', subject.name))) return;
                await del(`/subjects/${subject.id}`);
                await load();
                onClose();
              }}
            >
              {tr('Xoá môn học')}
            </button>
          ) : (
            <span />
          )}
          <button className="btn">{tr('Lưu')}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= COURSE ================= */
export function CourseForm({ open, onClose, subjectId, course }: { open: boolean; onClose: () => void; subjectId: string; course?: Course | null }) {
  const load = useLearning((s) => s.load);
  const [name, setName] = useState(course?.name ?? '');
  const [description, setDescription] = useState(course?.description ?? '');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (course) await patch(`/courses/${course.id}`, { name, description });
      else await post('/courses', { subject: subjectId, name, description });
      await load();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={course ? tr('Sửa khoá học / chủ đề') : tr('Thêm khoá học / chủ đề')}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          {tr('Tên')}
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('VD: Ngữ pháp cơ bản')} />
        </label>
        <label className="field">
          {tr('Mô tả')}
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="row between">
          {course ? (
            <button
              type="button"
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(tr('Xoá khoá học này?'))) return;
                await del(`/courses/${course.id}`);
                await load();
                onClose();
              }}
            >
              {tr('Xoá')}
            </button>
          ) : (
            <span />
          )}
          <button className="btn">{tr('Lưu')}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= GOAL ================= */
export function GoalForm({ open, onClose, goal, defaultSubject }: { open: boolean; onClose: () => void; goal?: Goal | null; defaultSubject?: string | null }) {
  const { subjects, load } = useLearning();
  const [form, setForm] = useState({
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    subject: goal?.subject ?? defaultSubject ?? '',
    targetDate: toDateInput(goal?.targetDate),
    status: goal?.status ?? 'active',
  });
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, subject: form.subject || null, targetDate: fromDateInput(form.targetDate) };
    try {
      if (goal) await patch(`/goals/${goal.id}`, body);
      else await post('/goals', body);
      await load();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={goal ? tr('Sửa mục tiêu') : tr('Thêm mục tiêu học tập')}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          {tr('Mục tiêu')}
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tr('VD: Nắm chắc 12 thì và làm được bài tập')} />
        </label>
        <label className="field">
          {tr('Mô tả')}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="grid grid-2">
          <label className="field">
            {tr('Môn học')}
            <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">{tr('— Không —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Ngày hoàn thành mục tiêu')}
            <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          </label>
        </div>
        <label className="field">
          {tr('Trạng thái')}
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Goal['status'] })}>
            <option value="active">{tr('Đang theo đuổi')}</option>
            <option value="achieved">{tr('Đã đạt')}</option>
            <option value="abandoned">{tr('Tạm bỏ')}</option>
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="row between">
          {goal ? (
            <button
              type="button"
              className="btn ghost"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(tr('Xoá mục tiêu?'))) return;
                await del(`/goals/${goal.id}`);
                await load();
                onClose();
              }}
            >
              {tr('Xoá')}
            </button>
          ) : (
            <span />
          )}
          <button className="btn">{tr('Lưu')}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= TASK ================= */
export function TaskForm({
  open,
  onClose,
  task,
  defaults,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  defaults?: Partial<Pick<Task, 'subject' | 'course' | 'scheduledDate'>>;
  onSaved?: () => void;
}) {
  const { subjects, courses, goals } = useLearning();
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    expectedOutcome: task?.expectedOutcome ?? '',
    subject: task?.subject ?? defaults?.subject ?? '',
    course: task?.course ?? defaults?.course ?? '',
    goal: task?.goal ?? '',
    estimatedMinutes: task?.estimatedMinutes ?? 45,
    priority: (task?.priority ?? 'medium') as Priority,
    status: (task?.status ?? 'todo') as TaskStatus,
    scheduledDate: toDateInput(task?.scheduledDate ?? defaults?.scheduledDate),
    deadline: toDateTimeInput(task?.deadline),
    freq: task?.recurrence?.freq ?? 'none',
    interval: task?.recurrence?.interval ?? 1,
    daysOfWeek: task?.recurrence?.daysOfWeek ?? [],
    until: toDateInput(task?.recurrence?.until),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const subjectCourses = courses.filter((c) => c.subject === form.subject);
  const subjectGoals = goals.filter((g) => !form.subject || !g.subject || g.subject === form.subject);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      title: form.title,
      description: form.description,
      expectedOutcome: form.expectedOutcome,
      subject: form.subject || null,
      course: form.course || null,
      goal: form.goal || null,
      estimatedMinutes: Number(form.estimatedMinutes) || 0,
      priority: form.priority,
      status: form.status,
      scheduledDate: fromDateInput(form.scheduledDate),
      deadline: fromDateInput(form.deadline),
      recurrence: {
        freq: form.freq,
        interval: Number(form.interval) || 1,
        daysOfWeek: form.freq === 'weekly' ? form.daysOfWeek : [],
        until: fromDateInput(form.until),
      },
    };
    try {
      if (task) await patch(`/tasks/${task.id}`, body);
      else await post('/tasks', body);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? tr('Sửa nhiệm vụ') : tr('Tạo nhiệm vụ học tập')} width={620}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          {tr('Nhiệm vụ')}
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={tr('VD: Ôn thì hiện tại hoàn thành')} />
        </label>
        <div className="grid grid-2">
          <label className="field">
            {tr('Môn học')}
            <select value={form.subject ?? ''} onChange={(e) => setForm({ ...form, subject: e.target.value, course: '' })}>
              <option value="">{tr('— Không —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Chủ đề / Khoá học')}
            <select value={form.course ?? ''} onChange={(e) => set('course', e.target.value)} disabled={!form.subject}>
              <option value="">{tr('— Không —')}</option>
              {subjectCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Mục tiêu liên quan')}
            <select value={form.goal ?? ''} onChange={(e) => set('goal', e.target.value)}>
              <option value="">{tr('— Không —')}</option>
              {subjectGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Thời lượng dự kiến (phút)')}
            <input type="number" min={0} max={1440} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', Number(e.target.value))} />
          </label>
          <label className="field">
            {tr('Mức độ ưu tiên')}
            <select value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Trạng thái')}
            <select value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('Ngày học dự kiến')}
            <input type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
          </label>
          <label className="field">
            Deadline
            <input type="datetime-local" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </label>
        </div>
        <label className="field">
          {tr('Kết quả mong muốn')}
          <input value={form.expectedOutcome} onChange={(e) => set('expectedOutcome', e.target.value)} placeholder={tr('VD: Làm đúng 8/10 câu bài tập')} />
        </label>
        <label className="field">
          {tr('Ghi chú')}
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="card" style={{ padding: 12, background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="row wrap">
            <label className="field grow">
              {tr('Lặp lại')}
              <select value={form.freq} onChange={(e) => set('freq', e.target.value as typeof form.freq)}>
                <option value="none">{tr('Không lặp')}</option>
                <option value="daily">{tr('Hằng ngày')}</option>
                <option value="weekly">{tr('Hằng tuần')}</option>
                <option value="monthly">{tr('Hằng tháng')}</option>
              </select>
            </label>
            {form.freq !== 'none' && (
              <>
                <label className="field" style={{ width: 110 }}>
                  {tr('Mỗi')}
                  <input type="number" min={1} max={365} value={form.interval} onChange={(e) => set('interval', Number(e.target.value))} />
                </label>
                <label className="field" style={{ width: 170 }}>
                  {tr('Đến ngày')}
                  <input type="date" value={form.until} onChange={(e) => set('until', e.target.value)} />
                </label>
              </>
            )}
          </div>
          {form.freq === 'weekly' && (
            <div className="chips mt-8">
              {WEEKDAYS_VI.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  className={`chip ${form.daysOfWeek.includes(i) ? 'active' : ''}`}
                  onClick={() => set('daysOfWeek', form.daysOfWeek.includes(i) ? form.daysOfWeek.filter((x) => x !== i) : [...form.daysOfWeek, i])}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          {form.freq !== 'none' && <p className="small muted mt-8">{tr('Khi hoàn thành, nhiệm vụ lần kế tiếp sẽ được tạo tự động.')}</p>}
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            {tr('Huỷ')}
          </button>
          <button className="btn" disabled={busy}>
            {task ? tr('Lưu thay đổi') : tr('Tạo nhiệm vụ')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
