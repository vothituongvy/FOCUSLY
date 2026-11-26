'use client';

import { create } from 'zustand';
import { api, post, tokens } from './api';
import type { User } from './types';

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  status: 'loading' | 'authed' | 'guest';
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  refreshUser: () => Promise<void>;
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  init: async () => {
    if (!tokens.access && !tokens.refresh) return set({ status: 'guest', user: null });
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      set({ user, status: 'authed' });
    } catch {
      tokens.clear();
      set({ user: null, status: 'guest' });
    }
  },

  login: async (email, password) => {
    const r = await post<AuthResponse>('/auth/login', { email, password });
    tokens.set(r.accessToken, r.refreshToken);
    set({ user: r.user, status: 'authed' });
    await get().refreshUser();
  },

  register: async (name, email, password) => {
    const r = await post<AuthResponse>('/auth/register', { name, email, password, timezone: tz(), language: 'vi' });
    tokens.set(r.accessToken, r.refreshToken);
    set({ user: r.user, status: 'authed' });
  },

  googleLogin: async (idToken) => {
    const r = await post<AuthResponse>('/auth/google', { idToken });
    tokens.set(r.accessToken, r.refreshToken);
    set({ user: r.user, status: 'authed' });
    await get().refreshUser();
  },

  logout: async () => {
    const refreshToken = tokens.refresh;
    try {
      if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false });
    } catch {
      /* ignore */
    }
    tokens.clear();
    set({ user: null, status: 'guest' });
  },

  setUser: (user) => set({ user }),

  refreshUser: async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      set({ user });
    } catch {
      /* ignore */
    }
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('focusly:logout', () => useAuth.setState({ user: null, status: 'guest' }));
}
