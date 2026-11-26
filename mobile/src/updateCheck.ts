import { Alert, Linking } from 'react-native';
import { APP_VERSION, GITHUB_REPO } from './config';
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

async function latestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return null; // repo riêng tư hoặc chưa có Release
    const r = (await res.json()) as Release;
    return r.draft || r.prerelease ? null : r;
  } catch {
    return null; // mất mạng: thử lại lần sau
  }
}

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

  const r = await latestRelease();
  if (!r) {
    if (manual) Alert.alert(tr('Kiểm tra cập nhật'), tr('Chưa kiểm tra được. Hãy thử lại khi có mạng.'));
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
      { text: tr('Tải về'), onPress: () => void Linking.openURL(apk?.browser_download_url ?? r.html_url) },
    ],
  );
}
