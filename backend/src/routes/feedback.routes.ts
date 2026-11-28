import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, parse } from '../utils/http';
import { FeedbackModel } from '../models/Social';
import { UserModel } from '../models/User';
import { notify } from '../services/notifications';
import { adminIds } from './admin.routes';

/** Góp ý & báo lỗi: người dùng gửi, xem lại trạng thái xử lý và câu trả lời của admin */
const router = Router();
router.use(requireAuth);

router.post(
  '/',
  ah(async (req, res) => {
    const me = uid(req);
    const data = parse(
      z.object({
        type: z.enum(['bug', 'idea', 'other']).default('bug'),
        message: z.string().trim().min(5, 'Viết ít nhất vài chữ nhé').max(4000),
        page: z.string().max(200).default(''),
        platform: z.string().max(20).default('web'),
        appVersion: z.string().max(30).default(''),
        device: z.string().max(200).default(''),
      }),
      req.body,
    );
    // chống spam: tối đa 10 góp ý / giờ
    const recent = await FeedbackModel.countDocuments({ user: me, createdAt: { $gte: new Date(Date.now() - 3600_000) } });
    if (recent >= 10) return res.status(429).json({ error: { code: 'RATE', message: 'Bạn gửi hơi nhiều rồi, thử lại sau ít phút nhé.' } });
    const f = await FeedbackModel.create({ ...data, user: me });
    // báo cho quản trị viên
    const u = await UserModel.findById(me).select('name').lean();
    const label = data.type === 'bug' ? 'Báo lỗi' : data.type === 'idea' ? 'Góp ý' : 'Phản hồi';
    for (const a of await adminIds()) {
      if (a === me) continue;
      void notify(a, { type: 'system', title: `${label} mới từ ${u?.name ?? 'người dùng'}`, body: data.message.slice(0, 140), data: { link: '/admin/feedback' }, dedupeKey: `fb:${f.id}:${a}` }).catch(() => undefined);
    }
    res.status(201).json({ item: f.toJSON() });
  }),
);

router.get(
  '/mine',
  ah(async (req, res) => {
    const items = await FeedbackModel.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(50).select('-adminNote').lean();
    res.json({ items: items.map((f) => ({ ...f, id: String(f._id), _id: undefined })) });
  }),
);

export default router;
