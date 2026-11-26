import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, PLATFORM } from '../config';
import { LANG, tr } from '../i18n';

const ACCESS = 'focusly.access';
const REFRESH = 'focusly.refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onLogout: (() => void) | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: unknown) {
    super(message);
  }
}

export const tokenStore = {
  async load() {
    [accessToken, refreshToken] = await Promise.all([AsyncStorage.getItem(ACCESS), AsyncStorage.getItem(REFRESH)]);
    return Boolean(accessToken || refreshToken);
  },
  async set(a: string, r: string) {
    accessToken = a;
    refreshToken = r;
    // setItem/removeItem có ở cả AsyncStorage v2 và v3 (v3 đã bỏ multiSet/multiRemove)
    await Promise.all([AsyncStorage.setItem(ACCESS, a), AsyncStorage.setItem(REFRESH, r)]);
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await Promise.all([AsyncStorage.removeItem(ACCESS), AsyncStorage.removeItem(REFRESH)]);
  },
  get access() {
    return accessToken;
  },
  get refresh() {
    return refreshToken;
  },
  onLogout(fn: () => void) {
    onLogout = fn;
  },
};

let refreshing: Promise<boolean> | null = null;

export function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing;
  if (!refreshToken) return Promise.resolve(false);
  refreshing = fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': PLATFORM },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (r) => {
      if (r.status === 401) return false;
      if (!r.ok) throw new Error('network');
      const d = await r.json();
      await tokenStore.set(d.accessToken, d.refreshToken);
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

type Opts = { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number };

export async function api<T = unknown>(path: string, opts: Opts = {}, retry = true): Promise<T> {
  const { method = 'GET', body, auth = true, timeoutMs = 15000 } = opts;
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = { 'X-Client-Platform': PLATFORM, 'X-Lang': LANG };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && retry && refreshToken) {
    const ok = await refreshTokens().catch(() => null);
    if (ok) return api<T>(path, opts, false);
    if (ok === false) {
      await tokenStore.clear();
      onLogout?.();
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? tr('Lỗi {0}', res.status), data?.error?.code, data);
  return data as T;
}

/** Lỗi mạng (không phải lỗi từ server) => nên xếp hàng offline */
export const isNetworkError = (e: unknown) => !(e instanceof ApiError);

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.name === 'AbortError' || e.message.includes('Network') ? tr('Không kết nối được máy chủ') : e.message;
  return tr('Đã có lỗi xảy ra');
}
