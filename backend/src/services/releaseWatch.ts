import { AppMetaModel } from '../models/Social';
import { UserModel } from '../models/User';
import { notify } from './notifications';
import { fetchLatestRelease } from './latestRelease';

/**
 * Theo dõi bản app mới trên GitHub Releases (mỗi 15 phút).
 * Khi có tag mới -> báo cho mọi người dùng (trong app + thông báo đẩy), chạm vào để cập nhật.
 * Lần chạy đầu chỉ ghi nhận bản hiện tại, không báo.
 */
let lastCheck = 0;

export async function checkNewRelease(now = Date.now()) {
  if (now - lastCheck < 15 * 60_000) return;
  lastCheck = now;
  const r = await fetchLatestRelease();
  if (!r) return;
  if (r.draft || r.prerelease) return;
  const prev = await AppMetaModel.findOne({ key: 'release.lastTag' }).lean();
  if (prev?.value === r.tag_name) return;
  await AppMetaModel.updateOne({ key: 'release.lastTag' }, { value: r.tag_name }, { upsert: true });
  if (!prev) return; // lần đầu: chỉ ghi nhận

  const version = r.tag_name.replace(/^v/i, '');
  const note = (r.body ?? '').split('\n').map((l) => l.replace(/^[#*\-\s]+/, '').trim()).find(Boolean) ?? '';
  const users = await UserModel.find({ disabledAt: null }).select('_id').lean();
  for (const u of users) {
    await notify(String(u._id), {
      type: 'system',
      title: `FOCUSLY ${version} đã có 🎉`,
      body: note ? `${note.slice(0, 140)} – chạm để cập nhật app.` : 'Chạm để cập nhật app lên bản mới nhất.',
      data: { link: '/update', version },
      dedupeKey: `release:${r.tag_name}`,
    }).catch(() => undefined);
  }
  console.log(`[release] Đã báo bản ${r.tag_name} cho ${users.length} người dùng`);
}
