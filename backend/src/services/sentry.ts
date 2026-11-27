import crypto from 'crypto';

/**
 * Báo lỗi tự động lên Sentry mà không cần SDK: gửi "envelope" qua HTTP.
 * Bật bằng biến môi trường SENTRY_DSN (lấy ở sentry.io → Project → Client Keys).
 */
const DSN = (process.env.SENTRY_DSN ?? '').trim();
const dsn = (() => {
  const m = /^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(DSN);
  return m ? { key: m[1], host: m[2], project: m[3] } : null;
})();

export const sentryEnabled = () => Boolean(dsn);

/** Tách stack trace của V8 thành frame cho Sentry (cũ -> mới) */
export function stackFrames(stack = '') {
  return stack
    .split('\n')
    .slice(1)
    .map((l) => /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ function: m![1] ?? '?', filename: m![2], lineno: Number(m![3]), colno: Number(m![4]), in_app: !m![2].includes('node_modules') && !m![2].startsWith('node:') }))
    .reverse();
}

const recent = new Map<string, number>();

export function captureException(err: unknown, ctx: { userId?: string; method?: string; url?: string; tags?: Record<string, string> } = {}) {
  if (!dsn) return;
  const e = err instanceof Error ? err : new Error(String(err));
  // chống gửi dồn cùng một lỗi (tối đa 1 lần / phút)
  const sig = `${e.name}:${e.message}`.slice(0, 200);
  if (Date.now() - (recent.get(sig) ?? 0) < 60_000) return;
  recent.set(sig, Date.now());
  if (recent.size > 500) recent.clear();

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: process.env.NODE_ENV ?? 'development',
    release: `focusly-backend@${process.env.npm_package_version ?? '2.0.0'}`,
    server_name: process.env.RENDER_SERVICE_NAME ?? 'api',
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: stackFrames(e.stack) } }] },
    request: ctx.url ? { method: ctx.method, url: ctx.url } : undefined,
    user: ctx.userId ? { id: ctx.userId } : undefined,
    tags: ctx.tags,
  };
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: DSN })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  void fetch(`https://${dsn.host}/api/${dsn.project}/envelope/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=focusly-node/1.0` },
    body,
  }).catch(() => undefined);
}
