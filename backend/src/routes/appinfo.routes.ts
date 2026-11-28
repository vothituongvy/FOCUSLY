import { Router } from 'express';
import { ah } from '../utils/http';

/**
 * Thông tin bản app mới nhất (GitHub Releases) – lấy qua máy chủ và lưu tạm 10 phút.
 * Điện thoại hỏi thẳng GitHub dễ bị chặn vì giới hạn 60 lượt/giờ cho mỗi địa chỉ IP
 * (mạng 4G nhiều người dùng chung một IP), nên app hỏi máy chủ trước.
 */
const router = Router();
const REPO = process.env.GITHUB_REPO ?? 'vothituongvy/FOCUSLY';
let cache: { at: number; data: unknown } | null = null;

router.get(
  '/latest',
  ah(async (req, res) => {
    // ?fresh=1 (người dùng tự bấm "Kiểm tra cập nhật"): hỏi lại GitHub ngay, tối đa 1 lần / 20 giây
    const fresh = req.query.fresh === '1' && (!cache || Date.now() - cache.at > 20_000);
    if (fresh || !cache || Date.now() - cache.at > 2 * 60_000) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'focusly-api', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      });
      if (!r.ok) {
        if (cache) return res.json(cache.data); // GitHub lỗi tạm: trả bản đã lưu
        return res.status(502).json({ error: { code: 'GITHUB', message: `GitHub trả về ${r.status}` } });
      }
      const j = (await r.json()) as { tag_name: string; name: string | null; body: string | null; html_url: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string }[] };
      cache = { at: Date.now(), data: { tag_name: j.tag_name, name: j.name, body: j.body, html_url: j.html_url, draft: j.draft, prerelease: j.prerelease, assets: j.assets.map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })) } };
    }
    res.set('Cache-Control', 'no-store');
    res.json(cache.data);
  }),
);

export default router;
