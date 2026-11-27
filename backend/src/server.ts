import http from 'http';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDb } from './config/db';
import { createApp } from './app';
import { initRealtime } from './services/realtime';
import { startScheduler, stopScheduler } from './services/scheduler';
import { startKnowledgeBuilder } from './services/brain/knowledge';
import { captureException } from './services/sentry';

async function main() {
  await connectDb();
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);

  server.listen(env.port, () => {
    console.log(`[api] FOCUSLY API chạy tại http://localhost:${env.port}/api`);
    startScheduler();
    // FOCUSLY Brain: tự tải thư viện kiến thức chung (chạy nền, chỉ tải chủ đề còn thiếu)
    startKnowledgeBuilder();
  });

  const shutdown = async (signal: string) => {
    console.log(`[api] Nhận ${signal}, đang tắt...`);
    stopScheduler();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection', reason);
  captureException(reason, { tags: { kind: 'unhandledRejection' } });
});
process.on('uncaughtException', (err) => {
  console.error('[api] uncaughtException', err);
  captureException(err, { tags: { kind: 'uncaughtException' } });
});

main().catch((err) => {
  console.error('[api] Không khởi động được server', err);
  process.exit(1);
});
