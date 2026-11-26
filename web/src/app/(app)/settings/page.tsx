'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_URL, api, del, errorMessage, get, patch, post, put } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { fmtRelative, WEEKDAYS_VI } from '@/lib/format';
import { connectExtension, hasExtensionConfig, isExtensionInstalled } from '@/lib/extension';
import type { FocusScheduleItem, NotificationSettings, User } from '@/lib/types';
import { Avatar, Toggle } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { LANG, setLang, tr, type Lang } from '@/lib/i18n';

type Tab = 'profile' | 'preferences' | 'shield' | 'notifications' | 'security' | 'language';

function Saved({ msg, error }: { msg: string; error: string }) {
  if (error) return <span className="error-text">{error}</span>;
  if (msg) return <span className="success-text">{msg}</span>;
  return null;
}

/* ============ Hồ sơ ============ */
function ProfileTab({ user }: { user: User }) {
  const setUser = useAuth((s) => s.setUser);
  const [name, setName] = useState(user.name);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await patch<{ user: User }>('/users/me', { name });
      setUser(r.user);
      setMsg(tr('Đã lưu ✓'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const upload = async (file: File) => {
    setError('');
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const r = await api<{ user: User }>('/users/me/avatar', { method: 'POST', body: fd });
      setUser(r.user);
      setMsg(tr('Đã cập nhật ảnh đại diện ✓'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form className="form" onSubmit={save} style={{ maxWidth: 520 }}>
      <div className="row" style={{ gap: 18 }}>
        <Avatar name={user.name} url={user.avatarUrl} size="lg" />
        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <button type="button" className="btn secondary sm" onClick={() => fileRef.current?.click()}>
              {tr('Tải ảnh lên')}
            </button>
            {user.avatarUrl && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={async () => {
                  const r = await del<{ user: User }>('/users/me/avatar');
                  setUser(r.user);
                }}
              >
                {tr('Xoá ảnh')}
              </button>
            )}
          </div>
          <span className="small muted">{tr('JPG, PNG, WEBP · tối đa 2MB')}</span>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </div>
      <label className="field">
        {tr('Họ tên')}
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Email
        <input value={user.email} disabled />
      </label>
      <div className="row">
        <button className="btn">{tr('Lưu')}</button>
        <Saved msg={msg} error={error} />
      </div>
    </form>
  );
}

/* ============ Sở thích học tập ============ */
function PreferencesTab({ user }: { user: User }) {
  const setUser = useAuth((s) => s.setUser);
  const [p, setP] = useState(user.profile);
  const [subjectsText, setSubjectsText] = useState(user.profile.interestedSubjects.join(', '));
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    try {
      setZones((Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'));
    } catch {
      setZones(['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Tokyo', 'UTC', 'Europe/London', 'America/New_York']);
    }
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await patch<{ user: User }>('/users/me', {
        profile: {
          learningGoal: p.learningGoal,
          interestedSubjects: subjectsText.split(',').map((s) => s.trim()).filter(Boolean),
          preferredStudyTimes: p.preferredStudyTimes,
          dailyTargetMinutes: Number(p.dailyTargetMinutes),
          timezone: p.timezone,
          language: p.language,
          defaultPomodoro: p.defaultPomodoro,
        },
      });
      setUser(r.user);
      setMsg(tr('Đã lưu ✓'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form className="form" onSubmit={save} style={{ maxWidth: 640 }}>
      <label className="field">
        {tr('Mục tiêu học tập')}
        <textarea value={p.learningGoal} onChange={(e) => setP({ ...p, learningGoal: e.target.value })} placeholder={tr('VD: Đạt IELTS 6.5 trước tháng 6')} />
      </label>
      <label className="field">
        {tr('Môn học quan tâm (phân tách bằng dấu phẩy)')}
        <input value={subjectsText} onChange={(e) => setSubjectsText(e.target.value)} placeholder={tr('Tiếng Anh, Toán, Lịch sử')} />
      </label>
      <div className="field">
        {tr('Khung giờ học mong muốn')}
        {p.preferredStudyTimes.map((t, i) => (
          <div className="row" key={i}>
            <input
              type="time"
              value={t.start}
              onChange={(e) => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })}
            />
            <span className="muted small">{tr('đến')}</span>
            <input
              type="time"
              value={t.end}
              onChange={(e) => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })}
            />
            <button type="button" className="icon-btn" onClick={() => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn secondary sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setP({ ...p, preferredStudyTimes: [...p.preferredStudyTimes, { start: '19:00', end: '21:00' }] })}
        >
          {tr('+ Thêm khung giờ')}
        </button>
      </div>
      <div className="grid grid-2">
        <label className="field">
          {tr('Thời lượng học mục tiêu mỗi ngày (phút)')}
          <input type="number" min={0} max={1440} value={p.dailyTargetMinutes} onChange={(e) => setP({ ...p, dailyTargetMinutes: Number(e.target.value) })} />
        </label>
        <label className="field">
          {tr('Ngôn ngữ')}
          <select value={p.language} onChange={(e) => setP({ ...p, language: e.target.value as 'vi' | 'en' })}>
            <option value="vi">{tr('Tiếng Việt')}</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          {tr('Múi giờ')}
          <select value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        {tr('Pomodoro mặc định')}
        <div className="grid grid-4">
          {(
            [
              ['focusMinutes', tr('Tập trung')],
              ['breakMinutes', tr('Nghỉ ngắn')],
              ['longBreakMinutes', tr('Nghỉ dài')],
              ['cyclesBeforeLongBreak', tr('Số vòng')],
            ] as const
          ).map(([k, l]) => (
            <label className="field" key={k}>
              <span className="small muted">{l}</span>
              <input
                type="number"
                min={1}
                value={p.defaultPomodoro[k]}
                onChange={(e) => setP({ ...p, defaultPomodoro: { ...p.defaultPomodoro, [k]: Number(e.target.value) || 1 } })}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn">{tr('Lưu')}</button>
        <Saved msg={msg} error={error} />
      </div>
    </form>
  );
}

/* ============ Focus Shield ============ */
function ShieldTab({ user }: { user: User }) {
  const refreshUser = useAuth((s) => s.refreshUser);
  const [blockList, setBlockList] = useState(user.shield.blockList);
  const [domain, setDomain] = useState('');
  const [autoEnable, setAutoEnable] = useState(user.shield.autoEnableOnSession);
  const [allowList, setAllowList] = useState<string[]>(user.shield.allowList ?? []);
  const [allowDomain, setAllowDomain] = useState('');
  const [strictDefault, setStrictDefault] = useState(user.shield.strictByDefault ?? false);
  const [hide, setHide] = useState(user.shield.hideDistractions);
  const [schedule, setSchedule] = useState<FocusScheduleItem[]>(user.shield.schedule);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ext, setExt] = useState<'unknown' | 'missing' | 'installed' | 'connected'>('unknown');

  useEffect(() => {
    void isExtensionInstalled().then((ok) => setExt(ok ? 'installed' : 'missing'));
  }, []);

  const save = async () => {
    setError('');
    try {
      const r = await put<{ shield: User['shield'] }>('/shield', {
        blockList,
        allowList,
        strictByDefault: strictDefault,
        autoEnableOnSession: autoEnable,
        hideDistractions: hide,
        schedule: schedule.map(({ days, start, end, enabled }) => ({ days, start, end, enabled })),
      });
      setBlockList(r.shield.blockList);
      await refreshUser();
      setMsg(tr('Đã lưu ✓'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const add = () => {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    if (d && !blockList.includes(d)) setBlockList([...blockList, d]);
    setDomain('');
  };

  return (
    <div className="col" style={{ maxWidth: 680, gap: 18 }}>
      <div className="card col" style={{ boxShadow: 'none' }}>
        <div className="row between">
          <div>
            <b>{tr('Tự bật Focus Shield khi bắt đầu phiên')}</b>
            <p className="small muted">{tr('Có thể tắt riêng cho từng phiên.')}</p>
          </div>
          <Toggle on={autoEnable} onChange={setAutoEnable} />
        </div>
        <div className="row between">
          <div>
            <b>{tr('Mặc định dùng Phiên nghiêm ngặt')}</b>
            <p className="small muted">{tr('Khoá tab, chỉ mở trang được phép, đồng hồ dừng khi bạn rời FOCUSLY.')}</p>
          </div>
          <Toggle on={strictDefault} onChange={setStrictDefault} />
        </div>
        <div className="row between">
          <div>
            <b>{tr('Ẩn thành phần gây xao nhãng (Focus Mode)')}</b>
            <p className="small muted">{tr('Che sidebar, thông báo, chỉ hiển thị đồng hồ và mục tiêu.')}</p>
          </div>
          <Toggle on={hide} onChange={setHide} />
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>{tr('Block List – website gây phân tâm')}</h3>
        <div className="row">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="vd: facebook.com" />
          <button type="button" className="btn secondary" onClick={add}>
            {tr('Thêm')}
          </button>
        </div>
        <div className="chips">
          {blockList.map((d) => (
            <span key={d} className="chip">
              {d}{' '}
              <button className="icon-btn" style={{ padding: 0 }} onClick={() => setBlockList(blockList.filter((x) => x !== d))}>
                ✕
              </button>
            </span>
          ))}
          {blockList.length === 0 && <span className="small muted">{tr('Chưa có website nào.')}</span>}
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>{tr('Trang được phép trong Phiên nghiêm ngặt')}</h3>
        <p className="small muted">{tr('Ngoài FOCUSLY, chỉ những trang này mở được khi phiên nghiêm ngặt đang chạy. Thêm trang bạn cần khi học, ví dụ từ điển hay trang bài giảng của trường.')}</p>
        <div className="row">
          <input
            value={allowDomain}
            onChange={(e) => setAllowDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const d = allowDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
              if (d && !allowList.includes(d)) setAllowList([...allowList, d]);
              setAllowDomain('');
            }}
            placeholder="vd: vi.wikipedia.org"
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              const d = allowDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
              if (d && !allowList.includes(d)) setAllowList([...allowList, d]);
              setAllowDomain('');
            }}
          >
            {tr('Cho phép')}
          </button>
        </div>
        <div className="chips">
          {allowList.map((d) => (
            <span key={d} className="chip">
              {d}{' '}
              <button className="icon-btn" style={{ padding: 0 }} onClick={() => setAllowList(allowList.filter((x) => x !== d))}>
                ✕
              </button>
            </span>
          ))}
          {allowList.length === 0 && <span className="small muted">{tr('Chỉ FOCUSLY được mở trong phiên nghiêm ngặt.')}</span>}
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>{tr('Focus Schedule – khung giờ tự bật chặn website')}</h3>
        {schedule.map((s, i) => (
          <div key={i} className="row wrap" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <div className="chips">
              {WEEKDAYS_VI.map((d, wd) => (
                <button
                  key={d}
                  type="button"
                  className={`chip ${s.days.includes(wd) ? 'active' : ''}`}
                  style={{ padding: '4px 9px' }}
                  onClick={() =>
                    setSchedule(schedule.map((x, j) => (j === i ? { ...x, days: x.days.includes(wd) ? x.days.filter((y) => y !== wd) : [...x.days, wd] } : x)))
                  }
                >
                  {d}
                </button>
              ))}
            </div>
            <input type="time" value={s.start} style={{ width: 120 }} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            <span className="muted small">{tr('đến')}</span>
            <input type="time" value={s.end} style={{ width: 120 }} onChange={(e) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <Toggle on={s.enabled} onChange={(v) => setSchedule(schedule.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} />
            <button className="icon-btn" onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        ))}
        <button
          className="btn secondary sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setSchedule([...schedule, { days: [1, 2, 3, 4, 5], start: '19:00', end: '21:00', enabled: true }])}
        >
          {tr('+ Thêm khung giờ')}
        </button>
      </div>

      <div className="row">
        <button className="btn" onClick={save}>
          {tr('Lưu cấu hình Shield')}
        </button>
        <Saved msg={msg} error={error} />
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>Chrome Extension</h3>
        <p className="small muted">
          {tr('Extension chặn các website trong Block List khi phiên học đang chạy – kể cả khi bạn bắt đầu phiên trên điện thoại (Device Sync).')}
        </p>
        {!hasExtensionConfig() ? (
          <p className="small">{tr('Chưa cấu hình NEXT_PUBLIC_EXTENSION_ID. Xem hướng dẫn trong extension/README.md.')}</p>
        ) : ext === 'missing' && EXTENSION_STORE_URL ? (
          <div className="col" style={{ gap: 8 }}>
            <p className="small">{tr('Chưa phát hiện extension trên trình duyệt này.')}</p>
            <div className="row">
              <a className="btn" href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
                {tr('Thêm vào Chrome')}
              </a>
            </div>
            <p className="small muted">{tr('Cài xong, tải lại trang này rồi bấm "Kết nối extension với tài khoản".')}</p>
          </div>
        ) : ext === 'missing' ? (
          <div className="col" style={{ gap: 8 }}>
            <p className="small">{tr('Chưa phát hiện extension trên trình duyệt này. Cài theo 4 bước:')}</p>
            <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
              <li>{tr('Tải file focusly-extension.zip và giải nén.')}</li>
              <li>{tr('Mở chrome://extensions, bật "Chế độ dành cho nhà phát triển" (góc trên bên phải).')}</li>
              <li>{tr('Bấm "Tải tiện ích đã giải nén" và chọn thư mục focusly-extension vừa giải nén.')}</li>
              <li>{tr('Tải lại trang này rồi bấm "Kết nối extension với tài khoản".')}</li>
            </ol>
            <div className="row">
              <a className="btn" href={EXTENSION_ZIP_URL} target="_blank" rel="noreferrer">
                {tr('Tải extension')}
              </a>
            </div>
          </div>
        ) : (
          <div className="row">
            <button
              className="btn secondary"
              onClick={async () => {
                const { token } = await post<{ token: string }>('/shield/extension-token');
                const r = await connectExtension(API_URL, token);
                setExt(r?.ok ? 'connected' : 'installed');
              }}
            >
              {ext === 'connected' ? tr('✓ Đã kết nối – kết nối lại') : tr('Kết nối extension với tài khoản')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const EXTENSION_ZIP_URL = 'https://github.com/vothituongvy/FOCUSLY/releases/download/extension/focusly-extension.zip';
// Link trang extension trên Chrome Web Store (khi đã được duyệt) -> người dùng cài bằng 1 nút
const EXTENSION_STORE_URL = (process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ?? '').trim();

/* ============ Thông báo (Phase 2) ============ */
function NotificationsTab() {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    void get<{ settings: NotificationSettings; pushAvailable: boolean }>('/notifications/settings').then((r) => {
      setS(r.settings);
      setPushAvailable(r.pushAvailable);
    });
  }, []);
  if (!s) return null;
  const toggles: [keyof NotificationSettings, string, string][] = [
    ['studyReminder', tr('Nhắc lịch học'), tr('Theo khung giờ học mong muốn trong Sở thích học tập')],
    ['taskReminder', tr('Nhắc nhiệm vụ sắp đến hạn'), ''],
    ['breakReminder', tr('Nhắc nghỉ giữa phiên'), tr('Khi hết thời gian Pomodoro')],
    ['dailySummary', tr('Tổng kết cuối ngày'), ''],
    ['reviewReminder', tr('Nhắc ôn flashcard đến hạn'), tr('Lúc 8:00 nếu có ≥ 5 thẻ')],
    ['push', tr('Gửi thông báo đẩy đến điện thoại'), pushAvailable ? '' : tr('Máy chủ chưa cấu hình Firebase (FCM)')],
  ];
  const save = async (next: NotificationSettings) => {
    setS(next);
    await put('/notifications/settings', next);
    setMsg(tr('Đã lưu ✓'));
  };
  return (
    <div className="col" style={{ maxWidth: 640, gap: 14 }}>
      <div className="card row between" style={{ boxShadow: 'none' }}>
        <div>
          <b>{tr('Thông báo trình duyệt')}</b>
          <p className="small muted">{tr('Trạng thái:')}{' '}{perm === 'granted' ? tr('đã cho phép') : perm === 'denied' ? tr('đã chặn (mở lại trong cài đặt trình duyệt)') : tr('chưa cấp quyền')}</p>
        </div>
        {perm === 'default' && (
          <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>
            {tr('Cho phép')}
          </button>
        )}
      </div>
      {toggles.map(([k, label, hint]) => (
        <div key={k} className="row between">
          <div>
            <b>{label}</b>
            {hint && <p className="small muted">{hint}</p>}
          </div>
          <Toggle on={Boolean(s[k])} onChange={(v) => save({ ...s, [k]: v })} />
        </div>
      ))}
      <div className="grid grid-2">
        <label className="field">
          {tr('Nhắc nhiệm vụ trước (phút)')}
          <input type="number" min={5} max={1440} value={s.taskReminderMinutes} onChange={(e) => setS({ ...s, taskReminderMinutes: Number(e.target.value) })} onBlur={() => save(s)} />
        </label>
        <label className="field">
          {tr('Giờ tổng kết ngày')}
          <input type="time" value={s.dailySummaryTime} onChange={(e) => save({ ...s, dailySummaryTime: e.target.value })} />
        </label>
        <label className="field">
          {tr('Giờ yên lặng – bắt đầu')}
          <input type="time" value={s.quietStart} onChange={(e) => save({ ...s, quietStart: e.target.value })} />
        </label>
        <label className="field">
          {tr('Giờ yên lặng – kết thúc')}
          <input type="time" value={s.quietEnd} onChange={(e) => save({ ...s, quietEnd: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <button className="btn secondary sm" onClick={() => post('/notifications/test').then(() => setMsg(tr('Đã gửi thông báo thử')))}>
          {tr('Gửi thông báo thử')}
        </button>
        {msg && <span className="success-text">{msg}</span>}
      </div>
    </div>
  );
}

/* ============ Bảo mật ============ */
interface LoginSession {
  id: string;
  platform: string;
  userAgent: string;
  ip: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

function SecurityTab({ user }: { user: User }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const sessions = useResource<{ sessions: LoginSession[] }>('/users/me/sessions');

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await post('/users/me/change-password', { currentPassword: current || undefined, newPassword: next, logoutOtherDevices: true });
      setMsg(tr('Đổi mật khẩu thành công. Các thiết bị khác đã bị đăng xuất.'));
      setCurrent('');
      setNext('');
      void sessions.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="col" style={{ maxWidth: 680, gap: 22 }}>
      <form className="form card" style={{ boxShadow: 'none' }} onSubmit={change}>
        <h3>{user.hasPassword ? tr('Đổi mật khẩu') : tr('Đặt mật khẩu (tài khoản Google)')}</h3>
        {user.hasPassword && (
          <label className="field">
            {tr('Mật khẩu hiện tại')}
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="field">
          {tr('Mật khẩu mới (≥ 8 ký tự, có chữ và số)')}
          <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn">{tr('Cập nhật')}</button>
          <Saved msg={msg} error={error} />
        </div>
      </form>

      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h3>{tr('Phiên đăng nhập')}</h3>
          <button
            className="btn sm secondary"
            onClick={async () => {
              await del('/users/me/sessions');
              void sessions.reload();
            }}
          >
            {tr('Đăng xuất thiết bị khác')}
          </button>
        </div>
        <div className="list">
          {sessions.data?.sessions.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {s.platform} {s.current && <span className="badge done">{tr('Thiết bị này')}</span>}
                </div>
                <div className="small muted truncate">
                  {s.userAgent || tr('Không rõ')}{' '}{tr('· {0} · hoạt động {1}', s.ip, fmtRelative(s.lastUsedAt))}
                </div>
              </div>
              {!s.current && (
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    await del(`/users/me/sessions/${s.id}`);
                    void sessions.reload();
                  }}
                >
                  {tr('Đăng xuất')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LanguageTab() {
  const options: { id: Lang; name: string; native: string; sample: string }[] = [
    { id: 'vi', name: 'Tiếng Việt', native: 'Vietnamese', sample: 'Bắt đầu phiên học' },
    { id: 'en', name: 'English', native: 'Tiếng Anh', sample: 'Start a study session' },
  ];
  return (
    <div className="col" style={{ maxWidth: 620, gap: 14 }}>
      <div>
        <h3>{tr('Ngôn ngữ giao diện')}</h3>
        <p className="small muted" style={{ marginTop: 4 }}>
          {tr('Chọn ngôn ngữ hiển thị của FOCUSLY trên trình duyệt này.')}
        </p>
      </div>
      <div className="lang-cards" role="radiogroup" aria-label={tr('Ngôn ngữ giao diện')}>
        {options.map((o) => {
          const on = LANG === o.id;
          return (
            <button key={o.id} type="button" role="radio" aria-checked={on} className={`lang-card ${on ? 'on' : ''}`} onClick={() => !on && setLang(o.id)}>
              <span className="lang-code">{o.id.toUpperCase()}</span>
              <span className="grow" style={{ textAlign: 'left' }}>
                <b>{o.name}</b>
                <span className="small muted" style={{ display: 'block' }}>
                  {o.native} · “{o.sample}”
                </span>
              </span>
              {on && <Icon name="check" size={18} />}
            </button>
          );
        })}
      </div>
      <p className="small muted">{tr('Trang sẽ tải lại để áp dụng ngôn ngữ mới.')}</p>
    </div>
  );
}

function SettingsInner() {
  const user = useAuth((s) => s.user);
  const initial = (useSearchParams().get('tab') as Tab) ?? 'profile';
  const [tab, setTab] = useState<Tab>(initial);
  const [fresh, setFresh] = useState<User | null>(null);

  useEffect(() => {
    void get<{ user: User }>('/users/me').then((r) => setFresh(r.user));
  }, [tab]);

  const u = fresh ?? user;
  if (!u) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tr('Cài đặt')}</h1>
          <p className="muted">{tr('Hồ sơ, sở thích học tập, Focus Shield và bảo mật.')}</p>
        </div>
      </div>
      <div className="card">
        <div className="tabs">
          {(
            [
              ['profile', tr('Hồ sơ')],
              ['preferences', tr('Sở thích học tập')],
              ['shield', 'Focus Shield'],
              ['notifications', tr('Thông báo')],
              ['security', tr('Bảo mật')],
              ['language', tr('Ngôn ngữ')],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        {fresh && (
          <>
            {tab === 'profile' && <ProfileTab user={u} />}
            {tab === 'preferences' && <PreferencesTab user={u} />}
            {tab === 'shield' && <ShieldTab user={u} />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'security' && <SecurityTab user={u} />}
            {tab === 'language' && <LanguageTab />}
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
