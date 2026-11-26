/**
 * Tạo dữ liệu demo:  npm run seed
 * Tài khoản: demo@focusly.app / Focusly123
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { UserModel } from '../models/User';
import { CourseModel, GoalModel, SubjectModel, TaskModel } from '../models/Learning';
import { FocusSessionModel } from '../models/FocusSession';
import { DistractionModel } from '../models/Distraction';
import { CardModel, DeckModel, MaterialModel, QuizModel } from '../models/Learn';

async function main() {
  await connectDb();
  const email = 'demo@focusly.app';
  const old = await UserModel.findOne({ email });
  if (old) {
    await Promise.all(
      [SubjectModel, CourseModel, GoalModel, TaskModel, FocusSessionModel, DistractionModel, DeckModel, CardModel, QuizModel, MaterialModel].map((m) =>
        (m as mongoose.Model<unknown>).deleteMany({ user: old._id }),
      ),
    );
    await old.deleteOne();
  }

  const user = await UserModel.create({
    email,
    name: 'Demo Learner',
    passwordHash: await bcrypt.hash('Focusly123', 12),
    profile: {
      learningGoal: 'Đạt IELTS 6.5 và giữ điểm Toán trên 8',
      interestedSubjects: ['Sinh học', 'Tiếng Anh'],
      preferredStudyTimes: [{ start: '19:00', end: '22:00' }],
      dailyTargetMinutes: 120,
      timezone: 'Asia/Ho_Chi_Minh',
      language: 'vi',
    },
  });

  const rn = await SubjectModel.create({ user: user._id, name: 'Sinh học', color: '#1f7a4d', icon: '🌱' });
  const en = await SubjectModel.create({ user: user._id, name: 'Tiếng Anh', color: '#f59e0b', icon: '🇬🇧' });
  const hooks = await CourseModel.create({ user: user._id, subject: rn._id, name: 'Chương 3: Quang hợp' });
  const goal = await GoalModel.create({
    user: user._id,
    subject: rn._id,
    title: 'Hiểu và giải thích được quá trình quang hợp',
    targetDate: new Date('2026-11-28'),
  });

  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const tasks = await TaskModel.create([
    {
      user: user._id,
      subject: rn._id,
      course: hooks._id,
      goal: goal._id,
      title: 'Đọc bài Quang hợp và tóm tắt',
      estimatedMinutes: 45,
      priority: 'high',
      scheduledDate: today,
      deadline: new Date('2026-11-28T17:00:00+07:00'),
      expectedOutcome: 'Tự vẽ được sơ đồ pha sáng và pha tối',
    },
    { user: user._id, subject: rn._id, course: hooks._id, title: 'Làm 15 câu trắc nghiệm Quang hợp', estimatedMinutes: 30, scheduledDate: today },
    {
      user: user._id,
      subject: en._id,
      title: 'Học 20 từ vựng mới',
      estimatedMinutes: 20,
      priority: 'medium',
      scheduledDate: today,
      recurrence: { freq: 'daily', interval: 1 },
    },
  ]);

  // Lịch sử 6 ngày trước để có streak + biểu đồ tuần
  for (let d = 6; d >= 1; d--) {
    const start = new Date(Date.now() - d * 86_400_000);
    start.setHours(20, 0, 0, 0);
    const minutes = 25 + ((d * 17) % 40);
    const end = new Date(start.getTime() + minutes * 60_000);
    const s = await FocusSessionModel.create({
      user: user._id,
      subject: d % 2 ? rn._id : en._id,
      task: tasks[0]._id,
      goal: 'Ôn bài',
      mode: 'pomodoro',
      plannedMinutes: 50,
      status: 'completed',
      startedAt: start,
      endedAt: end,
      segments: [{ type: 'focus', startedAt: start, endedAt: end, endReason: 'end' }],
      actualFocusSeconds: minutes * 60,
      distractionCount: d % 3,
      device: d % 2 ? 'web' : 'android',
      lastHeartbeatAt: end,
    });
    for (let i = 0; i < d % 3; i++) {
      await DistractionModel.create({
        user: user._id,
        session: s._id,
        subject: s.subject,
        reason: ['social_media', 'tired', 'message'][i % 3],
        category: ['digital', 'internal', 'digital'][i % 3],
        occurredAt: new Date(start.getTime() + (20 + i * 5) * 60_000),
        minuteIntoSession: 20 + i * 5,
      });
    }
  }

  // ---- Phase 2: tài liệu, flashcard, quiz mẫu
  const text = `Quang hợp

Quang hợp là quá trình cây xanh dùng năng lượng ánh sáng để tổng hợp chất hữu cơ từ CO2 và nước, giải phóng O2.
Phương trình tổng quát: 6CO2 + 6H2O → (ánh sáng, diệp lục) → C6H12O6 + 6O2.
- Pha sáng: diễn ra ở màng thylakoid, cần ánh sáng; tạo ATP, NADPH và giải phóng O2 từ quá trình quang phân li nước.
- Pha tối (chu trình Calvin): diễn ra ở chất nền lục lạp, dùng ATP và NADPH để cố định CO2 thành đường.
Các yếu tố ảnh hưởng: cường độ ánh sáng, nồng độ CO2, nhiệt độ, nước.
Ý nghĩa: tạo chất hữu cơ cho sinh giới, cung cấp O2 và điều hoà khí hậu.`;
  await MaterialModel.create({ user: user._id, subject: rn._id, title: 'Ghi chú Quang hợp', type: 'text', category: 'Ghi chú', textContent: text, hasText: true });
  const deck = await DeckModel.create({ user: user._id, subject: rn._id, title: 'Quang hợp' });
  await CardModel.create([
    { user: user._id, deck: deck._id, front: 'Quang hợp diễn ra ở bào quan nào?', back: 'Lục lạp.' },
    { user: user._id, deck: deck._id, front: 'Pha sáng tạo ra những sản phẩm gì?', back: 'ATP, NADPH và O2.' },
    { user: user._id, deck: deck._id, front: 'O2 trong quang hợp có nguồn gốc từ đâu?', back: 'Từ nước (quang phân li nước ở pha sáng).' },
    { user: user._id, deck: deck._id, front: 'Chu trình Calvin diễn ra ở đâu?', back: 'Chất nền (stroma) của lục lạp.' },
  ]);
  await QuizModel.create({
    user: user._id,
    subject: rn._id,
    title: 'Kiểm tra Quang hợp',
    questions: [
      { qid: 'q1', type: 'mcq', prompt: 'Pha sáng của quang hợp diễn ra ở đâu?', options: ['Chất nền lục lạp', 'Màng thylakoid', 'Ti thể', 'Nhân tế bào'], correctIndex: 1, explanation: 'Pha sáng cần sắc tố quang hợp nằm trên màng thylakoid.' },
      { qid: 'q2', type: 'true_false', prompt: 'O2 giải phóng trong quang hợp có nguồn gốc từ CO2.', correctBoolean: false, explanation: 'O2 đến từ quang phân li nước.' },
      { qid: 'q3', type: 'short', prompt: 'Pha tối của quang hợp còn gọi là chu trình gì?', acceptedAnswers: ['calvin', 'chu trình calvin'], explanation: 'Pha tối là chu trình Calvin, cố định CO2 thành đường.' },
    ],
  });

  console.log('✅ Seed xong. Đăng nhập: demo@focusly.app / Focusly123');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
