'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, errorMessage, get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLearning } from '@/lib/learning';
import { extensionShieldOn, isExtensionInstalled } from '@/lib/extension';
import type { FocusSession, Task } from '@/lib/types';
import { Icon, type IconName } from '@/components/Icon';
import { LOCALE, tr } from '@/lib/i18n';

type Mode = 'pomodoro' | 'custom' | 'free';

type Level = 'off' | 'shield' | 'strict';
const LEVELS: { id: Level; name: string; line: string; icon: IconName }[] = [
  { id: 'off', name: tr('Không chặn'), line: tr('Học bình thường, không giới hạn gì.'), icon: 'play' },
  { id: 'shield', name: 'Focus Shield', line: tr('Chặn trang gây xao nhãng, nhắc khi bạn rời đi.'), icon: 'shield' },
  { id: 'strict', name: tr('Nghiêm ngặt'), line: tr('Chỉ mở được FOCUSLY và trang bạn cho phép.'), icon: 'lock' },
];
const RULES: { text: string; levels: Level[] }[] = [
  { text: tr('Chặn các trang trong danh sách chặn (mạng xã hội, video…)'), levels: ['shield', 'strict'] },
  { text: tr('Nhắc bạn quay lại khi rời khỏi trang học'), levels: ['shield', 'strict'] },
  { text: tr('Chỉ mở được trang cho phép, chuyển tab sẽ bị kéo về'), levels: ['strict'] },
  { text: tr('Đồng hồ dừng khi bạn rời đi, chỉ tính lúc bạn thật sự học'), levels: ['strict'] },
  { text: tr('Muốn dừng sớm phải giữ nút 3 giây'), levels: ['strict'] },
];

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
  const level: Level = strict ? 'strict' : shield ? 'shield' : 'off';
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
      goal: goal || task?.title || tr('Tập trung học'),
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
        if (existing && confirm(tr('Bạn đang có một phiên chưa kết thúc (có thể trên thiết bị khác). Kết thúc phiên cũ và bắt đầu phiên mới?'))) {
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
          {[tr('Môn học'), tr('Nhiệm vụ'), tr('Thời gian'), 'Focus Shield', tr('Mục tiêu')].map((s, i) => (
            <span key={s} className={`step ${steps[i] ? 'done' : ''}`}>
              <b>{i + 1}</b> {s} {i < 4 && <span className="muted">›</span>}
            </span>
          ))}
        </div>

        <div className="grid grid-2">
          <label className="field">
            {tr('1. Môn học')}
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setTaskId('');
              }}
            >
              <option value="">{tr('— Chọn môn —')}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {tr('2. Nhiệm vụ cần hoàn thành')}
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
              <option value="">{tr('— Không gắn nhiệm vụ —')}</option>
              {subjectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.estimatedMinutes}p)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field">
          {tr('3. Thời gian tập trung')}
          <div className="chips">
            {(
              [
                ['pomodoro', 'Pomodoro'],
                ['custom', tr('Tuỳ chỉnh')],
                ['free', tr('∞ Tự do')],
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
                ['focusMinutes', tr('Tập trung (phút)')],
                ['breakMinutes', tr('Nghỉ ngắn')],
                ['longBreakMinutes', tr('Nghỉ dài')],
                ['cyclesBeforeLongBreak', tr('Số vòng')],
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
            {tr('Thời lượng phiên (phút)')}
            <input type="number" min={1} max={600} value={customMinutes} onChange={(e) => setCustomMinutes(Number(e.target.value) || 1)} />
          </label>
        )}
        {mode === 'free' && <p className="small muted">{tr('Đồng hồ đếm lên, bạn tự kết thúc khi xong.')}</p>}

        <div className="field">
          {tr('4. Mức bảo vệ khỏi xao nhãng')}
          <div className="level-picker" role="radiogroup" aria-label={tr('Mức bảo vệ khỏi xao nhãng')}>
            {LEVELS.map((l) => {
              const on = level === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`level ${on ? 'selected' : ''}`}
                  onClick={() => {
                    setShield(l.id !== 'off');
                    setStrict(l.id === 'strict');
                  }}
                >
                  <span className="level-head">
                    <Icon name={l.icon} size={18} />
                    <b>{l.name}</b>
                  </span>
                  <span className="level-line">{l.line}</span>
                </button>
              );
            })}
          </div>
          {level !== 'off' && (
            <div className="level-detail">
              <ul className="level-rules">
                {RULES.map((r) => {
                  const has = r.levels.includes(level);
                  return (
                    <li key={r.text} className={has ? 'on' : 'off'}>
                      <Icon name={has ? 'check' : 'x'} size={15} strokeWidth={2.2} />
                      <span>{r.text}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="level-foot">
                {level === 'shield' && (
                  <label className="row small">
                    <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />{' '}{tr('Mở toàn màn hình khi bắt đầu')}
                  </label>
                )}
                <span className="small muted">
                  {level === 'strict'
                    ? tr('Trang được phép: {0}', user?.shield.allowList?.length ? user.shield.allowList.join(', ') : tr('chỉ FOCUSLY'))
                    : tr('Đang chặn: {0}{1}', user?.shield.blockList.slice(0, 5).join(', '), (user?.shield.blockList.length ?? 0) > 5 ? '…' : '')}
                  {'. '}
                  <Link href="/settings?tab=shield">{tr('Sửa danh sách')}</Link>
                </span>
                <span className="small">
                  {tr('Tiện ích Chrome FOCUSLY:')} 
                  {extInstalled === null ? (
                    '…'
                  ) : extInstalled ? (
                    <span className="success-text">{tr('đã kết nối')}</span>
                  ) : (
                    <span style={{ color: 'var(--stop)' }}>
                      {tr('chưa cài.')}{' '}{level === 'strict' ? tr('Chưa khoá được tab, nhưng đồng hồ vẫn dừng khi bạn rời trang.') : tr('Các trang trong danh sách sẽ chưa bị chặn.')}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        <label className="field">
          {tr('5. Mục tiêu của phiên học')}
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={tr('VD: Làm xong 20 câu trắc nghiệm chương 3')} />
        </label>

        {error && <p className="error-text">{error}</p>}
        <button className="btn marker lg block" onClick={start} disabled={busy}>
          {busy ? tr('Đang bắt đầu...') : tr('Bắt đầu phiên học')}
        </button>
      </div>

      <div className="card col">
        <h3>{tr('Quy trình phiên học')}</h3>
        <ol className="small muted" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
          <li>{tr('Chọn môn học')}</li>
          <li>{tr('Chọn nhiệm vụ cần hoàn thành')}</li>
          <li>{tr('Thiết lập thời gian tập trung')}</li>
          <li>{tr('Bật Focus Shield')}</li>
          <li>{tr('Bắt đầu phiên học')}</li>
          <li>{tr('Kết thúc phiên và ghi nhận kết quả')}</li>
        </ol>
        {task && (
          <div className="card mt-8" style={{ boxShadow: 'none' }}>
            <div style={{ fontWeight: 600 }}>{task.title}</div>
            <div className="small muted">
              {tr('Dự kiến {0} phút', task.estimatedMinutes)}
              {task.deadline && tr(' · Hạn {0}', new Date(task.deadline).toLocaleDateString(LOCALE))}
            </div>
            {task.expectedOutcome && <div className="small mt-8">{task.expectedOutcome}</div>}
          </div>
        )}
        <p className="small muted">
          {tr('Thời gian được tính theo đồng hồ máy chủ. Nếu bạn đóng tab hoặc mất mạng, phiên sẽ được khôi phục khi quay lại.')}
        </p>
      </div>
    </div>
  );
}
