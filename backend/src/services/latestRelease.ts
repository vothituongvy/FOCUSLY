/**
 * Lấy thông tin bản app mới nhất trên GitHub Releases.
 * 1) API của GitHub (đầy đủ ghi chú phát hành) – giới hạn 60 lượt/giờ nếu không có GITHUB_TOKEN.
 * 2) Bị giới hạn -> đọc trang https://github.com/<repo>/releases/latest (chuyển hướng sang /tag/vX.Y.Z),
 *    không tính vào giới hạn API, đủ để biết số phiên bản và link tải APK.
 */
export interface ReleaseInfo {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

export const RELEASE_REPO = process.env.GITHUB_REPO ?? 'vothituongvy/FOCUSLY';

export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'focusly-api', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const j = (await r.json()) as ReleaseInfo;
      return { tag_name: j.tag_name, name: j.name, body: j.body, html_url: j.html_url, draft: j.draft, prerelease: j.prerelease, assets: (j.assets ?? []).map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })) };
    }
  } catch {
    /* thử cách 2 */
  }
  try {
    const r = await fetch(`https://github.com/${RELEASE_REPO}/releases/latest`, { redirect: 'manual', headers: { 'User-Agent': 'focusly-api' }, signal: AbortSignal.timeout(10_000) });
    const loc = r.headers.get('location') ?? '';
    const tag = /\/releases\/tag\/([^/?#]+)/.exec(loc)?.[1];
    if (!tag) return null;
    const t = decodeURIComponent(tag);
    return {
      tag_name: t,
      name: `FOCUSLY ${t.replace(/^v/i, '')}`,
      body: null,
      html_url: `https://github.com/${RELEASE_REPO}/releases/tag/${tag}`,
      draft: false,
      prerelease: false,
      assets: [{ name: 'app-release.apk', browser_download_url: `https://github.com/${RELEASE_REPO}/releases/download/${tag}/app-release.apk` }],
    };
  } catch {
    return null;
  }
}
