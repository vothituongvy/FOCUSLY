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
  onMessage: (cb: (m: { notification?: { title?: string; body?: string } }) => void) => () => void;
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
    const unsubMsg = m.onMessage((msg) => onForeground?.(msg.notification?.title ?? 'FOCUSLY', msg.notification?.body ?? ''));
    return () => {
      unsubRefresh();
      unsubMsg();
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
