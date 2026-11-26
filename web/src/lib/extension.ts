'use client';

/**
 * Giao tiếp với FOCUSLY Chrome Extension (externally_connectable).
 * Web gửi trạng thái Focus Shield để extension chặn website trong Block List.
 */
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID ?? '';

interface ChromeRuntime {
  sendMessage: (id: string, msg: unknown, cb?: (res: unknown) => void) => void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return EXTENSION_ID && w.chrome?.runtime?.sendMessage ? w.chrome.runtime : null;
}

export function sendToExtension<T = unknown>(msg: Record<string, unknown>): Promise<T | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      rt.sendMessage(EXTENSION_ID, msg, (res) => {
        if (rt.lastError) return resolve(null);
        resolve((res as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
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

export const hasExtensionConfig = () => Boolean(EXTENSION_ID);
