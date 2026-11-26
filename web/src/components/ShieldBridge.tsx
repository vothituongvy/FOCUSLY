'use client';

import { useCallback, useEffect } from 'react';
import { get } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { extensionShieldOff, extensionShieldOn, hasExtensionConfig } from '@/lib/extension';
import type { ShieldState } from '@/lib/types';

/**
 * Device Sync cho Focus Shield: khi phiên học bắt đầu/kết thúc ở BẤT KỲ thiết bị nào
 * (kể cả Mobile), Web nhận sự kiện realtime và bật/tắt chặn website trên Chrome Extension.
 */
export function ShieldBridge() {
  const sync = useCallback(async () => {
    if (!hasExtensionConfig()) return;
    try {
      const state = await get<ShieldState>('/shield/state');
      if (state.active) await extensionShieldOn(state.blockList, state.session?.goal ?? '', state.session?.id ?? '', { strict: state.strict, allowList: state.allowList });
      else await extensionShieldOff();
    } catch {
      /* offline */
    }
  }, []);

  useEffect(() => {
    void sync();
    const id = setInterval(() => void sync(), 60_000); // khung giờ Focus Schedule
    return () => clearInterval(id);
  }, [sync]);

  useSocketEvent('session:updated', () => void sync());
  useSocketEvent('shield:updated', () => void sync());
  return null;
}
