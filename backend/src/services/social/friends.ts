import { Types } from 'mongoose';
import { FriendModel } from '../../models/Social';
import { UserModel } from '../../models/User';
import { FocusSessionModel } from '../../models/FocusSession';
import { notify } from '../notifications';
import { dayKey, lastDayKeys, safeTimeZone, weekdayIn } from '../../utils/time';
import { focusByDay, quickStreak } from './gamify';
import { shortCode } from './logic';

export const publicUser = (u: { _id: unknown; name?: string; avatarUrl?: string | null }) => ({ id: String(u._id), name: u.name ?? '', avatarUrl: u.avatarUrl ?? null });

/** Mã kết bạn của user (tạo khi cần) */
export async function friendCodeOf(userId: string): Promise<string> {
  const u = await UserModel.findById(userId).select('friendCode');
  if (u?.friendCode) return u.friendCode;
  for (let i = 0; i < 6; i++) {
    const code = shortCode(6);
    try {
      await UserModel.updateOne({ _id: userId }, { friendCode: code });
      return code;
    } catch {
      /* trùng mã -> thử lại */
    }
  }
  throw new Error('Không tạo được mã kết bạn');
}

/** Ngày đầu tuần (thứ Hai) tới hôm nay theo múi giờ */
export function weekKeys(tz: string, now = new Date()) {
  const dow = weekdayIn(now, tz); // 0 = CN
  return lastDayKeys(dow === 0 ? 7 : dow, tz, now);
}

export async function weekMinutes(userId: string, keys: string[], tz: string, now = new Date()) {
  const m = await focusByDay(userId, tz, 8, now);
  return Math.round(keys.reduce((a, k) => a + (m.get(k) ?? 0), 0) / 60);
}

export async function friendIds(userId: string) {
  return (await FriendModel.find({ user: userId, status: 'accepted' }).select('friend').lean()).map((f) => String(f.friend));
}

/** Bảng xếp hạng phút tập trung tuần này: bạn + bạn bè */
export async function leaderboard(userId: string, now = new Date()) {
  const me = await UserModel.findById(userId).select('profile.timezone').lean();
  const tz = safeTimeZone(me?.profile?.timezone);
  const keys = weekKeys(tz, now);
  const ids = [userId, ...(await friendIds(userId))];
  const users = await UserModel.find({ _id: { $in: ids } }).select('name avatarUrl').lean();
  const studying = new Set(
    (await FocusSessionModel.find({ user: { $in: ids }, status: { $in: ['active', 'paused', 'on_break'] }, deletedAt: null }).select('user').lean()).map((s) => String(s.user)),
  );
  const rows = await Promise.all(
    users.map(async (u) => ({
      ...publicUser(u),
      me: String(u._id) === userId,
      minutes: await weekMinutes(String(u._id), keys, tz, now),
      streak: await quickStreak(String(u._id), tz, now),
      studyingNow: studying.has(String(u._id)),
    })),
  );
  rows.sort((a, b) => b.minutes - a.minutes);
  return { weekStart: keys[0], today: dayKey(now, tz), rows: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
}

/** Báo cho "bạn đồng hành" khi user bỏ dở phiên học */
export async function notifyBuddies(userId: string, session: { id?: string; actualFocusSeconds: number; plannedMinutes?: number | null }) {
  const buddies = await FriendModel.find({ user: userId, status: 'accepted', buddy: true }).select('friend').lean();
  if (!buddies.length) return;
  const u = await UserModel.findById(userId).select('name').lean();
  const name = u?.name ?? 'Bạn của bạn';
  const min = Math.round(session.actualFocusSeconds / 60);
  for (const b of buddies) {
    await notify(String(b.friend), {
      type: 'social',
      title: `${name} vừa bỏ dở phiên học 😢`,
      body: `Mới tập trung được ${min} phút. Nhắn một câu động viên hoặc rủ vào phòng học chung nhé!`,
      data: { link: '/friends', friendId: userId },
      dedupeKey: `buddy:${session.id ?? Date.now()}:${b.friend}`,
    }).catch(() => undefined);
  }
}

export const oid = (id: string) => new Types.ObjectId(id);
