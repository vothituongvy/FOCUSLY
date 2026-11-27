'use client';

import { useState } from 'react';
import { errorMessage, get, post } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { Toggle } from '@/components/ui';
import { useResource } from '@/lib/hooks';

/** Bật/tắt chia sẻ bộ thẻ / bộ câu hỏi lên Thư viện cộng đồng */
export function ShareToLibrary({ kind, id }: { kind: 'deck' | 'quiz'; id: string }) {
  const info = useResource<{ item: { isPublic: boolean; copies: number } }>(id ? `/library/${kind}/${id}` : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!id || !info.data) return null;
  const on = info.data.item.isPublic;
  const set = async (v: boolean) => {
    setBusy(true);
    setError('');
    try {
      await post(`/library/${kind}/${id}/publish`, { isPublic: v });
      info.setData(await get(`/library/${kind}/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="share-lib">
      <label className="row small" style={{ gap: 8, opacity: busy ? 0.6 : 1 }}>
        <Toggle on={on} onChange={set} label={tr('Chia sẻ lên Thư viện cộng đồng')} />
        <span>
          {tr('Chia sẻ lên Thư viện cộng đồng')}
          {on && <span className="muted"> · {tr('{0} lượt sao chép', info.data.item.copies)}</span>}
        </span>
      </label>
      {error && <span className="error-text small">{error}</span>}
    </div>
  );
}
