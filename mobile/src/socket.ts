import { io, Socket } from 'socket.io-client';
import { API_URL } from './config';
import { refreshTokens, tokenStore } from './api/client';

let socket: Socket | null = null;

/** Socket.IO realtime: nhận thay đổi từ Web / thiết bị khác */
export function connectSocket(handlers: {
  onChanged: (e: { entity: string; op: string; doc: unknown }) => void;
  onSession: (s: unknown) => void;
  onReconnect: () => void;
}) {
  if (socket || !tokenStore.access) return socket;
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: (cb) => cb({ token: tokenStore.access }),
    reconnectionDelayMax: 10000,
  });
  socket.on('sync:changed', handlers.onChanged);
  socket.on('session:updated', handlers.onSession);
  socket.on('connect', handlers.onReconnect);
  socket.on('connect_error', async (err) => {
    if (err.message === 'UNAUTHORIZED' && (await refreshTokens().catch(() => false))) socket?.connect();
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/** Nghe thêm một sự kiện realtime (VD: room:update) – trả về hàm huỷ */
export function onSocket(event: string, fn: (payload: unknown) => void): () => void {
  socket?.on(event, fn);
  return () => {
    socket?.off(event, fn);
  };
}
