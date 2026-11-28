import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth, uid } from '../middleware/auth';
import { ah, badRequest, forbidden, notFound, parse } from '../utils/http';
import { ChatMessageModel, ChatModel, FriendModel } from '../models/Social';
import { UserModel } from '../models/User';
import { FocusSessionModel } from '../models/FocusSession';
import { emitToUser } from '../services/realtime';
import { pushOnly } from '../services/notifications';
import { publicUser } from '../services/social/friends';

/**
 * Tin nhắn với bạn bè: trò chuyện 1-1 và nhóm.
 * - Tin đến tức thì qua Socket.IO (chat:message), đã xem qua chat:read.
 * - Thông báo đẩy khi có tin mới; mặc định KHÔNG báo khi người nhận đang trong phiên tập trung.
 */
const router = Router();
router.use(requireAuth);

const MAX_GROUP = 50;
type ChatDoc = InstanceType<typeof ChatModel>;

async function areFriends(a: string, b: string) {
  return Boolean(await FriendModel.exists({ user: a, friend: b, status: 'accepted' }));
}

async function loadChat(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Cuộc trò chuyện không tồn tại');
  const c = await ChatModel.findOne({ _id: id, deletedAt: null });
  if (!c || !c.members.some((m) => String(m.user) === userId)) throw notFound('Cuộc trò chuyện không tồn tại');
  return c;
}

/** Dạng gửi về máy khách: tên/ảnh hiển thị, thành viên, số tin chưa đọc */
async function view(c: ChatDoc, me: string, withUnread = true) {
  const users = await UserModel.find({ _id: { $in: c.members.map((m) => m.user) } }).select('name avatarUrl').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const meMember = c.members.find((m) => String(m.user) === me);
  const others = c.members.filter((m) => String(m.user) !== me);
  const other = c.type === 'direct' ? byId.get(String(others[0]?.user)) : null;
  const unread = withUnread && meMember ? await ChatMessageModel.countDocuments({ chat: c._id, deletedAt: null, sender: { $ne: me }, createdAt: { $gt: meMember.lastReadAt } }) : 0;
  const lastSender = c.lastMessage?.sender ? byId.get(String(c.lastMessage.sender)) : null;
  return {
    id: c.id,
    type: c.type,
    name: c.type === 'group' ? c.name || users.map((u) => u.name.split(' ').pop()).join(', ') : (other?.name ?? 'Người dùng'),
    avatarUrl: other?.avatarUrl ?? null,
    members: c.members.map((m) => ({ ...publicUser(byId.get(String(m.user)) ?? { _id: m.user, name: '?' }), admin: m.admin, lastReadAt: m.lastReadAt })),
    isAdmin: Boolean(meMember?.admin),
    muted: Boolean(meMember?.muted),
    unread,
    lastMessage: c.lastMessage?.at
      ? { text: c.lastMessage.text, at: c.lastMessage.at, mine: String(c.lastMessage.sender) === me, senderName: lastSender?.name ?? '' }
      : null,
    updatedAt: (c as { updatedAt?: Date }).updatedAt,
  };
}

const msgView = (m: { _id: unknown; sender?: unknown; text: string; createdAt?: Date; clientId?: string | null }) => ({
  id: String(m._id),
  sender: m.sender ? String(m.sender) : null,
  text: m.text,
  at: m.createdAt,
  clientId: m.clientId ?? undefined,
});

const broadcast = (c: ChatDoc, event: string, payload: unknown) => c.members.forEach((m) => emitToUser(String(m.user), event, payload));

/** Thêm tin hệ thống (VD: "An đã thêm Bình vào nhóm") */
async function systemMessage(c: ChatDoc, text: string) {
  const m = await ChatMessageModel.create({ chat: c._id, sender: null, text });
  c.lastMessage = { text, sender: null, at: m.get('createdAt') } as never;
  await c.save();
  broadcast(c, 'chat:message', { chatId: c.id, message: msgView(m.toObject()) });
}

/* ---------- Danh sách & tổng chưa đọc ---------- */
router.get(
  '/',
  ah(async (req, res) => {
    const me = uid(req);
    const chats = await ChatModel.find({ 'members.user': me, deletedAt: null }).sort({ 'lastMessage.at': -1, updatedAt: -1 }).limit(100);
    res.json({ items: await Promise.all(chats.map((c) => view(c, me))) });
  }),
);

router.get(
  '/unread',
  ah(async (req, res) => {
    const me = uid(req);
    const chats = await ChatModel.find({ 'members.user': me, deletedAt: null }).select('members').lean();
    let count = 0;
    for (const c of chats) {
      const m = c.members.find((x) => String(x.user) === me);
      if (!m || m.muted) continue;
      count += await ChatMessageModel.countDocuments({ chat: c._id, deletedAt: null, sender: { $ne: me }, createdAt: { $gt: m.lastReadAt } });
    }
    res.json({ count });
  }),
);

