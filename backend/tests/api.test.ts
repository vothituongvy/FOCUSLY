import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';

/**
 * Kiểm thử tích hợp: chạy MongoDB trong bộ nhớ + gọi API thật qua supertest.
 * Lần đầu mongodb-memory-server sẽ tải binary MongoDB (~100MB).
 */
let mongo: MongoMemoryServer;
let app: Express;
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  const { createApp } = await import('../src/app');
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('Auth', () => {
  it('đăng ký, đăng nhập, refresh token xoay vòng', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Test', email: 'T@x.com', password: 'Focusly123' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe('t@x.com');
    expect(reg.body.user.passwordHash).toBeUndefined();

    const dup = await request(app).post('/api/auth/register').send({ name: 'Test', email: 't@x.com', password: 'Focusly123' });
    expect(dup.status).toBe(409);

    const bad = await request(app).post('/api/auth/login').send({ email: 't@x.com', password: 'sai-mat-khau1' });
    expect(bad.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: 't@x.com', password: 'Focusly123' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;

    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(r1.status).toBe(200);
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401); // token cũ đã bị xoay vòng
  });

  it('chặn NoSQL injection ở login', async () => {
    const r = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(r.status).toBe(400);
  });
});

describe('Learning + Focus Session', () => {
  let subjectId = '';
  let taskId = '';

  it('tạo môn học & nhiệm vụ (idempotent theo clientId)', async () => {
    const s = await request(app).post('/api/subjects').set(auth()).send({ name: 'React Native', clientId: 'c-subj-1' });
    expect(s.status).toBe(201);
    subjectId = s.body.item.id;
    const again = await request(app).post('/api/subjects').set(auth()).send({ name: 'React Native', clientId: 'c-subj-1' });
    expect(again.body.item.id).toBe(subjectId);

    // tham chiếu bằng clientId (dữ liệu tạo offline) vẫn được hiểu
    const t = await request(app).post('/api/tasks').set(auth()).send({ title: 'Tìm hiểu useEffect', subject: 'c-subj-1', estimatedMinutes: 45 });
    expect(t.status).toBe(201);
    expect(t.body.item.subject).toBe(subjectId);
    taskId = t.body.item.id;
  });

  it('phiên học tính thời gian theo mốc server và chỉ 1 phiên mở', async () => {
    const t0 = Date.now() - 30 * 60_000;
    const start = await request(app)
      .post('/api/sessions')
      .set(auth())
      .send({ task: taskId, goal: 'Hiểu useEffect', mode: 'custom', plannedMinutes: 45, at: new Date(t0).toISOString() });
    expect(start.status).toBe(201);
    const id = start.body.session.id;

    const second = await request(app).post('/api/sessions').set(auth()).send({ goal: 'x' });
    expect(second.status).toBe(409);

    await request(app).post(`/api/sessions/${id}/pause`).set(auth()).send({ at: new Date(t0 + 10 * 60_000).toISOString() });
    await request(app).post(`/api/sessions/${id}/resume`).set(auth()).send({ at: new Date(t0 + 15 * 60_000).toISOString() });
    const end = await request(app)
      .post(`/api/sessions/${id}/end`)
      .set(auth())
      .send({ at: new Date(t0 + 25 * 60_000).toISOString(), goalAchieved: true, markTaskDone: true });
    expect(end.status).toBe(200);
    expect(end.body.session.status).toBe('completed');
    expect(end.body.session.actualFocusSeconds).toBe(20 * 60); // 10 + 10 phút, bỏ 5 phút tạm dừng

    const task = await request(app).get(`/api/tasks/${taskId}`).set(auth());
    expect(task.body.item.status).toBe('done');
    expect(task.body.item.actualFocusSeconds).toBe(20 * 60);

    const dash = await request(app).get('/api/dashboard').set(auth());
    expect(dash.status).toBe(200);
    expect(dash.body.studyTime.todaySeconds).toBeGreaterThanOrEqual(20 * 60);
  });

  it('sync push idempotent theo mutationId', async () => {
    const mutations = [{ mutationId: 'm-1', entity: 'subjects', op: 'create', clientId: 'c-subj-2', data: { name: 'Tiếng Anh' } }];
    const a = await request(app).post('/api/sync/push').set(auth()).send({ mutations });
    const b = await request(app).post('/api/sync/push').set(auth()).send({ mutations });
    expect(a.body.results[0].status).toBe('ok');
    expect(b.body.results[0].item.id).toBe(a.body.results[0].item.id);
    const pull = await request(app).get('/api/sync/pull').set(auth());
    expect(pull.body.changes.subjects.length).toBe(2);
  });
});

