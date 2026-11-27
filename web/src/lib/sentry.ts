/**
 * Báo lỗi giao diện lên Sentry không cần SDK (gửi "envelope" bằng fetch).
 * Bật bằng NEXT_PUBLIC_SENTRY_DSN trên Vercel.
 */
const DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim();
const parsed = (() => {
  const m = /^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(DSN);
  return m ? { key: m[1], host: m[2], project: m[3] } : null;
})();
const recent = new Map<string, number>();

function frames(stack = '') {
  return stack
    .split('\n')
    .map((l) => /(?:at\s+(?:(.+?)\s+\()?|^(.*?)@)(.+?):(\d+):(\d+)\)?$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ function: m![1] ?? m![2] ?? '?', filename: m![3], lineno: Number(m![4]), colno: Number(m![5]), in_app: true }))
    .reverse();
}

export function captureException(err: unknown, extra: Record<string, string> = {}) {
  if (!parsed || typeof window === 'undefined') return;
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const sig = `${e.name}:${e.message}`.slice(0, 200);
  if (Date.now() - (recent.get(sig) ?? 0) < 60_000) return;
  recent.set(sig, Date.now());
  const id = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^a-f0-9]/gi, '').padEnd(32, '0').slice(0, 32);
  const event = {
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: process.env.NODE_ENV,
    release: `focusly-web@${process.env.NEXT_PUBLIC_APP_VERSION ?? '1'}`,
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: frames(e.stack) } }] },
    request: { url: location.href, headers: { 'User-Agent': navigator.userAgent } },
    tags: extra,
  };
  const body = `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn: DSN })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`;
  void fetch(`https://${parsed.host}/api/${parsed.project}/envelope/?sentry_key=${parsed.key}&sentry_version=7`, { method: 'POST', body, keepalive: true }).catch(() => undefined);
}
