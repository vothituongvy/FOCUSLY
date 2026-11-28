import { Router } from 'express';
import { ah } from '../utils/http';
import { fetchLatestRelease, type ReleaseInfo } from '../services/latestRelease';

/**
 * Thông tin bản app mới nhất (GitHub Releases) – lấy qua máy chủ và lưu tạm 10 phút.
 * Điện thoại hỏi thẳng GitHub dễ bị chặn vì giới hạn 60 lượt/giờ cho mỗi địa chỉ IP
 * (mạng 4G nhiều người dùng chung một IP), nên app hỏi máy chủ trước.
 */
const router = Router();
let cache: { at: number; data: ReleaseInfo } | null = null;

router.get(
  '/latest',
  ah(async (req, res) => {
    // ?fresh=1 (người dùng tự bấm "Kiểm tra cập nhật"): hỏi lại ngay, tối đa 1 lần / 20 giây
    const fresh = req.query.fresh === '1' && (!cache || Date.now() - cache.at > 20_000);
    if (fresh || !cache || Date.now() - cache.at > 2 * 60_000) {
      const data = await fetchLatestRelease();
      if (data) cache = { at: Date.now(), data };
      else if (!cache) return res.status(502).json({ error: { code: 'RELEASES', message: 'Chưa đọc được thông tin bản mới, thử lại sau ít phút.' } });
    }
    res.set('Cache-Control', 'no-store');
    res.json(cache!.data);
  }),
);

export default router;
