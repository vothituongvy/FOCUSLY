/**
 * Phase 4 – đồng bộ index MongoDB theo schema (chạy sau mỗi lần deploy thay đổi model):
 *   npm run db:indexes
 * Ở production nên tắt autoIndex để không tạo index lúc khởi động.
 */
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import '../models/User';
import '../models/AuthSession';
import '../models/Learning';
import '../models/FocusSession';
import '../models/Distraction';
import '../models/SyncMutation';
import '../models/Learn';
import '../models/Notification';
import '../models/AI';

async function main() {
  await connectDb();
  for (const name of mongoose.modelNames()) {
    const dropped = await mongoose.model(name).syncIndexes();
    console.log(`✓ ${name}${dropped.length ? ` (xoá index cũ: ${dropped.join(', ')})` : ''}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