/* ---------- Mở trò chuyện 1-1 với bạn ---------- */
router.post(
  '/direct',
  ah(async (req, res) => {
    const me = uid(req);
    const { friendId } = parse(z.object({ friendId: z.string() }), req.body);
    if (friendId === me) throw badRequest('Không thể nhắn cho chính mình');
    if (!(await areFriends(me, friendId))) throw forbidden('Chỉ nhắn tin được với bạn bè');
    const key = [me, friendId].sort().join(':');
    let c = await ChatModel.findOne({ directKey: key });
    if (!c) {
      try {
        c = await ChatModel.create({ type: 'direct', directKey: key, createdBy: me, members: [{ user: me }, { user: friendId }] });
      } catch {
        c = await ChatModel.findOne({ directKey: key }); // hai người cùng mở một lúc
      }
    }
    if (c!.deletedAt) {
      c!.deletedAt = null;
      await c!.save();
    }
    res.json({ item: await view(c!, me) });
  }),
);

/* ---------- Nhóm ---------- */
router.post(
  '/groups',
  ah(async (req, res) => {
    const me = uid(req);
    const data = parse(z.object({ name: z.string().trim().min(1).max(80), memberIds: z.array(z.string()).min(1).max(MAX_GROUP - 1) }), req.body);
    const ids = [...new Set(data.memberIds.filter((x) => x !== me))];
    for (const id of ids) if (!(await areFriends(me, id))) throw forbidden('Chỉ thêm được bạn bè vào nhóm');
    const c = await ChatModel.create({ type: 'group', name: data.name, createdBy: me, members: [{ user: me, admin: true }, ...ids.map((u) => ({ user: u }))] });
    const meUser = await UserModel.findById(me).select('name').lean();
    await systemMessage(c, `${meUser?.name ?? 'Ai đó'} đã tạo nhóm “${data.name}”`);
    broadcast(c, 'chat:changed', { chatId: c.id });
    res.status(201).json({ item: await view(c, me) });
  }),
);

router.patch(
  '/:id',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    const data = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), muted: z.boolean().optional() }), req.body);
    if (data.muted !== undefined) {
      const m = c.members.find((x) => String(x.user) === me)!;
      m.muted = data.muted;
    }
    if (data.name && c.type === 'group' && data.name !== c.name) {
      c.name = data.name;
      const u = await UserModel.findById(me).select('name').lean();
      await c.save();
      await systemMessage(c, `${u?.name ?? 'Ai đó'} đã đổi tên nhóm thành “${data.name}”`);
    }
    await c.save();
    broadcast(c, 'chat:changed', { chatId: c.id });
    res.json({ item: await view(c, me) });
  }),
);

router.post(
  '/:id/members',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    if (c.type !== 'group') throw badRequest('Chỉ thêm người vào nhóm');
    const { userIds } = parse(z.object({ userIds: z.array(z.string()).min(1).max(MAX_GROUP) }), req.body);
    const fresh = [...new Set(userIds)].filter((u) => !c.members.some((m) => String(m.user) === u));
    for (const id of fresh) if (!(await areFriends(me, id))) throw forbidden('Chỉ thêm được bạn bè của bạn');
    if (c.members.length + fresh.length > MAX_GROUP) throw badRequest(`Nhóm tối đa ${MAX_GROUP} người`);
    fresh.forEach((u) => c.members.push({ user: u as never, joinedAt: new Date(), lastReadAt: new Date() } as never));
    await c.save();
    const names = (await UserModel.find({ _id: { $in: fresh } }).select('name').lean()).map((u) => u.name).join(', ');
    const meUser = await UserModel.findById(me).select('name').lean();
    if (fresh.length) await systemMessage(c, `${meUser?.name ?? 'Ai đó'} đã thêm ${names} vào nhóm`);
    broadcast(c, 'chat:changed', { chatId: c.id });
    res.json({ item: await view(c, me) });
  }),
);

