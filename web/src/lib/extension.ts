'use client';

/**
 * Giao tiếp với FOCUSLY Chrome Extension (externally_connectable).
 * Web gửi trạng thái Focus Shield để extension chặn website trong Block List.
 */
// Có thể ghi nhiều ID, cách nhau bằng dấu phẩy (bản zip, bản Edge Add-ons, bản Chrome Web Store...)
const EXTENSION_IDS = (process.env.NEXT_PUBLIC_EXTENSION_ID ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb?: (res: unknown) => void) => void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return EXTENSION_IDS.length && w.chrome?.runtime?.sendMessage ? w.chrome.runtime : null;
}

function sendTo<T>(rt: ChromeRuntime, id: string, msg: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      rt.sendMessage(id, msg, (res) => {
        if (rt.lastError) return resolve(null);
        resolve((res as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** ID của extension đang cài trên trình duyệt này (thử lần lượt các ID đã cấu hình) */
let found: Promise<string | null> | null = null;
function installedId(rt: ChromeRuntime): Promise<string | null> {
  if (EXTENSION_IDS.length === 1) return Promise.resolve(EXTENSION_IDS[0]);
  if (!found) {
    found = (async () => {
      for (const id of EXTENSION_IDS) {
        const r = await sendTo<{ ok: boolean }>(rt, id, { type: 'PING' });
        if (r?.ok) return id;
      }
      found = null; // chưa cài: lần sau thử lại
      return null;
    })();
  }
  return found;
}

export async function sendToExtension<T = unknown>(msg: Record<string, unknown>): Promise<T | null> {
  const rt = runtime();
  if (!rt) return null;
  const id = await installedId(rt);
  return id ? sendTo<T>(rt, id, msg) : null;
}

export async function isExtensionInstalled(): Promise<boolean> {
  const r = await sendToExtension<{ ok: boolean }>({ type: 'PING' });
  return Boolean(r?.ok);
}

export function extensionShieldOn(blockList: string[], goal: string, sessionId: string, opts: { strict?: boolean; allowList?: string[] } = {}) {
  return sendToExtension({ type: 'SHIELD_ON', blockList, goal, sessionId, strict: Boolean(opts.strict), allowList: opts.allowList ?? [] });
}

/** Các lần cố mở trang bị chặn / chuyển tab mà extension ghi nhận (lấy xong extension sẽ xoá) */
export async function extensionAttempts(): Promise<{ host: string; kind: 'site' | 'tab'; at: number }[]> {
  const r = await sendToExtension<{ ok: boolean; attempts: { host: string; kind: 'site' | 'tab'; at: number }[] }>({ type: 'GET_ATTEMPTS' });
  return r?.attempts ?? [];
}

export function extensionShieldOff() {
  return sendToExtension({ type: 'SHIELD_OFF' });
}

export function connectExtension(apiUrl: string, token: string) {
  return sendToExtension<{ ok: boolean }>({ type: 'CONNECT', apiUrl, token });
}

export const hasExtensionConfig = () => EXTENSION_IDS.length > 0;
