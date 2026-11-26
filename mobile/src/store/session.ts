import { create } from 'zustand';
import { api } from '../api/client';
import { PLATFORM } from '../config';
import { enqueue, hasPendingFor, kvGet, kvSet, removeQueued, uid } from '../offline/db';
import { localBreak, localEnd, localPause, localResume } from '../offline/sessionLogic';
import type { FocusSession, Pomodoro } from '../types';
import { onSessionSynced, useData } from './data';
import { lockScreen, unlockScreen } from '../focusLock';

const OPEN = ['active', 'paused', 'on_break'];

export interface StartParams {
  subject: string | null;
  task: string | null;
  goal: string;
  mode: 'pomodoro' | 'custom' | 'free';
  plannedMinutes: number;
  pomodoro: Pomodoro;
  shieldEnabled: boolean;
  strict?: boolean;
}

interface SessionState {
  session: FocusSession | null;
  ended: FocusSession | null;
  offsetMs: number;
  loadActive: () => Promise<void>;
  start: (p: StartParams) => Promise<void>;
  pause: (at?: Date) => Promise<void>;
  resume: () => Promise<void>;
  takeBreak: () => Promise<void>;
  end: (summary: { abandon?: boolean; goalAchieved?: boolean | null; rating?: number | null; note?: string; markTaskDone?: boolean }) => Promise<void>;
  appLeave: (leftAt: Date, returnedAt: Date) => Promise<void>;
  heartbeat: () => Promise<void>;
  applyServer: (s: FocusSession) => Promise<void>;
  clearEnded: () => void;
}

const now = (offset: number) => new Date(Date.now() + offset);
const refOf = (s: FocusSession) => s.id;

/**
 * Phiên học trên Mobile:
 * - Mọi hành động áp dụng cục bộ ngay (đồng hồ chạy cả khi mất mạng)
 * - Hành động được xếp hàng kèm thời điểm thực `at`, gửi lên server khi có mạng
 * - Server tính lại thời gian thực tế từ các mốc `at` => không phụ thuộc đồng hồ UI
 */
