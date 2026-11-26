import mongoose from 'mongoose';
import { env } from './env';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  // Production: index được tạo bằng `npm run db:indexes` (tránh khoá collection lúc khởi động)
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000, autoIndex: !env.isProd || process.env.MONGO_AUTO_INDEX === 'true', maxPoolSize: 20 });
  console.log(`[db] Đã kết nối MongoDB: ${mongoose.connection.name}`);
}
