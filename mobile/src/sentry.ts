import { Platform } from 'react-native';
import { APP_VERSION, SENTRY_DSN } from './config';

/**
 * Báo lỗi app lên Sentry không cần SDK: bắt lỗi JS chưa xử lý (ErrorUtils) và gửi "envelope" qua fetch.
 * Bật bằng cách điền SENTRY_DSN trong src/config.ts.
 */
const parsed = (() => {
  const m = /^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(SENTRY_DSN.trim());
  return m ? { key: m[1], host: m[2], project: m[3] } : null;
})();
const recent = new Map<string, number>();

function frames(stack = '') {
  return stack
    .split('\n')
    .map((l) => /^(?:\s*at\s+)?(.*?)@?(?:\(|@)?([^@()]+):(\d+):(\d+)\)?$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ function: m![1] || '?', filename: m![2], lineno: Number(m![3]), colno: Number(m![4]), in_app: true }))
    .reverse();
}

export function captureException(err: unknown, tags: Record<string, string> = {}) {
  if (!parsed) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const sig = `${e.name}:${e.message}`.slice(0, 200);
  if (Date.now() - (recent.get(sig) ?? 0) < 60_000) return;
  recent.set(sig, Date.now());
  const id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: tags.fatal === '1' ? 'fatal' : 'error',
    environment: __DEV__ ? 'development' : 'production',
    release: `focusly-mobile@${APP_VERSION}`,
    contexts: { os: { name: Platform.OS, version: String(Platform.Version) } },
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: frames(e.stack) } }] },
    tags,
  };
  const body = `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  void fetch(`https://${parsed.host}/api/${parsed.project}/envelope/?sentry_key=${parsed.key}&sentry_version=7`, { method: 'POST', body }).catch(() => undefined);
}

/** Gắn bộ bắt lỗi toàn cục – gọi 1 lần ở index.js */
export function installErrorReporting() {
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } };
  const eu = g.ErrorUtils;
  if (!eu || !parsed) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((error, fatal) => {
    captureException(error, { fatal: fatal ? '1' : '0' });
    prev(error, fatal);
  });
}
