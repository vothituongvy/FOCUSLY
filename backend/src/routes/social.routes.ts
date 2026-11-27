import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, forbidden, notFound, parse } from '../utils/http';
import { FriendModel, RoomModel } from '../models/Social';
import { UserModel } from '../models/User';
import { emitToUser } from '../services/realtime';
import { notify } from '../services/notifications';
import { gamifyStatus } from '../services/social/gamify';
import { friendCodeOf, leaderboard, publicUser, weekKeys, weekMinutes } from '../services/social/friends';
import { roomPhase, shortCode } from '../services/social/logic';
import { safeTimeZone } from '../utils/time';
import { reportSummary, weeklyReport } from '../services/social/report';

/**
 * Học cùng nhau: streak & nhiệm vụ ngày, bạn bè, bảng xếp hạng tuần, bạn đồng hành, phòng học chung.
 */
const router = Router();
router.use(requireAuth);

/* ---------------- Streak + nhiệm vụ ngày ---------------- */
router.get(
  '/gamify',
  ah(async (req, res) => {
    res.json(await gamifyStatus(uid(req)));
  }),
);

/* ---------------- Bạn bè ---------------- */
router.get(
  '/friends',
  ah(async (req, res) => {
    const userId = uid(req);
    const code = await friendCodeOf(userId);
    const links = await FriendModel.find({ user: userId }).populate('friend', 'name avatarUrl').lean();
    // ai đang chọn mình làm bạn đồng hành
    const watching = new Set((await FriendModel.find({ friend: userId, status: 'accepted', buddy: true }).select('user').lean()).map((f) => String(f.user)));
    const items = links
      .filter((l) => l.friend)
      .map((l) => ({
        ...publicUser(l.friend as never),
        status: l.status,
        buddy: l.buddy,
        buddyOfMe: watching.has(String((l.friend as { _id: unknown })._id)),
        since: (l as { createdAt?: Date }).createdAt,
      }));
    res.json({ code, items });
  }),
);

router.post(
  '/friends',
  ah(async (req, res) => {
    const userId = uid(req);
    const { code } = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
    const other = await UserModel.findOne({ friendCode: code.toUpperCase() }).select('name avatarUrl');
    if (!other) throw notFound('Không tìm thấy mã kết bạn này');
    const otherId = String(other._id);
    if (otherId === userId) throw badRequest('Đây là mã của chính bạn');
    const reverse = await FriendModel.findOne({ user: userId, friend: otherId });
    if (reverse?.status === 'accepted') return res.json({ status: 'accepted', friend: publicUser(other) });
    if (reverse?.status === 'incoming') {
      // người kia đã gửi lời mời trước -> chấp nhận luôn
      await FriendModel.updateOne({ user: userId, friend: otherId }, { status: 'accepted' });
      await FriendModel.updateOne({ user: otherId, friend: userId }, { status: 'accepted' });
      emitToUser(otherId, 'friends:changed', {});
      return res.json({ status: 'accepted', friend: publicUser(other) });
    }
    await FriendModel.updateOne({ user: userId, friend: otherId }, { status: 'outgoing' }, { upsert: true });
    await FriendModel.updateOne({ user: otherId, friend: userId }, { status: 'incoming' }, { upsert: true });
    const me = await UserModel.findById(userId).select('name').lean();
    await notify(otherId, { type: 'social', title: `${me?.name ?? 'Ai đó'} muốn kết bạn học cùng bạn`, body: 'Mở mục Bạn bè để chấp nhận.', data: { link: '/friends' }, dedupeKey: `friendreq:${userId}:${otherId}` });
    emitToUser(otherId, 'friends:changed', {});
    res.status(201).json({ status: 'outgoing', friend: publicUser(other) });
  }),
);

router.post(
  '/friends/:id/accept',
  ah(async (req, res) => {
    const userId = uid(req);
    const link = await FriendModel.findOne({ user: userId, friend: req.params.id, status: 'incoming' });
    if (!link) throw notFound('Không có lời mời này');
    link.status = 'accepted';
    await link.save();
    await FriendModel.updateOne({ user: req.params.id, friend: userId }, { status: 'accepted' });
    const me = await UserModel.findById(userId).select('name').lean();
    await notify(req.params.id, { type: 'social', title: `${me?.name ?? 'Bạn'} đã chấp nhận lời mời kết bạn`, data: { link: '/friends' } });
    emitToUser(req.params.id, 'friends:changed', {});
    res.json({ ok: true });
  }),
);

