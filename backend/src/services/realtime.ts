import http from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from './tokens';

let io: Server | null = null;

/** 'bulk' = nhiều bản ghi đổi cùng lúc, client nên tải lại danh sách */
export type ChangeOp = 'create' | 'update' | 'delete' | 'bulk';

/**
 * Socket.IO: mỗi user vào phòng `user:<id>`.
 * Khi dữ liệu thay đổi, server phát sự kiện để Web/Mobile cập nhật ngay.
 */
export function initRealtime(server: http.Server): Server {
  io = new Server(server, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.platform = payload.plt;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const room = `user:${socket.data.userId}`;
    socket.join(room);
    socket.to(room).emit('device:online', { platform: socket.data.platform, socketId: socket.id });
    socket.on('disconnect', () => {
      socket.to(room).emit('device:offline', { platform: socket.data.platform, socketId: socket.id });
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Thông báo thay đổi dữ liệu chung cho mọi thiết bị của user */
export function notifyChange(userId: string, entity: string, op: ChangeOp, doc: unknown): void {
  emitToUser(userId, 'sync:changed', { entity, op, doc, at: new Date().toISOString() });
}