/** Rời nhóm (userId = mình) hoặc quản trị xoá thành viên */
router.delete(
  '/:id/members/:userId',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    if (c.type !== 'group') throw badRequest('Không áp dụng cho trò chuyện 1-1');
    const target = req.params.userId;
    const meMember = c.members.find((m) => String(m.user) === me)!;
    if (target !== me && !meMember.admin) throw forbidden('Chỉ quản trị nhóm mới xoá được thành viên');
    const before = [...c.members];
    c.members = c.members.filter((m) => String(m.user) !== target) as never;
    if (!c.members.length) c.deletedAt = new Date();
    else if (!c.members.some((m) => m.admin)) c.members[0].admin = true; // luôn còn ít nhất 1 quản trị
    await c.save();
    const [meUser, tUser] = await Promise.all([UserModel.findById(me).select('name').lean(), UserModel.findById(target).select('name').lean()]);
    if (c.members.length) await systemMessage(c, target === me ? `${meUser?.name ?? 'Ai đó'} đã rời nhóm` : `${meUser?.name ?? 'Ai đó'} đã xoá ${tUser?.name ?? 'một thành viên'} khỏi nhóm`);
    before.forEach((m) => emitToUser(String(m.user), 'chat:changed', { chatId: c.id }));
    res.json({ ok: true });
  }),
);

/* ---------- Tin nhắn ---------- */
router.get(
  '/:id/messages',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    const q = parse(z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }), req.query);
    const items = await ChatMessageModel.find({ chat: c._id, deletedAt: null, ...(q.before ? { createdAt: { $lt: new Date(q.before) } } : {}) })
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .lean();
    res.json({ chat: await view(c, me, false), items: items.reverse().map(msgView), hasMore: items.length === q.limit });
  }),
);

router.post(
  '/:id/messages',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    const data = parse(z.object({ text: z.string().trim().min(1).max(2000), clientId: z.string().max(64).optional() }), req.body);
    if (c.type === 'direct') {
      const other = c.members.find((m) => String(m.user) !== me);
      if (other && !(await areFriends(me, String(other.user)))) throw forbidden('Hai bạn không còn là bạn bè');
    }
    let m;
    try {
      m = await ChatMessageModel.create({ chat: c._id, sender: me, text: data.text, clientId: data.clientId });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      m = await ChatMessageModel.findOne({ chat: c._id, clientId: data.clientId }); // gửi lại -> trả tin cũ
      return res.json({ item: msgView(m!.toObject()) });
    }
    const at = m.get('createdAt') as Date;
    c.lastMessage = { text: data.text.slice(0, 200), sender: me, at } as never;
    const meMember = c.members.find((x) => String(x.user) === me)!;
    meMember.lastReadAt = at;
    await c.save();
    const message = msgView(m.toObject());
    broadcast(c, 'chat:message', { chatId: c.id, message });

    // Thông báo đẩy cho người nhận (trừ khi tắt / đang tập trung)
    const sender = await UserModel.findById(me).select('name').lean();
    const recipients = c.members.filter((x) => String(x.user) !== me && !x.muted).map((x) => String(x.user));
    if (recipients.length) {
      const [users, focusing] = await Promise.all([
        UserModel.find({ _id: { $in: recipients } }).select('notificationSettings').lean(),
        FocusSessionModel.find({ user: { $in: recipients }, status: { $in: ['active', 'paused'] }, deletedAt: null }).select('user').lean(),
      ]);
      const busy = new Set(focusing.map((f) => String(f.user)));
      const title = c.type === 'group' ? c.name || 'Nhóm' : (sender?.name ?? 'Tin nhắn mới');
      const body = c.type === 'group' ? `${sender?.name ?? ''}: ${data.text}` : data.text;
      for (const u of users) {
        const ns = u.notificationSettings as { chatMessages?: boolean; chatDuringFocus?: boolean } | undefined;
        if (ns?.chatMessages === false) continue;
        if (busy.has(String(u._id)) && !ns?.chatDuringFocus) continue; // đang học -> không làm phiền
        void pushOnly(String(u._id), title, body.slice(0, 180), { type: 'chat', link: `/messages?chat=${c.id}`, chatId: c.id }, `chat-${c.id}`, 'focusly-chat');
      }
    }
    res.status(201).json({ item: message });
  }),
);

/** Đánh dấu đã đọc (để hiện "Đã xem" cho người gửi) */
router.post(
  '/:id/read',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    const m = c.members.find((x) => String(x.user) === me)!;
    m.lastReadAt = new Date();
    await c.save();
    broadcast(c, 'chat:read', { chatId: c.id, userId: me, at: m.lastReadAt });
    res.json({ ok: true });
  }),
);

/** Xoá tin của mình */
router.delete(
  '/:id/messages/:mid',
  ah(async (req, res) => {
    const me = uid(req);
    const c = await loadChat(req.params.id, me);
    const r = await ChatMessageModel.updateOne({ _id: req.params.mid, chat: c._id, sender: me }, { deletedAt: new Date() });
    if (!r.matchedCount) throw notFound();
    broadcast(c, 'chat:deleted', { chatId: c.id, messageId: req.params.mid });
    res.json({ ok: true });
  }),
);

export default router;
