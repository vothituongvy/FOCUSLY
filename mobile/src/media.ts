import { NativeModules, PermissionsAndroid, Platform, Share } from 'react-native';
import { tr } from './i18n';

/** Lưu ảnh / chia sẻ (native: MediaModule.kt) */
type MediaNative = { saveImage: (url: string) => Promise<boolean>; shareImage: (url: string, text: string | null) => Promise<boolean>; copyText: (text: string) => void };
const native: MediaNative | undefined = Platform.OS === 'android' ? (NativeModules.FocuslyMedia as MediaNative | undefined) : undefined;

/** Lưu ảnh vào Thư viện ảnh (thư mục Pictures/FOCUSLY) */
export async function saveImageToPhone(url: string) {
  if (!native) throw new Error(tr('Bản app này chưa lưu được ảnh. Hãy cập nhật app lên bản mới nhất.'));
  if (Platform.OS === 'android' && Number(Platform.Version) < 29) {
    const ok = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
    if (ok !== PermissionsAndroid.RESULTS.GRANTED) throw new Error(tr('Cần cho phép truy cập bộ nhớ để lưu ảnh.'));
  }
  await native.saveImage(url);
}

/** Chia sẻ sang ứng dụng khác: ảnh (kèm chữ) hoặc chữ */
export async function shareMessage(m: { text: string; image?: { url: string } | null }) {
  if (m.image?.url) {
    if (native) return void (await native.shareImage(m.image.url, m.text || null));
    return void (await Share.share({ message: [m.text, m.image.url].filter(Boolean).join('\n') }));
  }
  await Share.share({ message: m.text });
}

/** Sao chép chữ vào bộ nhớ tạm */
export function copyText(text: string) {
  native?.copyText(text);
}
