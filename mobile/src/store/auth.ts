import { create } from 'zustand';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { api, tokenStore } from '../api/client';
import { GOOGLE_WEB_CLIENT_ID } from '../config';
import { kvGet, kvSet, wipeAll, initDb } from '../offline/db';
import { disconnectSocket } from '../socket';
import type { User } from '../types';

interface AuthRes {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  status: 'loading' | 'authed' | 'guest';
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
}

if (GOOGLE_WEB_CLIENT_ID) GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';

export const useAuth = create<AuthState>((set) => {
  const finish = async (r: AuthRes) => {
    await tokenStore.set(r.accessToken, r.refreshToken);
    await initDb();
    await kvSet('user', r.user);
    set({ user: r.user, status: 'authed' });
  };

  tokenStore.onLogout(() => set({ user: null, status: 'guest' }));

  return {
    user: null,
    status: 'loading',

    bootstrap: async () => {
      await initDb();
      const has = await tokenStore.load();
      if (!has) return set({ status: 'guest' });
      // Offline-first: dùng user đã lưu, rồi làm mới nếu có mạng
      const cached = await kvGet<User>('user');
      if (cached) set({ user: cached, status: 'authed' });
      try {
        const { user } = await api<{ user: User }>('/auth/me');
        await kvSet('user', user);
        set({ user, status: 'authed' });
      } catch {
        if (!cached) set({ status: 'guest' });
      }
    },

    login: async (email, password) => {
      await finish(await api<AuthRes>('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
    },

    register: async (name, email, password) => {
      await finish(await api<AuthRes>('/auth/register', { method: 'POST', body: { name, email, password, timezone: tz(), language: 'vi' }, auth: false }));
    },

    googleLogin: async () => {
      if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Chưa cấu hình GOOGLE_WEB_CLIENT_ID trong src/config.ts');
      await GoogleSignin.hasPlayServices();
      const res = (await GoogleSignin.signIn()) as unknown as { idToken?: string; data?: { idToken?: string } };
      const idToken = res.data?.idToken ?? res.idToken;
      if (!idToken) throw new Error('Không lấy được Google ID token');
      await finish(await api<AuthRes>('/auth/google', { method: 'POST', body: { idToken }, auth: false }));
    },

    logout: async () => {
      const refreshToken = tokenStore.refresh;
      try {
        if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
        await GoogleSignin.signOut().catch(() => undefined);
      } catch {
        /* offline */
      }
      disconnectSocket();
      await tokenStore.clear();
      await wipeAll();
      set({ user: null, status: 'guest' });
    },

    setUser: (user) => {
      void kvSet('user', user);
      set({ user });
    },
  };
});
