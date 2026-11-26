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

type Tab = 'profile' | 'preferences' | 'shield' | 'notifications' | 'security';

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
      setMsg('Đã lưu ✓');
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
      setMsg('Đã cập nhật ảnh đại diện ✓');
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
              Tải ảnh lên
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
                Xoá ảnh
              </button>
            )}
          </div>
          <span className="small muted">JPG, PNG, WEBP · tối đa 2MB</span>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </div>
      <label className="field">
        Họ tên
        <input required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Email
        <input value={user.email} disabled />
      </label>
      <div className="row">
        <button className="btn">Lưu</button>
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
      setMsg('Đã lưu ✓');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form className="form" onSubmit={save} style={{ maxWidth: 640 }}>
      <label className="field">
        Mục tiêu học tập
        <textarea value={p.learningGoal} onChange={(e) => setP({ ...p, learningGoal: e.target.value })} placeholder="VD: Trở thành React Native Developer trong 6 tháng" />
      </label>
      <label className="field">
        Môn học quan tâm (phân tách bằng dấu phẩy)
        <input value={subjectsText} onChange={(e) => setSubjectsText(e.target.value)} placeholder="React Native, Tiếng Anh, Toán" />
      </label>
      <div className="field">
        Khung giờ học mong muốn
        {p.preferredStudyTimes.map((t, i) => (
          <div className="row" key={i}>
            <input
              type="time"
              value={t.start}
              onChange={(e) => setP({ ...p, preferredStudyTimes: p.preferredStudyTimes.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })}
            />
            <span className="muted small">đến</span>
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
          + Thêm khung giờ
        </button>
      </div>
      <div className="grid grid-2">
        <label className="field">
          Thời lượng học mục tiêu mỗi ngày (phút)
          <input type="number" min={0} max={1440} value={p.dailyTargetMinutes} onChange={(e) => setP({ ...p, dailyTargetMinutes: Number(e.target.value) })} />
        </label>
        <label className="field">
          Ngôn ngữ
          <select value={p.language} onChange={(e) => setP({ ...p, language: e.target.value as 'vi' | 'en' })}>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          Múi giờ
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
        Pomodoro mặc định
        <div className="grid grid-4">
          {(
            [
              ['focusMinutes', 'Tập trung'],
              ['breakMinutes', 'Nghỉ ngắn'],
              ['longBreakMinutes', 'Nghỉ dài'],
              ['cyclesBeforeLongBreak', 'Số vòng'],
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
        <button className="btn">Lưu</button>
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
      setMsg('Đã lưu ✓');
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
            <b>Tự bật Focus Shield khi bắt đầu phiên</b>
            <p className="small muted">Có thể tắt riêng cho từng phiên.</p>
          </div>
          <Toggle on={autoEnable} onChange={setAutoEnable} />
        </div>
        <div className="row between">
          <div>
            <b>Mặc định dùng Phiên nghiêm ngặt</b>
            <p className="small muted">Khoá tab, chỉ mở trang được phép, đồng hồ dừng khi bạn rời FOCUSLY.</p>
          </div>
          <Toggle on={strictDefault} onChange={setStrictDefault} />
        </div>
        <div className="row between">
          <div>
            <b>Ẩn thành phần gây xao nhãng (Focus Mode)</b>
            <p className="small muted">Che sidebar, thông báo, chỉ hiển thị đồng hồ và mục tiêu.</p>
          </div>
          <Toggle on={hide} onChange={setHide} />
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>Block List – website gây phân tâm</h3>
        <div className="row">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="vd: facebook.com" />
          <button type="button" className="btn secondary" onClick={add}>
            Thêm
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
          {blockList.length === 0 && <span className="small muted">Chưa có website nào.</span>}
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>Trang được phép trong Phiên nghiêm ngặt</h3>
        <p className="small muted">Ngoài FOCUSLY, chỉ những trang này mở được khi phiên nghiêm ngặt đang chạy. Thêm tài liệu bạn cần, ví dụ react.dev.</p>
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
            placeholder="vd: developer.mozilla.org"
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
            Cho phép
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
          {allowList.length === 0 && <span className="small muted">Chỉ FOCUSLY được mở trong phiên nghiêm ngặt.</span>}
        </div>
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>Focus Schedule – khung giờ tự bật chặn website</h3>
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
            <span className="muted small">đến</span>
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
          + Thêm khung giờ
        </button>
      </div>

      <div className="row">
        <button className="btn" onClick={save}>
          Lưu cấu hình Shield
        </button>
        <Saved msg={msg} error={error} />
      </div>

      <div className="card col" style={{ boxShadow: 'none' }}>
        <h3>Chrome Extension</h3>
        <p className="small muted">
          Extension chặn các website trong Block List khi phiên học đang chạy – kể cả khi bạn bắt đầu phiên trên điện thoại (Device Sync).
        </p>
        {!hasExtensionConfig() ? (
          <p className="small">Chưa cấu hình NEXT_PUBLIC_EXTENSION_ID. Xem hướng dẫn trong extension/README.md.</p>
        ) : ext === 'missing' ? (
          <p className="small">Chưa phát hiện extension. Cài extension (Load unpacked) rồi tải lại trang.</p>
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
              {ext === 'connected' ? '✓ Đã kết nối – kết nối lại' : 'Kết nối extension với tài khoản'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
    ['studyReminder', 'Nhắc lịch học', 'Theo khung giờ học mong muốn trong Sở thích học tập'],
    ['taskReminder', 'Nhắc nhiệm vụ sắp đến hạn', ''],
    ['breakReminder', 'Nhắc nghỉ giữa phiên', 'Khi hết thời gian Pomodoro'],
    ['dailySummary', 'Tổng kết cuối ngày', ''],
    ['reviewReminder', 'Nhắc ôn flashcard đến hạn', 'Lúc 8:00 nếu có ≥ 5 thẻ'],
    ['push', 'Gửi thông báo đẩy đến điện thoại', pushAvailable ? '' : 'Máy chủ chưa cấu hình Firebase (FCM)'],
  ];
  const save = async (next: NotificationSettings) => {
    setS(next);
    await put('/notifications/settings', next);
    setMsg('Đã lưu ✓');
  };
  return (
    <div className="col" style={{ maxWidth: 640, gap: 14 }}>
      <div className="card row between" style={{ boxShadow: 'none' }}>
        <div>
          <b>Thông báo trình duyệt</b>
          <p className="small muted">Trạng thái: {perm === 'granted' ? 'đã cho phép' : perm === 'denied' ? 'đã chặn (mở lại trong cài đặt trình duyệt)' : 'chưa cấp quyền'}</p>
        </div>
        {perm === 'default' && (
          <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>
            Cho phép
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
          Nhắc nhiệm vụ trước (phút)
          <input type="number" min={5} max={1440} value={s.taskReminderMinutes} onChange={(e) => setS({ ...s, taskReminderMinutes: Number(e.target.value) })} onBlur={() => save(s)} />
        </label>
        <label className="field">
          Giờ tổng kết ngày
          <input type="time" value={s.dailySummaryTime} onChange={(e) => save({ ...s, dailySummaryTime: e.target.value })} />
        </label>
        <label className="field">
          Giờ yên lặng – bắt đầu
          <input type="time" value={s.quietStart} onChange={(e) => save({ ...s, quietStart: e.target.value })} />
        </label>
        <label className="field">
          Giờ yên lặng – kết thúc
          <input type="time" value={s.quietEnd} onChange={(e) => save({ ...s, quietEnd: e.target.value })} />
        </label>
      </div>
      <div className="row">
        <button className="btn secondary sm" onClick={() => post('/notifications/test').then(() => setMsg('Đã gửi thông báo thử'))}>
          Gửi thông báo thử
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
      setMsg('Đổi mật khẩu thành công. Các thiết bị khác đã bị đăng xuất.');
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
        <h3>{user.hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu (tài khoản Google)'}</h3>
        {user.hasPassword && (
          <label className="field">
            Mật khẩu hiện tại
            <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="field">
          Mật khẩu mới (≥ 8 ký tự, có chữ và số)
          <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn">Cập nhật</button>
          <Saved msg={msg} error={error} />
        </div>
      </form>

      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <h3>Phiên đăng nhập</h3>
          <button
            className="btn sm secondary"
            onClick={async () => {
              await del('/users/me/sessions');
              void sessions.reload();
            }}
          >
            Đăng xuất thiết bị khác
          </button>
        </div>
        <div className="list">
          {sessions.data?.sessions.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {s.platform} {s.current && <span className="badge done">Thiết bị này</span>}
                </div>
                <div className="small muted truncate">
                  {s.userAgent || 'Không rõ'} · {s.ip} · hoạt động {fmtRelative(s.lastUsedAt)}
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
                  Đăng xuất
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
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
          <h1>Cài đặt</h1>
          <p className="muted">Hồ sơ, sở thích học tập, Focus Shield và bảo mật.</p>
        </div>
      </div>
      <div className="card">
        <div className="tabs">
          {(
            [
              ['profile', 'Hồ sơ'],
              ['preferences', 'Sở thích học tập'],
              ['shield', 'Focus Shield'],
              ['notifications', 'Thông báo'],
              ['security', 'Bảo mật'],
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
