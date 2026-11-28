import { Platform } from 'react-native';
import { api } from './api/client';

/**
 * PHASE 2 – Push Notification qua Firebase Cloud Messaging (TUỲ CHỌN).
 *
 * Bật bằng:  bash setup-push.sh   (cài @react-native-firebase/app + messaging)
 * và đặt google-services.json vào android/app/.
 * Nếu chưa cài, require() bên dưới thất bại một cách an toàn (Metro: allowOptionalDependencies)
 * và app vẫn chạy bình thường với thông báo in-app.
 */
type Messaging = {
  requestPermission: () => Promise<number>;
  getToken: () => Promise<string>;
  onTokenRefresh: (cb: (t: string) => void) => () => void;
  onMessage: (cb: (m: PushMsg) => void) => () => void;
  onNotificationOpenedApp?: (cb: (m: PushMsg) => void) => () => void;
  getInitialNotification?: () => Promise<PushMsg | null>;
};
type PushMsg = { notification?: { title?: string; body?: string }; data?: Record<string, string> };

/** Người dùng chạm vào thông báo đẩy -> mở đúng màn hình (đường dẫn kiểu web, VD /messages?chat=…) */
let openHandler: ((link: string) => void) | null = null;
let pendingLink: string | null = null;
export function onPushOpen(fn: (link: string) => void) {
  openHandler = fn;
  if (pendingLink) {
    fn(pendingLink);
    pendingLink = null;
  }
  return () => {
    if (openHandler === fn) openHandler = null;
  };
}
const opened = (m: PushMsg | null) => {
  const link = m?.data?.link;
  if (!link) return;
  if (openHandler) openHandler(link);
  else pendingLink = link;
};

function loadMessaging(): (() => Messaging) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native-firebase/messaging').default;
  } catch {
    return null;
  }
}

let lastToken: string | null = null;

export async function registerPush(onForeground?: (title: string, body: string) => void): Promise<() => void> {
  const messaging = loadMessaging();
  if (!messaging) return () => undefined;
  try {
    const m = messaging();
    await m.requestPermission();
    // Android 13+: cần quyền POST_NOTIFICATIONS
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      const { PermissionsAndroid } = require('react-native');
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
    }
    const send = async (token: string) => {
      lastToken = token;
      await api('/notifications/push-token', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } }).catch(() => undefined);
    };
    await send(await m.getToken());
    const unsubRefresh = m.onTokenRefresh(send);
    const unsubMsg = m.onMessage((msg) => {
      // tin nhắn: đã hiện ngay trong app (cuộc trò chuyện đang mở hoặc số chưa đọc)
      // (tin nhắn khác: số chưa đọc trong app đã cập nhật, không bật hộp thoại làm gián đoạn)
      if (msg.data?.type === 'chat') return;
      onForeground?.(msg.notification?.title ?? 'FOCUSLY', msg.notification?.body ?? '');
    });
    const unsubOpen = m.onNotificationOpenedApp?.(opened) ?? (() => undefined);
    void m.getInitialNotification?.().then(opened).catch(() => undefined);
    return () => {
      unsubRefresh();
      unsubMsg();
      unsubOpen();
    };
  } catch (e) {
    console.warn('[push] không đăng ký được', e);
    return () => undefined;
  }
}

export async function unregisterPush() {
  if (!lastToken) return;
  await api('/notifications/push-token', { method: 'DELETE', body: { token: lastToken } }).catch(() => undefined);
  lastToken = null;
}

/** Lấy lại mã thiết bị (FCM token) và gửi lên máy chủ – dùng khi kiểm tra thông báo. Trả về lỗi nếu có. */
export async function refreshPushToken(): Promise<{ ok: boolean; error?: string; permission: boolean }> {
  let permission = true;
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const { PermissionsAndroid } = require('react-native');
    permission = await PermissionsAndroid.check('android.permission.POST_NOTIFICATIONS');
    if (!permission) permission = (await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS')) === 'granted';
  }
  const messaging = loadMessaging();
  if (!messaging) return { ok: false, permission, error: 'Bản app này chưa có Firebase.' };
  try {
    const token = await messaging().getToken();
    lastToken = token;
    await api('/notifications/push-token', { method: 'POST', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
    return { ok: true, permission };
  } catch (e) {
    return { ok: false, permission, error: (e as Error).message };
  }
}
