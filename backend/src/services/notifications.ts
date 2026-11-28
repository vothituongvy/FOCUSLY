import { env } from '../config/env';
import { NotificationModel, NotificationType, PushTokenModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { emitToUser } from './realtime';
import { minutesOfDay, parseHm, safeTimeZone } from '../utils/time';

/* ---------- Firebase Cloud Messaging (tuỳ chọn) ---------- */
type Messaging = {
  sendEachForMulticast: (m: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
    android?: Record<string, unknown>;
  }) => Promise<{ responses: { success: boolean; error?: { code: string } }[] }>;
};
let messaging: Messaging | null | undefined;

function getMessaging(): Messaging | null {
  if (messaging !== undefined) return messaging;
  messaging = null;
  if (!env.firebaseServiceAccountB64) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    const credentials = JSON.parse(Buffer.from(env.firebaseServiceAccountB64, 'base64').toString('utf8'));
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
    messaging = admin.messaging() as Messaging;
    console.log('[push] Firebase Cloud Messaging sẵn sàng');
  } catch (e) {
    console.warn('[push] Không khởi tạo được Firebase:', (e as Error).message);
  }
  return messaging;
}

export const pushEnabled = () => Boolean(getMessaging());

function inQuietHours(now: Date, tz: string, start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const m = minutesOfDay(now, tz);
  const s = parseHm(start);
  const e = parseHm(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  /** bỏ qua giờ yên lặng (vd: nhắc nghỉ khi đang học) */
  urgent?: boolean;
}

/**
 * Tạo thông báo in-app + phát realtime + đẩy FCM tới điện thoại.
 * Trả null nếu trùng dedupeKey (đã gửi rồi).
 */
export async function notify(userId: string, input: NotifyInput) {
  let doc;
  try {
    doc = await NotificationModel.create({
      user: userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      data: input.data ?? {},
      dedupeKey: input.dedupeKey ?? null,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return null;
    throw e;
  }
  emitToUser(userId, 'notification:new', doc.toJSON());

  const fcm = getMessaging();
  if (!fcm) return doc;
  const user = await UserModel.findById(userId).select('profile.timezone notificationSettings');
  const settings = user?.notificationSettings;
  if (settings?.push === false) return doc;
  if (!input.urgent && inQuietHours(new Date(), safeTimeZone(user?.profile?.timezone), settings?.quietStart, settings?.quietEnd)) return doc;

  const tokens = await PushTokenModel.find({ user: userId }).select('token').lean();
  if (!tokens.length) return doc;
  try {
    const data: Record<string, string> = { type: input.type, notificationId: doc.id };
    for (const [k, v] of Object.entries(input.data ?? {})) data[k] = String(v);
    const res = await fcm.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: input.title, body: input.body ?? '' },
      data,
      android: { priority: 'high', notification: { channelId: 'focusly-default', sound: 'default' } },
    });
    // Xoá token không còn hợp lệ
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code ?? '') ? tokens[i].token : null))
      .filter(Boolean);
    if (dead.length) await PushTokenModel.deleteMany({ token: { $in: dead } });
    doc.pushedAt = new Date();
    await doc.save();
  } catch (e) {
    console.warn('[push] Gửi thất bại:', (e as Error).message);
  }
  return doc;
}

/**
 * Chỉ đẩy thông báo tới điện thoại (không lưu vào hộp thông báo trong app) – dùng cho tin nhắn.
 * Tôn trọng: tắt push, giờ yên lặng.
 */
export async function pushOnly(userId: string, title: string, body: string, data: Record<string, string> = {}, tag?: string, channelId = 'focusly-default') {
  const fcm = getMessaging();
  if (!fcm) return;
  const user = await UserModel.findById(userId).select('profile.timezone notificationSettings').lean();
  const settings = user?.notificationSettings;
  if (settings?.push === false) return;
  if (inQuietHours(new Date(), safeTimeZone(user?.profile?.timezone), settings?.quietStart, settings?.quietEnd)) return;
  const tokens = await PushTokenModel.find({ user: userId }).select('token').lean();
  if (!tokens.length) return;
  try {
    const res = await fcm.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data,
      // tag: tin mới cùng cuộc trò chuyện thay thế thông báo cũ thay vì xếp chồng
      android: { priority: 'high', notification: { channelId, sound: 'default', ...(tag ? { tag } : {}) } },
    });
    const dead = res.responses
      .map((r, i) => (!r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code ?? '') ? tokens[i].token : null))
      .filter(Boolean);
    if (dead.length) await PushTokenModel.deleteMany({ token: { $in: dead } });
  } catch (e) {
    console.warn('[push] Gửi tin nhắn thất bại:', (e as Error).message);
  }
}

/**
 * Chẩn đoán thông báo đẩy: gửi thẳng 1 thông báo tới từng máy đã đăng ký của user
 * và trả về kết quả từng máy (mã lỗi của Firebase nếu có) để biết hỏng ở đâu.
 */
export async function diagnosePush(userId: string) {
  const fcm = getMessaging();
  const user = await UserModel.findById(userId).select('profile.timezone notificationSettings').lean();
  const ns = user?.notificationSettings;
  const quiet = inQuietHours(new Date(), safeTimeZone(user?.profile?.timezone), ns?.quietStart, ns?.quietEnd);
  const tokens = await PushTokenModel.find({ user: userId }).select('token platform lastSeenAt').lean();
  const base = { serverReady: Boolean(fcm), pushSetting: ns?.push !== false, quietHours: quiet, quietStart: ns?.quietStart, quietEnd: ns?.quietEnd, devices: tokens.length };
  if (!fcm || !tokens.length) return { ...base, results: [] as { platform: string; lastSeenAt: Date | null; ok: boolean; error?: string }[] };
  const res = await fcm.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: { title: 'FOCUSLY – kiểm tra thông báo 🔔', body: 'Nếu bạn thấy thông báo này trên thanh thông báo thì mọi thứ đã hoạt động.' },
    data: { type: 'system', link: '/notifications' },
    android: { priority: 'high', notification: { channelId: 'focusly-default', sound: 'default' } },
  });
  const results = res.responses.map((r, i) => ({ platform: tokens[i].platform ?? 'android', lastSeenAt: (tokens[i] as { lastSeenAt?: Date }).lastSeenAt ?? null, ok: r.success, error: r.error?.code }));
  const dead = results.map((r, i) => (!r.ok && /registration-token-not-registered|invalid-argument/.test(r.error ?? '') ? tokens[i].token : null)).filter(Boolean);
  if (dead.length) await PushTokenModel.deleteMany({ token: { $in: dead } });
  return { ...base, results };
}
