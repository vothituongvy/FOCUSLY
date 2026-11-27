/**
 * Xây / bổ sung THƯ VIỆN KIẾN THỨC CHUNG cho FOCUSLY Brain ngay từ máy bạn (không cần chờ máy chủ tự chạy):
 *   npm run brain:knowledge
 * Dùng MONGODB_URI trong backend/.env (trỏ tới Atlas nếu muốn nạp thẳng cho bản đang chạy trên Render).
 */
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { buildMissing, knowledgeStats } from '../services/brain/knowledge';

async function main() {
  await connectDb();
  await buildMissing();
  console.log('[brain] Thống kê:', await knowledgeStats());
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
