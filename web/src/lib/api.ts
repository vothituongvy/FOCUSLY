'use client';
import { LANG, tr } from '@/lib/i18n';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const ACCESS_KEY = 'focusly.accessToken';
const REFRESH_KEY = 'focusly.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

export const tokens = {
  get access() {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    window.dispatchEvent(new Event('focusly:tokens'));
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new Event('focusly:tokens'));
  },
};

let refreshing: Promise<boolean> | null = null;

/** Làm mới access token (chỉ 1 request refresh chạy cùng lúc) */
export function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  const rt = tokens.refresh;
  if (!rt) return Promise.resolve(false);
  refreshing = fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'web' },
    body: JSON.stringify({ refreshToken: rt }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = await r.json();
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean };

export async function api<T = unknown>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const h: Record<string, string> = { 'X-Client-Platform': 'web', 'X-Lang': LANG, ...(headers as Record<string, string>) };
  if (!isForm && body !== undefined) h['Content-Type'] = 'application/json';
  if (auth && tokens.access) h.Authorization = `Bearer ${tokens.access}`;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: h,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry && tokens.refresh) {
    if (await refreshTokens()) return api<T>(path, opts, false);
    tokens.clear();
    window.dispatchEvent(new Event('focusly:logout'));
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.message ?? tr('Lỗi {0}', res.status), data?.error?.code, data);
  }
  return data as T;
}

export const get = <T>(p: string) => api<T>(p);
export const post = <T>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body: body ?? {} });
export const patch = <T>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body });
export const put = <T>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body });
export const del = <T>(p: string) => api<T>(p, { method: 'DELETE' });

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = (e.data as { error?: { details?: { fieldErrors?: Record<string, string[]> } } })?.error?.details;
    const field = details?.fieldErrors && Object.values(details.fieldErrors).flat()[0];
    return field ? `${e.message}: ${field}` : e.message;
  }
  if (e instanceof Error) return e.message === 'Failed to fetch' ? tr('Không kết nối được máy chủ') : e.message;
  return tr('Đã có lỗi xảy ra');
}
