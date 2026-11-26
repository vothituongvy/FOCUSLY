'use client';

import { FormEvent, useState } from 'react';
import { del, errorMessage, patch, post } from '@/lib/api';
import { useLearning } from '@/lib/learning';
import { fromDateInput, toDateInput, toDateTimeInput, WEEKDAYS_VI } from '@/lib/format';
import { PRIORITY_LABEL, STATUS_LABEL, type Course, type Goal, type Priority, type Subject, type Task, type TaskStatus } from '@/lib/types';
import { Modal } from './ui';

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
    <Modal open={open} onClose={onClose} title={subject ? 'Sửa môn học' : 'Thêm môn học'}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Tên môn học
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: React Native" />
        </label>
        <label className="field">
          Mô tả
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="field">
          Biểu tượng
          <div className="chips">
            {ICONS.map((i) => (
              <button type="button" key={i} className={`chip ${form.icon === i ? 'active' : ''}`} onClick={() => setForm({ ...form, icon: i })}>
                {i}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          Màu
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
                if (!confirm(`Xoá môn "${subject.name}"? Các khoá học thuộc môn sẽ bị xoá, nhiệm vụ được giữ lại.`)) return;
                await del(`/subjects/${subject.id}`);
                await load();
                onClose();
              }}
            >
              Xoá môn học
            </button>
          ) : (
            <span />
          )}
          <button className="btn">Lưu</button>
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
    <Modal open={open} onClose={onClose} title={course ? 'Sửa khoá học / chủ đề' : 'Thêm khoá học / chủ đề'}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Tên
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: React Hooks" />
        </label>
        <label className="field">
          Mô tả
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
                if (!confirm('Xoá khoá học này?')) return;
                await del(`/courses/${course.id}`);
                await load();
                onClose();
              }}
            >
              Xoá
            </button>
          ) : (
            <span />
          )}
          <button className="btn">Lưu</button>
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
    <Modal open={open} onClose={onClose} title={goal ? 'Sửa mục tiêu' : 'Thêm mục tiêu học tập'}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Mục tiêu
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Hiểu và thực hành được useEffect" />
        </label>
        <label className="field">
          Mô tả
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div className="grid grid-2">
          <label className="field">
            Môn học
            <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
              <option value="">— Không —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Ngày hoàn thành mục tiêu
            <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
          </label>
        </div>
        <label className="field">
          Trạng thái
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Goal['status'] })}>
            <option value="active">Đang theo đuổi</option>
            <option value="achieved">Đã đạt</option>
            <option value="abandoned">Tạm bỏ</option>
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
                if (!confirm('Xoá mục tiêu?')) return;
                await del(`/goals/${goal.id}`);
                await load();
                onClose();
              }}
            >
              Xoá
            </button>
          ) : (
            <span />
          )}
          <button className="btn">Lưu</button>
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
    <Modal open={open} onClose={onClose} title={task ? 'Sửa nhiệm vụ' : 'Tạo nhiệm vụ học tập'} width={620}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          Nhiệm vụ
          <input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="VD: Tìm hiểu useEffect" />
        </label>
        <div className="grid grid-2">
          <label className="field">
            Môn học
            <select value={form.subject ?? ''} onChange={(e) => setForm({ ...form, subject: e.target.value, course: '' })}>
              <option value="">— Không —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Chủ đề / Khoá học
            <select value={form.course ?? ''} onChange={(e) => set('course', e.target.value)} disabled={!form.subject}>
              <option value="">— Không —</option>
              {subjectCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Mục tiêu liên quan
            <select value={form.goal ?? ''} onChange={(e) => set('goal', e.target.value)}>
              <option value="">— Không —</option>
              {subjectGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Thời lượng dự kiến (phút)
            <input type="number" min={0} max={1440} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', Number(e.target.value))} />
          </label>
          <label className="field">
            Mức độ ưu tiên
            <select value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Trạng thái
            <select value={form.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Ngày học dự kiến
            <input type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />
          </label>
          <label className="field">
            Deadline
            <input type="datetime-local" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </label>
        </div>
        <label className="field">
          Kết quả mong muốn
          <input value={form.expectedOutcome} onChange={(e) => set('expectedOutcome', e.target.value)} placeholder="VD: Hiểu và thực hành được useEffect" />
        </label>
        <label className="field">
          Ghi chú
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="card" style={{ padding: 12, background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="row wrap">
            <label className="field grow">
              Lặp lại
              <select value={form.freq} onChange={(e) => set('freq', e.target.value as typeof form.freq)}>
                <option value="none">Không lặp</option>
                <option value="daily">Hằng ngày</option>
                <option value="weekly">Hằng tuần</option>
                <option value="monthly">Hằng tháng</option>
              </select>
            </label>
            {form.freq !== 'none' && (
              <>
                <label className="field" style={{ width: 110 }}>
                  Mỗi
                  <input type="number" min={1} max={365} value={form.interval} onChange={(e) => set('interval', Number(e.target.value))} />
                </label>
                <label className="field" style={{ width: 170 }}>
                  Đến ngày
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
          {form.freq !== 'none' && <p className="small muted mt-8">Khi hoàn thành, nhiệm vụ lần kế tiếp sẽ được tạo tự động.</p>}
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            Huỷ
          </button>
          <button className="btn" disabled={busy}>
            {task ? 'Lưu thay đổi' : 'Tạo nhiệm vụ'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
