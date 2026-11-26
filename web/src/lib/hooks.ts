'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, get } from './api';
import { ChangeEvent, useSocketEvent } from './socket';

/**
 * Tải dữ liệu từ API và tự tải lại khi thiết bị khác thay đổi dữ liệu liên quan
 * (nhận sự kiện `sync:changed` qua Socket.IO) hoặc khi tab được mở lại.
 */
export function useResource<T>(path: string | null, entities: string[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setError(null);
      const d = await get<T>(path);
      setData(d);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(Boolean(path));
    void reload();
  }, [reload, path]);

  const key = entities.join(',');
  useSocketEvent<ChangeEvent>('sync:changed', (e) => {
    if (!key || !key.split(',').includes(e.entity)) return;
    // gom nhiều sự kiện liên tiếp thành 1 lần tải lại
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 300);
  });

  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && void reload();
    const onReconnect = () => void reload();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focusly:reconnected', onReconnect);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focusly:reconnected', onReconnect);
    };
  }, [reload]);

  return { data, setData, loading, error, reload };
}

/** Đồng hồ tick mỗi giây */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
