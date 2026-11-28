'use client';

import { useEffect, useRef, useState } from 'react';
import { closeDialog, subscribeDialogs, type DialogReq } from '@/lib/dialog';
import { tr } from '@/lib/i18n';

/** Nơi hiện hộp thoại uiConfirm / uiPrompt / uiAlert (đặt một lần trong layout) */
export function DialogHost() {
  const [queue, setQueue] = useState<DialogReq[]>([]);
  useEffect(() => subscribeDialogs(setQueue), []);
  const d = queue[0];
  if (!d) return null;
  return <DialogView key={d.id} d={d} />;
}

function DialogView({ d }: { d: DialogReq }) {
  const [value, setValue] = useState(d.defaultValue ?? '');
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cancel = () => closeDialog(d.id, d.kind === 'prompt' ? null : d.kind === 'alert' ? true : false);
  const ok = () => closeDialog(d.id, d.kind === 'prompt' ? value : true);

  useEffect(() => {
    (d.kind === 'prompt' ? inputRef.current : okRef.current)?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const icon = d.kind === 'prompt' ? '✎' : d.danger ? '!' : d.kind === 'alert' ? 'i' : '?';
  return (
    <div className="modal-backdrop ui-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className={`ui-dialog ${d.danger ? 'danger' : ''}`} role="alertdialog" aria-modal aria-labelledby={`dlg-${d.id}`}>
        <span className="ui-dialog-icon" aria-hidden>
          {icon}
        </span>
        {d.title && <h2 className="ui-dialog-title">{d.title}</h2>}
        <p id={`dlg-${d.id}`} className="ui-dialog-msg">
          {d.message}
        </p>
        {d.kind === 'prompt' && (
          <textarea
            ref={inputRef}
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ok();
              }
            }}
          />
        )}
        <div className="ui-dialog-actions">
          {d.kind !== 'alert' && (
            <button className="btn secondary" onClick={cancel}>
              {d.cancelLabel ?? tr('Huỷ')}
            </button>
          )}
          <button ref={okRef} className={`btn ${d.danger ? 'danger' : 'marker'}`} onClick={ok}>
            {d.okLabel ?? (d.kind === 'alert' ? tr('Đã hiểu') : d.danger ? tr('Đồng ý') : tr('Đồng ý'))}
          </button>
        </div>
      </div>
    </div>
  );
}
