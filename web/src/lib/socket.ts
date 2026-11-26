'use client';

import { io, Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { API_URL, refreshTokens, tokens } from './api';

let socket: Socket | null = null;
const watchers = new Set<() => void>();
const notify = () => watchers.forEach((w) => w());

/** Kết nối realtime (Socket.IO) để đồng bộ Web <-> Mobile */
export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket) return socket;
  if (!tokens.access) return null;

  socket = io(API_URL, {
    auth: (cb) => cb({ token: tokens.access }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect_error', async (err) => {
    if (err.message === 'UNAUTHORIZED') {
      const ok = await refreshTokens();
      if (ok) socket?.connect();
    }
  });
  // Khi kết nối lại sau khi mất mạng: báo các màn hình tải lại dữ liệu
  socket.io.on('reconnect', () => window.dispatchEvent(new Event('focusly:reconnected')));
  notify();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  notify();
}

/** Lắng nghe sự kiện socket trong component (tự đăng ký lại khi socket được tạo) */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const w = () => setVersion((v) => v + 1);
    watchers.add(w);
    return () => {
      watchers.delete(w);
    };
  }, []);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event, version]);
}

export interface ChangeEvent {
  entity: string;
  op: 'create' | 'update' | 'delete' | 'bulk';
  doc: unknown;
}