export const useSession = create<SessionState>((set, get) => {
  const persist = async (s: FocusSession | null) => {
    await kvSet('activeSession', s);
  };

  const queue = async (op: string, s: FocusSession, data: Record<string, unknown> = {}) => {
    await enqueue({ mutationId: uid(), entity: 'sessions', op, refId: refOf(s), payload: { clientId: s.clientId, data } });
    void useData.getState().sync();
  };

  const setLocal = async (s: FocusSession | null) => {
    if (s && !OPEN.includes(s.status)) {
      if (get().session?.strict || s.strict) void unlockScreen(); // hết phiên: bỏ ghim màn hình
      set({ session: null, ended: s });
      await persist(null);
    } else {
      set({ session: s });
      await persist(s);
    }
  };

  onSessionSynced((s) => void get().applyServer(s));

  return {
    session: null,
    ended: null,
    offsetMs: 0,

    loadActive: async () => {
      const cached = await kvGet<FocusSession>('activeSession');
      if (cached) set({ session: cached });
      try {
        const r = await api<{ session: FocusSession | null; serverTime: string }>('/sessions/active');
        const offsetMs = new Date(r.serverTime).getTime() - Date.now();
        set({ offsetMs });
        // còn hành động chưa gửi thì giữ bản cục bộ
        if (cached && ((await hasPendingFor('sessions', cached.id)) || (cached.clientId && (await hasPendingFor('sessions', cached.clientId))))) return;
        await setLocal(r.session);
      } catch {
        /* offline: dùng bản cache */
      }
    },

    start: async (p) => {
      const at = now(get().offsetMs);
      const clientId = uid();
      const iso = at.toISOString();
      const local: FocusSession = {
        id: clientId,
        clientId,
        createdAt: iso,
        updatedAt: iso,
        subject: p.subject,
        task: p.task,
        goal: p.goal,
        mode: p.mode,
        plannedMinutes: p.plannedMinutes,
        pomodoro: { ...p.pomodoro, completedCycles: 0 },
        status: 'active',
        startedAt: iso,
        endedAt: null,
        segments: [{ type: 'focus', startedAt: iso, endedAt: null }],
        actualFocusSeconds: 0,
        breakSeconds: 0,
        pauseCount: 0,
        distractionCount: 0,
        appLeaveCount: 0,
        shieldEnabled: p.strict ? true : p.shieldEnabled,
        strict: Boolean(p.strict),
        device: PLATFORM,
        autoPausedAt: null,
        summary: { goalAchieved: null, rating: null, note: '' },
      };
      set({ ended: null });
      await setLocal(local);
      if (p.strict) void lockScreen();
      await enqueue({
        mutationId: uid(),
        entity: 'sessions',
        op: 'start',
        refId: clientId,
        payload: { clientId, data: { ...p, device: PLATFORM, at: iso, takeover: true } },
      });
      void useData.getState().sync();
    },

    pause: async (atIn?: Date) => {
      const s = get().session;
      if (!s) return;
      const at = atIn ?? now(get().offsetMs);
      await setLocal(localPause(s, at));
      await queue('pause', s, { at: at.toISOString() });
    },

    resume: async () => {
      const s = get().session;
      if (!s) return;
      const at = now(get().offsetMs);
      await setLocal(localResume(s, at));
      await queue('resume', s, { at: at.toISOString() });
    },

    takeBreak: async () => {
      const s = get().session;
      if (!s) return;
      const at = now(get().offsetMs);
      await setLocal(localBreak(s, at));
      await queue('break', s, { at: at.toISOString() });
    },

    end: async (summary) => {
      const s = get().session;
      if (!s) return;
      const at = now(get().offsetMs);
      await setLocal(localEnd(s, at, summary));
      await queue('end', s, { ...summary, at: at.toISOString() });
    },

    appLeave: async (leftAt, returnedAt) => {
      const s = get().session;
      if (!s) return;
      await setLocal({ ...s, appLeaveCount: s.appLeaveCount + 1 });
      await queue('app-leave', s, { leftAt: leftAt.toISOString(), returnedAt: returnedAt.toISOString(), device: PLATFORM });
    },

    heartbeat: async () => {
      const s = get().session;
      if (!s || !OPEN.includes(s.status)) return;
      const at = now(get().offsetMs).toISOString();
      if (useData.getState().online && s.id !== s.clientId) {
        try {
          const r = await api<{ session: FocusSession }>(`/sessions/${s.id}/heartbeat`, { method: 'POST', body: { at } });
          if (r.session.serverTime) set({ offsetMs: new Date(r.session.serverTime).getTime() - Date.now() });
          return;
        } catch {
          /* rơi xuống xếp hàng */
        }
      }
      // Offline: chỉ giữ heartbeat mới nhất trong hàng đợi
      await removeQueued('sessions', 'heartbeat', refOf(s));
      await enqueue({ mutationId: uid(), entity: 'sessions', op: 'heartbeat', refId: refOf(s), payload: { clientId: s.clientId, data: { at } } });
    },

    applyServer: async (srv) => {
      const cur = get().session;
      const sameAsCurrent = cur && (cur.id === srv.id || (cur.clientId && cur.clientId === srv.clientId));
      if (srv.serverTime) set({ offsetMs: new Date(srv.serverTime).getTime() - Date.now() });
      if (sameAsCurrent) {
        const pending =
          (await hasPendingFor('sessions', cur!.id)) || (cur!.clientId ? await hasPendingFor('sessions', cur!.clientId) : false);
        // vẫn còn hành động chưa gửi: chỉ cập nhật id thật, giữ trạng thái cục bộ
        if (pending) return;
        return setLocal({ ...srv, clientId: srv.clientId ?? cur!.clientId });
      }
      if (!cur && OPEN.includes(srv.status)) return setLocal(srv); // phiên bắt đầu trên Web
      const ended = get().ended;
      if (ended && (ended.id === srv.id || ended.clientId === srv.clientId)) set({ ended: srv });
    },

    clearEnded: () => set({ ended: null }),
  };
});
