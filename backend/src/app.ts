import { langMiddleware } from './utils/lang';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestId, sanitizeInput } from './middleware/security';
import { UPLOAD_DIR } from './services/storage';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import sessionRoutes from './routes/sessions.routes';
import shieldRoutes from './routes/shield.routes';
import insightRoutes from './routes/insights.routes';
import syncRoutes from './routes/sync.routes';
import materialRoutes from './routes/materials.routes';
import learnRoutes from './routes/learn.routes';
import notificationRoutes from './routes/notifications.routes';
import aiRoutes from './routes/ai.routes';
import analyticsRoutes from './routes/analytics.routes';
import { crudRouter } from './routes/crud.routes';
import socialRoutes from './routes/social.routes';
import examRoutes from './routes/exams.routes';
import libraryRoutes from './routes/library.routes';
import classRoutes from './routes/classes.routes';
import adminRoutes from './routes/admin.routes';
import chatRoutes from './routes/chats.routes';
import { trackUsage } from './middleware/usage';
import { aiEnabled } from './services/ai';
import { pushEnabled } from './services/notifications';

const startedAt = new Date();

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render / Vercel chạy sau proxy
  app.disable('x-powered-by');

  /* ---------- Phase 4: bảo mật & hiệu năng ---------- */
  app.use(requestId);
  // File tài liệu/ảnh: phục vụ trước helmet để trình xem PDF của trình duyệt nhúng được (iframe)
  app.use('/uploads', cors(), express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // API JSON + file tài liệu được nhúng (PDF viewer) từ domain Web
      frameguard: false,
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ['*'], imgSrc: ["'self'", 'data:'] } },
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Mobile app & Chrome Extension không gửi Origin của web
        if (!origin || origin.startsWith('chrome-extension://')) return cb(null, true);
        if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`Origin ${origin} không được phép`));
      },
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sanitizeInput);
  app.use(langMiddleware);
  morgan.token('rid', (req) => (req as express.Request & { id?: string }).id ?? '-');
  app.use(morgan(env.isProd ? ':rid :method :url :status :res[content-length] - :response-time ms' : 'dev', { skip: (req) => req.url === '/health' }));

  app.get('/', (_req, res) => res.json({ name: 'FOCUSLY API', status: 'ok', docs: '/docs/API.md' }));
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      ok: dbUp,
      db: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] ?? 'unknown',
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      version: process.env.npm_package_version ?? '2.0.0',
      features: { ai: aiEnabled(), push: pushEnabled(), scheduler: env.enableScheduler },
      time: new Date().toISOString(),
    });
  });

  // Giới hạn chung cho toàn API (chống spam); auth & AI có giới hạn riêng chặt hơn
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: env.isProd ? 300 : 3000, standardHeaders: true, legacyHeaders: false });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(trackUsage);
  api.use('/auth', authRoutes);
  api.use('/users', userRoutes);
  api.use('/', insightRoutes); // /dashboard, /distractions/stats (đặt trước CRUD distractions)
  api.use('/subjects', crudRouter('subjects'));
  api.use('/courses', crudRouter('courses'));
  api.use('/goals', crudRouter('goals'));
  api.use('/tasks', crudRouter('tasks'));
  api.use('/distractions', crudRouter('distractions'));
  api.use('/sessions', sessionRoutes);
  api.use('/shield', shieldRoutes);
  api.use('/sync', syncRoutes);
  // Phase 2
  api.use('/materials', materialRoutes); // /upload, /search, /categories, /:id/text (trước CRUD)
  api.use('/materials', crudRouter('materials'));
  api.use('/material-notes', crudRouter('materialNotes'));
  api.use('/decks', crudRouter('decks'));
  api.use('/cards', crudRouter('cards'));
  api.use('/quizzes', crudRouter('quizzes'));
  api.use('/recalls', crudRouter('recalls'));
  api.use('/recoveries', crudRouter('recoveries'));
  api.use('/learn', learnRoutes);
  api.use('/notifications', notificationRoutes);
  // Phase 3
  api.use('/ai', aiRoutes);
  api.use('/analytics', analyticsRoutes);
  // Học cùng nhau, ngày thi, thư viện cộng đồng, lớp học, quản trị
  api.use('/social', socialRoutes);
  api.use('/exams', examRoutes);
  api.use('/library', libraryRoutes);
  api.use('/classes', classRoutes);
  api.use('/admin', adminRoutes);
  api.use('/chats', chatRoutes);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
