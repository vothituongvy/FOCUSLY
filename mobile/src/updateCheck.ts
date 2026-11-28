import { Alert, Linking } from 'react-native';
import { API_URL, APP_VERSION, GITHUB_REPO } from './config';
import { prefGet, prefSet, tr } from './i18n';

/**
 * Báo khi có bản APK mới trên GitHub Releases.
 * Phát hành bản mới: tăng versionCode + versionName (android/app/build.gradle) và APP_VERSION (src/config.ts),
 * build APK rồi tạo Release có tag dạng v1.0.1 và đính kèm file .apk.
 */
interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/** So sánh phiên bản dạng 1.2.3 (bỏ qua chữ "v" ở đầu) */
export function isNewer(remote: string, local: string) {
  const parse = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const a = parse(remote);
  const b = parse(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Hỏi máy chủ FOCUSLY trước (có lưu tạm, không bị giới hạn lượt của GitHub), không được thì hỏi thẳng GitHub */
/**
 * Hỏi máy chủ FOCUSLY (có lưu tạm, không bị giới hạn lượt của GitHub) và GitHub,
 * lấy bản MỚI NHẤT trong các nguồn trả lời được (tránh báo nhầm "đang mới nhất" vì bản lưu tạm cũ).
 */
async function latestRelease(fresh: boolean): Promise<{ release: Release | null; reason: string }> {
  const get = async (url: string, headers: Record<string, string> = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    try {
      return await fetch(url, { headers: { 'Cache-Control': 'no-cache', ...headers }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };
  const sources: [string, Record<string, string>][] = [
    [`${API_URL}/api/app/latest${fresh ? `?fresh=1&t=${Date.now()}` : ''}`, {}],
    [`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { Accept: 'application/vnd.github+json' }],
  ];
  let reason = '';
  let best: Release | null = null;
  for (const [url, headers] of sources) {
    try {
      const res = await get(url, headers);
      if (res.ok) {
        const r = (await res.json()) as Release;
        if (!r.draft && !r.prerelease && (!best || isNewer(r.tag_name, best.tag_name))) best = r;
        if (!fresh) break; // tự kiểm tra lúc mở app: 1 nguồn là đủ
      } else {
        reason = res.status === 403 || res.status === 429 ? 'rate' : res.status === 404 ? 'notfound' : `http${res.status}`;
      }
    } catch {
      reason = reason || 'network';
    }
  }
  return { release: best, reason: best ? '' : reason };
}

/** Link tải thẳng bản APK mới nhất (không cần API) */
const DIRECT_APK = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-release.apk`;

/**
 * Kiểm tra bản mới.
 * - `manual = false` (lúc mở app): tối đa 1 lần mỗi 12 giờ, không làm phiền với bản người dùng đã bấm "Bỏ qua".
 * - `manual = true` (nút "Kiểm tra cập nhật"): luôn kiểm tra và báo cả khi đang dùng bản mới nhất.
 */
export async function checkForUpdate(manual = false) {
  if (!manual) {
    const last = Number(prefGet('update.lastCheck') ?? 0);
    if (Date.now() - last < 12 * 3600_000) return;
  }
  prefSet('update.lastCheck', String(Date.now()));

  const { release: r, reason } = await latestRelease(manual);
  if (!r) {
    if (manual) {
      const msg =
        reason === 'network'
          ? tr('Không kết nối được máy chủ kiểm tra cập nhật. Kiểm tra mạng rồi thử lại, hoặc tải thẳng bản mới nhất.')
          : reason === 'rate'
            ? tr('GitHub đang giới hạn lượt kiểm tra từ mạng của bạn. Bạn vẫn tải thẳng bản mới nhất được.')
            : tr('Chưa đọc được thông tin bản mới ({0}). Bạn vẫn tải thẳng bản mới nhất được.', reason || '?');
      Alert.alert(tr('Kiểm tra cập nhật'), msg, [{ text: tr('Đóng'), style: 'cancel' }, { text: tr('Tải bản mới nhất'), onPress: () => void Linking.openURL(DIRECT_APK) }]);
    }
    return;
  }
  const version = r.tag_name.replace(/^v/i, '');
  if (!isNewer(version, APP_VERSION)) {
    if (manual) Alert.alert(tr('Kiểm tra cập nhật'), tr('Bạn đang dùng bản mới nhất ({0}).', APP_VERSION));
    return;
  }
  if (!manual && prefGet('update.skipped') === version) return;

  const apk = r.assets.find((a) => a.name.toLowerCase().endsWith('.apk'));
  const notes = (r.body ?? '').trim().slice(0, 400);
  Alert.alert(
    tr('Có bản mới {0}', version),
    `${tr('Bạn đang dùng bản {0}.', APP_VERSION)}${notes ? `\n\n${notes}` : ''}\n\n${tr('Tải về rồi mở file để cài đè lên bản cũ, dữ liệu vẫn được giữ.')}`,
    [
      { text: tr('Bỏ qua bản này'), style: 'cancel', onPress: () => prefSet('update.skipped', version) },
      { text: tr('Để sau') },
      { text: tr('Tải về'), onPress: () => void Linking.openURL(apk?.browser_download_url ?? DIRECT_APK) },
    ],
  );
}
