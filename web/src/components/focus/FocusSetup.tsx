'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, errorMessage, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLearning } from '@/lib/learning';
import { extensionShieldOn, isExtensionInstalled } from '@/lib/extension';
import type { FocusSession, Task } from '@/lib/types';

type Mode = 'pomodoro' | 'custom' | 'free';

export function FocusSetup({ initialTaskId, onStarted }: { initialTaskId?: string | null; onStarted: (s: FocusSession) => void }) {
  const user = useAuth((s) => s.user);
  const subjects = useLearning((s) => s.subjects);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [taskId, setTaskId] = useState(initialTaskId ?? '');
  const [mode, setMode] = useState<Mode>('pomodoro');
  const pomoDefault = user?.profile.defaultPomodoro ?? { focusMinutes: 25, breakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4 };
  const [pomo, setPomo] = useState(pomoDefault);
  const [customMinutes, setCustomMinutes] = useState(45);
  const [shield, setShield] = useState(user?.shield.autoEnableOnSession ?? true);
  const [strict, setStrict] = useState(user?.shield.strictByDefault ?? false);
  const [fullscreen, setFullscreen] = useState(true);
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [extInstalled, setExtInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    get<{ items: Task[] }>('/tasks?status=todo,in_progress&limit=300').then((r) => {
      setTasks(r.items);
      if (initialTaskId) {
        const t = r.items.find((x) => x.id === initialTaskId);
        if (t) {
          setSubjectId(t.subject ?? '');
          setGoal(t.expectedOutcome || t.title);
          if (t.estimatedMinutes) setCustomMinutes(t.estimatedMinutes);
        }
      }
    });
    void isExtensionInstalled().then(setExtInstalled);
  }, [initialTaskId]);

  const subjectTasks = useMemo(() => tasks.filter((t) => !subjectId || t.subject === subjectId), [tasks, subjectId]);
  const task = tasks.find((t) => t.id === taskId);

  const start = async () => {
    setError('');
    // Fullscreen API cần được gọi ngay trong sự kiện click
    if ((shield || strict) && (fullscreen || strict) && document.fullscreenEnabled) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
    if (shield && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    setBusy(true);
    const body = {
      subject: subjectId || null,
      task: taskId || null,
      goal: goal || task?.title || 'Tập trung học',
      mode,
      plannedMinutes: mode === 'custom' ? customMinutes : mode === 'pomodoro' ? pomo.focusMinutes * pomo.cyclesBeforeLongBreak : 0,
      pomodoro: pomo,
      shieldEnabled: shield || strict,
      strict,
      device: 'web',
    };
    try {
      const { session } = await post<{ session: FocusSession }>('/sessions', body);
      if ((shield || strict) && user) void extensionShieldOn(user.shield.blockList, session.goal, session.id, { strict, allowList: user.shield.allowList });
      onStarted(session);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const existing = (e.data as { error?: { details?: { session?: FocusSession } } })?.error?.details?.session;
        if (existing && confirm('Bạn đang có một phiên chưa kết thúc (có thể trên thiết bị khác). Kết thúc phiên cũ và bắt đầu phiên mới?')) {
          const { session } = await post<{ session: FocusSession }>('/sessions', { ...body, takeover: true });
          onStarted(session);
        } else if (existing) onStarted(existing);
      } else setError(errorMessage(e));
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const steps = [Boolean(subjectId), Boolean(taskId), true, true, Boolean(goal)];

  return (
    <div className="grid grid-3-1" style={{ alignItems: 'start' }}>
      <div className="card form">
        <div className="stepper">
          {['Môn học', 'Nhiệm vụ', 'Thời gian', 'Focus Shield', 'Mục tiêu'].map((s, i) => (
            <span key={s} className={`step ${steps[i] ? 'done' : ''}`}>
              <b>{i + 1}</b> {s} {i < 4 && <span className="muted">›</span>}
            </span>
          ))}
        </div>

        <div className="grid grid-2">
          <label className="field">
            1. Môn học
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTaskId('');
              }}
            >
              <option value="">— Chọn môn —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            2. Nhiệm vụ cần hoàn thành
            <select
              value={taskId}
              onChange={(e) => {
                setTaskId(e.target.value);
                const t = tasks.find((x) => x.id === e.target.value);
                if (t) {
                  setGoal(t.expectedOutcome || t.title);
                  if (t.subject) setSubjectId(t.subject);
                  if (t.estimatedMinutes) setCustomMinutes(t.estimatedMinutes);
                }
              }}
            >
              <option value="">— Không gắn nhiệm vụ —</option>
              {subjectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.estimatedMinutes}p)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          3. Thời gian tập trung
          <div className="chips">
            {(
              [
                ['pomodoro', 'Pomodoro'],
                ['custom', 'Tuỳ chỉnh'],
                ['free', '∞ Tự do'],
              ] as [Mode, string][]
            ).map(([m, l]) => (
              <button key={m} type="button" className={`chip ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {mode === 'pomodoro' && (
          <div className="grid grid-4">
            {(
              [
                ['focusMinutes', 'Tập trung (phút)'],
                ['breakMinutes', 'Nghỉ ngắn'],
                ['longBreakMinutes', 'Nghỉ dài'],
                ['cyclesBeforeLongBreak', 'Số vòng'],
              ] as [keyof typeof pomo, string][]
            ).map(([k, l]) => (
              <label className="field" key={k}>
                {l}
                <input type="number" min={1} max={180} value={pomo[k]} onChange={(e) => setPomo({ ...pomo, [k]: Number(e.target.value) || 1 })} />
              </label>
            ))}
          </div>
        )}
        {mode === 'custom' && (
          <label className="field" style={{ maxWidth: 220 }}>
            Thời lượng phiên (phút)
            <input type="number" min={1} max={600} value={customMinutes} onChange={(e) => setCustomMinutes(Number(e.target.value) || 1)} />
          </label>
        )}
        {mode === 'free' && <p className="small muted">Đồng hồ đếm lên, bạn tự kết thúc khi xong.</p>}

        <div className="field">
          4. Mức bảo vệ khỏi xao nhãng
          <div className="grid grid-2" style={{ gap: 10 }}>
            <button
              type="button"
              className={`option ${!strict ? 'selected' : ''}`}
              style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}
              onClick={() => {
                setStrict(false);
                setShield(true);
              }}
            >
              <b>Focus Shield</b>
              <span className="small muted">Chặn các trang trong Block List, nhắc khi bạn rời tab. Vẫn chuyển tab được.</span>
            </button>
            <button
              type="button"
              className={`option ${strict ? 'selected' : ''}`}
              style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}
              onClick={() => {
                setStrict(true);
                setShield(true);
              }}
            >
              <b>Phiên nghiêm ngặt</b>
              <span className="small muted">Chỉ mở được FOCUSLY và trang cho phép. Chuyển tab bị kéo về. Đồng hồ chỉ chạy khi bạn ở đây. Kết thúc sớm phải giữ nút 3 giây.</span>
            </button>
          </div>
          {!strict && (
            <label className="row small" style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={!shield} onChange={(e) => setShield(!e.target.checked)} /> Không bật bảo vệ cho phiên này
            </label>
          )}
          {(shield || strict) && (
            <div className="col" style={{ gap: 6, fontWeight: 400 }}>
              {!strict && (
                <label className="row small">
                  <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} /> Mở toàn màn hình
                </label>
              )}
              <div className="small muted">
                {strict ? `Trang được phép: ${user?.shield.allowList?.join(', ') || 'chỉ FOCUSLY'}` : `Chặn: ${user?.shield.blockList.slice(0, 6).join(', ')}${(user?.shield.blockList.length ?? 0) > 6 ? '…' : ''}`}
                {'. '}
                <Link href="/settings?tab=shield">{strict ? 'Sửa danh sách cho phép' : 'Sửa Block List'}</Link>
              </div>
              <div className="small">
                Chrome Extension:{' '}
                {extInstalled === null ? (
                  '…'
                ) : extInstalled ? (
                  <span className="success-text">đã kết nối</span>
                ) : (
                  <span style={{ color: 'var(--stop)' }}>chưa cài, {strict ? 'chưa khoá được tab (đồng hồ vẫn tự dừng khi bạn rời trang)' : 'website sẽ không bị chặn'}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <label className="field">
          5. Mục tiêu của phiên học
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="VD: Hiểu useEffect chạy khi nào và viết được 1 ví dụ" />
        </label>

        {error && <p className="error-text">{error}</p>}
        <button className="btn marker lg block" onClick={start} disabled={busy}>
          {busy ? 'Đang bắt đầu...' : 'Bắt đầu phiên học'}
        </button>
      </div>

      <div className="card col">
        <h3>Quy trình phiên học</h3>
        <ol className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
          <li>Chọn môn học</li>
          <li>Chọn nhiệm vụ cần hoàn thành</li>
          <li>Thiết lập thời gian tập trung</li>
          <li>Bật Focus Shield</li>
          <li>Bắt đầu phiên học</li>
          <li>Kết thúc phiên và ghi nhận kết quả</li>
        </ol>
        {task && (
          <div className="card mt-8" style={{ boxShadow: 'none' }}>
            <div style={{ fontWeight: 600 }}>{task.title}</div>
            <div className="small muted">
              Dự kiến {task.estimatedMinutes} phút
              {task.deadline && ` · Hạn ${new Date(task.deadline).toLocaleDateString('vi-VN')}`}
            </div>
            {task.expectedOutcome && <div className="small mt-8">{task.expectedOutcome}</div>}
          </div>
        )}
        <p className="small muted">
          Thời gian được tính theo đồng hồ máy chủ. Nếu bạn đóng tab hoặc mất mạng, phiên sẽ được khôi phục khi quay lại.
        </p>
      </div>
    </div>
  );
}
