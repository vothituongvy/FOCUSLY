'use client';

/**
 * Hộp thoại của FOCUSLY thay cho confirm()/prompt() của trình duyệt (xấu, không theo giao diện).
 * Dùng: if (!(await uiConfirm('Xoá bộ thẻ?'))) return;
 *       const reason = await uiPrompt('Lý do gỡ', 'mặc định');   // null nếu huỷ
 */
export interface DialogReq {
  id: number;
  kind: 'confirm' | 'prompt' | 'alert';
  title?: string;
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  resolve: (v: boolean | string | null) => void;
}

type Listener = (q: DialogReq[]) => void;
let queue: DialogReq[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(queue));

export function subscribeDialogs(l: Listener) {
  listeners.add(l);
  l(queue);
  return () => void listeners.delete(l);
}
export function closeDialog(id: number, value: boolean | string | null) {
  const d = queue.find((x) => x.id === id);
  queue = queue.filter((x) => x.id !== id);
  emit();
  d?.resolve(value);
}

/** câu hỏi bắt đầu bằng Xoá / Huỷ / Rời / Khoá / Chặn -> nút đỏ */
const looksDanger = (m: string) => /^(xoá|xóa|huỷ|hủy|rời|khoá|khóa|chặn|gỡ|delete|remove|leave|block)/i.test(m.trim());

function open(req: Omit<DialogReq, 'id' | 'resolve'>) {
  return new Promise<boolean | string | null>((resolve) => {
    // chưa có nơi hiện hộp thoại (hiếm) -> dùng hộp thoại trình duyệt
    if (!listeners.size) {
      if (req.kind === 'prompt') return resolve(window.prompt(req.message, req.defaultValue));
      if (req.kind === 'alert') return resolve((window.alert(req.message), true));
      return resolve(window.confirm(req.message));
    }
    queue = [...queue, { ...req, id: ++seq, resolve }];
    emit();
  });
}

export const uiConfirm = (message: string, opts: { title?: string; okLabel?: string; cancelLabel?: string; danger?: boolean } = {}) =>
  open({ kind: 'confirm', message, ...opts, danger: opts.danger ?? looksDanger(message) }) as Promise<boolean>;

export const uiPrompt = (message: string, defaultValue = '', opts: { title?: string; okLabel?: string } = {}) =>
  open({ kind: 'prompt', message, defaultValue, ...opts }) as Promise<string | null>;

export const uiAlert = (message: string, opts: { title?: string } = {}) => open({ kind: 'alert', message, ...opts }).then(() => undefined);