router.patch(
  '/friends/:id',
  ah(async (req, res) => {
    const { buddy } = parse(z.object({ buddy: z.boolean() }), req.body);
    const r = await FriendModel.updateOne({ user: uid(req), friend: req.params.id, status: 'accepted' }, { buddy });
    if (!r.matchedCount) throw notFound();
    res.json({ ok: true, buddy });
  }),
);

router.delete(
  '/friends/:id',
  ah(async (req, res) => {
    const userId = uid(req);
    await FriendModel.deleteOne({ user: userId, friend: req.params.id });
    await FriendModel.deleteOne({ user: req.params.id, friend: userId });
    emitToUser(req.params.id, 'friends:changed', {});
    res.json({ ok: true });
  }),
);

/** Gửi lời nhắn động viên nhanh tới bạn */
router.post(
  '/friends/:id/cheer',
  ah(async (req, res) => {
    const userId = uid(req);
    const ok = await FriendModel.exists({ user: userId, friend: req.params.id, status: 'accepted' });
    if (!ok) throw forbidden('Chỉ gửi được cho bạn bè');
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(120) }), req.body);
    const me = await UserModel.findById(userId).select('name').lean();
    await notify(req.params.id, { type: 'social', title: `💬 ${me?.name ?? 'Bạn'}: ${text}`, data: { link: '/friends' }, urgent: false });
    res.json({ ok: true });
  }),
);

router.get(
  '/weekly-report',
  ah(async (req, res) => {
    const r = await weeklyReport(uid(req));
    res.json({ ...r, email: undefined, summary: reportSummary(r) });
  }),
);

router.get(
  '/leaderboard',
  ah(async (req, res) => {
    res.json(await leaderboard(uid(req)));
  }),
);

/* ---------------- Phòng học chung ---------------- */
const ONLINE_MS = 70_000;

async function roomView(room: InstanceType<typeof RoomModel>, viewer: string) {
  const ids = room.members.map((m) => String(m.user));
  const users = await UserModel.find({ _id: { $in: ids } }).select('name avatarUrl profile.timezone').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const now = new Date();
  const members = await Promise.all(
    room.members.map(async (m) => {
      const u = byId.get(String(m.user));
      const tz = safeTimeZone(u?.profile?.timezone);
      return {
        ...(u ? publicUser(u) : { id: String(m.user), name: '?', avatarUrl: null }),
        online: !!m.lastSeen && now.getTime() - new Date(m.lastSeen).getTime() < ONLINE_MS,
        owner: String(m.user) === String(room.owner),
        weekMinutes: u ? await weekMinutes(String(u._id), weekKeys(tz, now), tz, now) : 0,
      };
    }),
  );
  members.sort((a, b) => Number(b.online) - Number(a.online) || b.weekMinutes - a.weekMinutes);
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    isOwner: String(room.owner) === viewer,
    focusMinutes: room.focusMinutes,
    breakMinutes: room.breakMinutes,
    runningSince: room.runningSince,
    timer: roomPhase(room.runningSince, room.focusMinutes, room.breakMinutes, now),
    serverTime: now.toISOString(),
    members,
    messages: room.messages.slice(-50),
  };
}

async function broadcastRoom(room: InstanceType<typeof RoomModel>) {
  for (const m of room.members) emitToUser(String(m.user), 'room:update', { id: room.id });
}

async function loadRoom(id: string, userId: string) {
  const room = await RoomModel.findOne({ _id: id, deletedAt: null });
  if (!room) throw notFound('Phòng không tồn tại');
  if (!room.members.some((m) => String(m.user) === userId)) throw forbidden('Bạn chưa vào phòng này');
  return room;
}

router.get(
  '/rooms',
  ah(async (req, res) => {
    const userId = uid(req);
    const rooms = await RoomModel.find({ 'members.user': userId, deletedAt: null }).sort({ updatedAt: -1 }).limit(30);
    const now = new Date();
    res.json({
      items: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        members: r.members.length,
        online: r.members.filter((m) => m.lastSeen && now.getTime() - new Date(m.lastSeen).getTime() < ONLINE_MS).length,
        timer: roomPhase(r.runningSince, r.focusMinutes, r.breakMinutes, now),
      })),
    });
  }),
);

router.post(
  '/rooms',
  ah(async (req, res) => {
    const userId = uid(req);
    const data = parse(z.object({ name: z.string().trim().min(1).max(80), focusMinutes: z.number().int().min(5).max(120).default(25), breakMinutes: z.number().int().min(1).max(60).default(5) }), req.body);
    let room = null;
    for (let i = 0; i < 6 && !room; i++) {
      try {
        room = await RoomModel.create({ ...data, code: shortCode(6), owner: userId, members: [{ user: userId, joinedAt: new Date(), lastSeen: new Date() }] });
      } catch {
        /* trùng mã */
      }
    }
    if (!room) throw badRequest('Không tạo được phòng, thử lại');
    res.status(201).json({ item: await roomView(room, userId) });
  }),
);

