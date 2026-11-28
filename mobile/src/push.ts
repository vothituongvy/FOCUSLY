import { Platform } from 'react-native';
import { api } from './api/client';
import { showLocalNotification } from './native';

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

/** Cuộc trò chuyện đang mở trên màn hình (tin của nó không cần hiện thông báo) */
let openChatId: string | null = null;
export const setOpenChat = (id: string | null) => {
  openChatId = id;
};

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

/**
 * @react-native-firebase/messaging bản 22+ chỉ còn API dạng hàm (getMessaging, getToken…), không còn
 * `require(...).default`. Gói lại thành object như cũ; hỗ trợ cả bản cũ để không vỡ khi đổi phiên bản.
 */
function loadMessaging(): (() => Messaging) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-firebase/messaging');
    if (typeof mod.getMessaging === 'function') {
      return () => {
        const m = mod.getMessaging();
        return {
          requestPermission: () => mod.requestPermission(m),
          getToken: () => mod.getToken(m),
          onTokenRefresh: (cb: (t: string) => void) => mod.onTokenRefresh(m, cb),
          onMessage: (cb: (x: PushMsg) => void) => mod.onMessage(m, cb),
          onNotificationOpenedApp: (cb: (x: PushMsg) => void) => mod.onNotificationOpenedApp(m, cb),
          getInitialNotification: () => mod.getInitialNotification(m),
        };
      };
    }
    return typeof mod.default === 'function' ? mod.default : null;
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
      const title = msg.notification?.title ?? 'FOCUSLY';
      const body = msg.notification?.body ?? '';
      const isChat = msg.data?.type === 'chat';
      // đang mở đúng cuộc trò chuyện đó: tin đã hiện trên màn hình, không cần báo
      if (isChat && msg.data?.chatId && msg.data.chatId === openChatId) return;
      // app đang mở: Firebase không tự hiện -> tự hiện lên thanh thông báo như Messenger
      if (showLocalNotification(title, body, { channel: isChat ? 'focusly-chat' : 'focusly-default', link: msg.data?.link, tag: isChat ? `chat-${msg.data?.chatId}` : undefined })) return;
      if (!isChat) onForeground?.(title, body); // bản app cũ chưa có module: hộp thoại như trước
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