describe('Phase 2: Flashcard & Quiz', () => {
  it('ôn thẻ theo SM-2', async () => {
    const deck = await request(app).post('/api/decks').set(auth()).send({ title: 'Hooks' });
    const card = await request(app).post('/api/cards').set(auth()).send({ deck: deck.body.item.id, front: 'useState?', back: 'Quản lý state' });
    const due = await request(app).get('/api/learn/due').set(auth());
    expect(due.body.items.length).toBe(1);
    const r = await request(app).post(`/api/learn/cards/${card.body.item.id}/review`).set(auth()).send({ grade: 4 });
    expect(r.body.item.srs.interval).toBe(1);
    const due2 = await request(app).get('/api/learn/due').set(auth());
    expect(due2.body.items.length).toBe(0);
  });

  it('chấm quiz & tổng hợp câu sai', async () => {
    const quiz = await request(app)
      .post('/api/quizzes')
      .set(auth())
      .send({
        title: 'React Hooks',
        questions: [
          { type: 'mcq', prompt: 'useEffect chạy khi nào?', options: ['Trước render', 'Sau render'], correctIndex: 1 },
          { type: 'true_false', prompt: 'useMemo trả về hàm', correctBoolean: false },
          { type: 'short', prompt: 'Tên mảng thứ 2 của useEffect?', acceptedAnswers: ['dependency array'] },
        ],
      });
    expect(quiz.status).toBe(201);
    const qs = quiz.body.item.questions;
    const attempt = await request(app)
      .post(`/api/learn/quizzes/${quiz.body.item.id}/attempts`)
      .set(auth())
      .send({ answers: [{ qid: qs[0].qid, answer: 1 }, { qid: qs[1].qid, answer: true }, { qid: qs[2].qid, answer: 'Dependency Array' }] });
    expect(attempt.body.item.score).toBe(2);
    const mistakes = await request(app).get('/api/learn/mistakes').set(auth());
    expect(mistakes.body.items).toHaveLength(1);
    const toCards = await request(app).post('/api/learn/mistakes/to-cards').set(auth()).send({ items: mistakes.body.items });
    expect(toCards.body.created).toBe(1);
  });

  it('quiz không hợp lệ bị từ chối', async () => {
    const r = await request(app).post('/api/quizzes').set(auth()).send({ title: 'x', questions: [{ type: 'mcq', prompt: 'p', options: ['a'] }] });
    expect(r.status).toBe(400);
  });
});

describe('Phase 3: Analytics', () => {
  it('overview & insights', async () => {
    const a = await request(app).get('/api/analytics/overview?range=week').set(auth());
    expect(a.status).toBe(200);
    expect(a.body.series).toHaveLength(7);
    expect(a.body.metrics.actualFocusMinutes).toBeGreaterThanOrEqual(20);
    const i = await request(app).get('/api/analytics/insights').set(auth());
    expect(Array.isArray(i.body.insights)).toBe(true);
  });

  it('AI trả 503 khi chưa cấu hình key', async () => {
    const r = await request(app).post('/api/ai/explain').set(auth()).send({ concept: 'closure' });
    expect(r.status).toBe(503);
  });
});