router.post(
  '/rooms/join',
  ah(async (req, res) => {
    const userId = uid(req);
    const { code } = parse(z.object({ code: z.string().trim().min(4).max(12) }), req.body);
    const room = await RoomModel.findOne({ code: code.toUpperCase(), deletedAt: null });
    if (!room) throw notFound('Mã phòng không đúng');
    if (!room.members.some((m) => String(m.user) === userId)) {
      if (room.members.length >= 30) throw badRequest('Phòng đã đủ 30 người');
      room.members.push({ user: userId as never, joinedAt: new Date(), lastSeen: new Date() });
      await room.save();
      await broadcastRoom(room);
    }
    res.json({ item: await roomView(room, userId) });
  }),
);

router.get(
  '/rooms/:id',
  ah(async (req, res) => {
    const userId = uid(req);
    res.json({ item: await roomView(await loadRoom(req.params.id, userId), userId) });
  }),
);

/** Có mặt trong phòng (gọi mỗi ~30 giây khi đang mở phòng) */
router.post(
  '/rooms/:id/ping',
  ah(async (req, res) => {
    const userId = uid(req);
    const room = await loadRoom(req.params.id, userId);
    const m = room.members.find((x) => String(x.user) === userId)!;
    const wasOnline = m.lastSeen && Date.now() - new Date(m.lastSeen).getTime() < ONLINE_MS;
    m.lastSeen = new Date();
    await room.save();
    if (!wasOnline) await broadcastRoom(room);
    res.json({ item: await roomView(room, userId) });
  }),
);

router.post(
  '/rooms/:id/timer',
  ah(async (req, res) => {
    const userId = uid(req);
    const data = parse(z.object({ action: z.enum(['start', 'stop']), focusMinutes: z.number().int().min(5).max(120).optional(), breakMinutes: z.number().int().min(1).max(60).optional() }), req.body);
    const room = await loadRoom(req.params.id, userId);
    if (data.focusMinutes) room.focusMinutes = data.focusMinutes;
    if (data.breakMinutes) room.breakMinutes = data.breakMinutes;
    room.runningSince = data.action === 'start' ? new Date() : null;
    const me = await UserModel.findById(userId).select('name').lean();
    room.messages.push({ user: userId as never, name: '', text: `${me?.name ?? 'Ai đó'} ${data.action === 'start' ? `bắt đầu ${room.focusMinutes} phút tập trung` : 'dừng đồng hồ'}`, at: new Date() });
    await room.save();
    await broadcastRoom(room);
    res.json({ item: await roomView(room, userId) });
  }),
);

router.post(
  '/rooms/:id/messages',
  ah(async (req, res) => {
    const userId = uid(req);
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(300) }), req.body);
    const room = await loadRoom(req.params.id, userId);
    const me = await UserModel.findById(userId).select('name').lean();
    room.messages.push({ user: userId as never, name: me?.name ?? '', text, at: new Date() });
    if (room.messages.length > 100) room.messages.splice(0, room.messages.length - 100);
    await room.save();
    await broadcastRoom(room);
    res.json({ item: await roomView(room, userId) });
  }),
);

router.post(
  '/rooms/:id/leave',
  ah(async (req, res) => {
    const userId = uid(req);
    const room = await loadRoom(req.params.id, userId);
    room.members = room.members.filter((m) => String(m.user) !== userId) as never;
    if (!room.members.length) room.deletedAt = new Date();
    else if (String(room.owner) === userId) room.owner = room.members[0].user as never;
    await room.save();
    await broadcastRoom(room);
    res.json({ ok: true });
  }),
);

/** Mời bạn bè vào phòng (gửi thông báo) */
router.post(
  '/rooms/:id/invite',
  ah(async (req, res) => {
    const userId = uid(req);
    const { friendId } = parse(z.object({ friendId: z.string() }), req.body);
    const room = await loadRoom(req.params.id, userId);
    const ok = await FriendModel.exists({ user: userId, friend: friendId, status: 'accepted' });
    if (!ok) throw forbidden('Chỉ mời được bạn bè');
    const me = await UserModel.findById(userId).select('name').lean();
    await notify(friendId, { type: 'social', title: `${me?.name ?? 'Bạn'} rủ bạn vào phòng “${room.name}”`, body: `Mã phòng: ${room.code}`, data: { link: `/rooms?code=${room.code}` }, dedupeKey: `roominv:${room.id}:${friendId}:${new Date().toISOString().slice(0, 13)}` });
    res.json({ ok: true });
  }),
);

export default router;
