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
      learningGoal: 'Trở thành React Native Developer',
      interestedSubjects: ['React Native', 'Tiếng Anh'],
      preferredStudyTimes: [{ start: '19:00', end: '22:00' }],
      dailyTargetMinutes: 120,
      timezone: 'Asia/Ho_Chi_Minh',
      language: 'vi',
    },
  });

  const rn = await SubjectModel.create({ user: user._id, name: 'React Native', color: '#6366f1', icon: '📱' });
  const en = await SubjectModel.create({ user: user._id, name: 'Tiếng Anh', color: '#f59e0b', icon: '🇬🇧' });
  const hooks = await CourseModel.create({ user: user._id, subject: rn._id, name: 'React Hooks' });
  const goal = await GoalModel.create({
    user: user._id,
    subject: rn._id,
    title: 'Hiểu và thực hành được useEffect',
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
      title: 'Tìm hiểu useEffect',
      estimatedMinutes: 45,
      priority: 'high',
      scheduledDate: today,
      deadline: new Date('2026-11-28T17:00:00+07:00'),
      expectedOutcome: 'Hiểu và thực hành được useEffect',
    },
    { user: user._id, subject: rn._id, course: hooks._id, title: 'Luyện useMemo & useCallback', estimatedMinutes: 30, scheduledDate: today },
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
  const text = `React Hooks – useEffect

useEffect cho phép thực hiện "side effect" (gọi API, đăng ký sự kiện, hẹn giờ) sau khi component render.
Cú pháp: useEffect(() => { ...; return () => { /* cleanup */ } }, [deps]).
- Không truyền dependency array: chạy sau MỌI lần render.
- Mảng rỗng []: chỉ chạy một lần sau lần render đầu tiên.
- [a, b]: chạy lại khi a hoặc b thay đổi.
Cleanup function chạy trước khi effect chạy lại và khi component unmount – dùng để huỷ đăng ký, xoá timer.
useMemo ghi nhớ GIÁ TRỊ tính toán, useCallback ghi nhớ HÀM giữa các lần render.`;
  await MaterialModel.create({ user: user._id, subject: rn._id, title: 'Ghi chú useEffect', type: 'text', category: 'Ghi chú', textContent: text, hasText: true });
  const deck = await DeckModel.create({ user: user._id, subject: rn._id, title: 'React Hooks' });
  await CardModel.create([
    { user: user._id, deck: deck._id, front: 'useState dùng để làm gì?', back: 'Khai báo và cập nhật state trong function component.' },
    { user: user._id, deck: deck._id, front: 'useEffect chạy khi nào?', back: 'Sau khi render; chạy lại khi dependency thay đổi.' },
    { user: user._id, deck: deck._id, front: 'Cleanup function là gì?', back: 'Hàm trả về từ useEffect, chạy trước lần effect kế tiếp và khi unmount.' },
    { user: user._id, deck: deck._id, front: 'useMemo khác useCallback thế nào?', back: 'useMemo ghi nhớ giá trị, useCallback ghi nhớ hàm.' },
  ]);
  await QuizModel.create({
    user: user._id,
    subject: rn._id,
    title: 'Kiểm tra React Hooks',
    questions: [
      { qid: 'q1', type: 'mcq', prompt: 'useEffect với [] chạy khi nào?', options: ['Mỗi lần render', 'Chỉ một lần sau render đầu', 'Không bao giờ', 'Trước render'], correctIndex: 1, explanation: 'Mảng rỗng = không phụ thuộc gì nên chỉ chạy 1 lần.' },
      { qid: 'q2', type: 'true_false', prompt: 'useMemo trả về một hàm đã ghi nhớ.', correctBoolean: false, explanation: 'useMemo trả về giá trị; useCallback mới ghi nhớ hàm.' },
      { qid: 'q3', type: 'short', prompt: 'Tham số thứ hai của useEffect gọi là gì?', acceptedAnswers: ['dependency array', 'mảng phụ thuộc'], explanation: 'Dependency array quyết định khi nào effect chạy lại.' },
    ],
  });

  console.log('✅ Seed xong. Đăng nhập: demo@focusly.app / Focusly123');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
