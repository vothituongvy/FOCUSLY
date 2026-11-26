/**
 * FOCUSLY Focus Shield – service worker (Manifest V3)
 *
 * Hai mức bảo vệ:
 *  - Thường: chặn các website trong Block List.
 *  - NGHIÊM NGẶT: chặn MỌI website trừ FOCUSLY và Allow List, đồng thời KHOÁ TAB:
 *    chuyển sang tab khác sẽ bị kéo về tab học. Mỗi lần cố thoát được ghi lại
 *    để FOCUSLY đưa vào Nhật ký phân tâm.
 *
 * Nguồn trạng thái:
 *  1. Web FOCUSLY gửi SHIELD_ON / SHIELD_OFF (tức thì, biết tab đang học)
 *  2. Poll /api/shield/state mỗi phút bằng extension token (phiên bắt đầu trên Mobile, Focus Schedule)
 *  3. Chặn thủ công từ popup
 */
export {};

interface SourceState {
  active: boolean;
  strict: boolean;
  blockList: string[];
  allowList: string[];
  goal: string;
  sessionId: string;
  at: number;
}

interface Attempt {
  host: string;
  kind: 'site' | 'tab';
  at: number;
}

interface Stored {
  apiUrl?: string;
  webUrl?: string;
  token?: string;
  web?: SourceState;
  remote?: SourceState;
  manual?: { until: number; blockList: string[] };
  focusTabId?: number;
  attempts?: Attempt[];
  lastError?: string;
  lastPollAt?: number;
}

const DEFAULT_BLOCK = ['facebook.com', 'youtube.com', 'tiktok.com', 'instagram.com'];
const ALWAYS_ALLOWED = ['localhost', '127.0.0.1', 'accounts.google.com'];
const POLL_ALARM = 'focusly-poll';
const MANUAL_ALARM = 'focusly-manual-end';
const STRICT_RULE_ID = 9000;

const load = () => chrome.storage.local.get(null) as Promise<Stored>;
const save = (patch: Partial<Stored>) => chrome.storage.local.set(patch);

const hostOf = (url?: string) => {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function effective(s: Stored) {
  const sources = [s.web, s.remote].filter(Boolean) as SourceState[];
  const latest = sources.sort((a, b) => b.at - a.at)[0];
  const manualOn = Boolean(s.manual && s.manual.until > Date.now());
  const domains = new Set<string>();
  if (latest?.active) latest.blockList.forEach((d) => domains.add(d));
  if (manualOn) s.manual!.blockList.forEach((d) => domains.add(d));
  const strict = Boolean(latest?.active && latest.strict);
  const webHost = hostOf(s.webUrl);
  return {
    active: Boolean(latest?.active) || manualOn,
    strict,
    manualOn,
    manualUntil: s.manual?.until ?? 0,
    domains: [...domains],
    allowed: [...new Set([...(latest?.allowList ?? []), ...ALWAYS_ALLOWED, ...(webHost ? [webHost] : []), ...(s.apiUrl ? [hostOf(s.apiUrl)] : [])])].filter(Boolean),
    goal: latest?.active ? latest.goal : manualOn ? 'Chặn thủ công' : '',
    sessionId: latest?.sessionId ?? '',
  };
}

const isAllowed = (host: string, allowed: string[]) => allowed.some((a) => host === a || host.endsWith(`.${a}`));

/** Cập nhật luật declarativeNetRequest */
async function apply(): Promise<void> {
  const s = await load();
  const eff = effective(s);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules: chrome.declarativeNetRequest.Rule[] = [];

  if (eff.strict) {
    // Chặn mọi trang http(s) trừ danh sách cho phép
    addRules.push({
      id: STRICT_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: { regexSubstitution: `${chrome.runtime.getURL('blocked.html')}?strict=1&d=\\1` },
      },
      condition: {
        regexFilter: '^https?://(?:www\\.)?([^/:?#]+)',
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        excludedRequestDomains: eff.allowed,
      },
    });
  } else if (eff.active) {
    eff.domains.forEach((domain, i) =>
      addRules.push({
        id: i + 1,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
          redirect: { extensionPath: `/blocked.html?d=${encodeURIComponent(domain)}` },
        },
        condition: { requestDomains: [domain], resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME] },
      }),
    );
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id), addRules });
  await chrome.action.setBadgeText({ text: eff.strict ? 'LOCK' : eff.active ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: eff.strict ? '#b8402f' : '#16203a' });
}

async function recordAttempt(host: string, kind: Attempt['kind']) {
  const s = await load();
  const list = s.attempts ?? [];
  const last = list[list.length - 1];
  // gộp các lần liên tiếp cùng trang trong 15 giây
  if (last && last.host === host && Date.now() - last.at < 15_000) return;
  await save({ attempts: [...list, { host, kind, at: Date.now() }].slice(-200) });
}

/* ---------- KHOÁ TAB trong phiên nghiêm ngặt ---------- */
let pulling = false;
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (pulling) return;
  const s = await load();
  const eff = effective(s);
  if (!eff.strict || !s.focusTabId || tabId === s.focusTabId) return;
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  const host = hostOf(tab.url ?? tab.pendingUrl);
  if (host && isAllowed(host, eff.allowed)) return; // tab tài liệu được phép
  try {
    pulling = true;
    const focusTab = await chrome.tabs.update(s.focusTabId, { active: true });
    if (focusTab?.windowId !== undefined) await chrome.windows.update(focusTab.windowId, { focused: true });
    await recordAttempt(host || 'tab mới', 'tab');
  } catch {
    // tab học đã bị đóng: bỏ khoá tab, vẫn giữ chặn website
    await save({ focusTabId: undefined });
  } finally {
    setTimeout(() => (pulling = false), 300);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await load();
  if (s.focusTabId === tabId) await chrome.storage.local.remove('focusTabId');
});

/* ---------- Đồng bộ với máy chủ ---------- */
async function poll(): Promise<void> {
  const s = await load();
  if (!s.apiUrl || !s.token) return;
  try {
    const res = await fetch(`${s.apiUrl.replace(/\/$/, '')}/api/shield/state`, { headers: { Authorization: `Bearer ${s.token}` } });
    if (res.status === 401) {
      await save({ lastError: 'Token hết hạn – hãy kết nối lại từ trang Cài đặt FOCUSLY', lastPollAt: Date.now() });
      return;
    }
    const data = await res.json();
    await save({
      remote: {
        active: Boolean(data.active),
        strict: Boolean(data.strict),
        blockList: data.blockList ?? [],
        allowList: data.allowList ?? [],
        goal: data.session?.goal ?? (data.reason === 'schedule' ? 'Khung giờ tập trung' : ''),
        sessionId: data.session?.id ?? '',
        at: Date.now(),
      },
      lastError: '',
      lastPollAt: Date.now(),
    });
    await apply();
  } catch {
    await save({ lastError: 'Không kết nối được máy chủ', lastPollAt: Date.now() });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  void apply();
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  void poll();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) void poll();
  if (alarm.name === MANUAL_ALARM) void apply();
});

type Msg =
  | { type: 'PING' }
  | { type: 'CONNECT'; apiUrl: string; token: string }
  | { type: 'SHIELD_ON'; blockList: string[]; allowList?: string[]; strict?: boolean; goal?: string; sessionId?: string }
  | { type: 'SHIELD_OFF' }
  | { type: 'GET_STATE' }
  | { type: 'GET_ATTEMPTS' }
  | { type: 'RECORD_ATTEMPT'; host: string }
  | { type: 'MANUAL_START'; minutes: number }
  | { type: 'MANUAL_STOP' }
  | { type: 'DISCONNECT' }
  | { type: 'POLL' };

async function handle(msg: Msg, sender?: chrome.runtime.MessageSender): Promise<unknown> {
  const senderOrigin = sender?.origin;
  switch (msg.type) {
    case 'PING':
      return { ok: true, version: chrome.runtime.getManifest().version, strictSupport: true };
    case 'CONNECT':
      await save({ apiUrl: msg.apiUrl, token: msg.token, webUrl: senderOrigin, lastError: '' });
      await poll();
      return { ok: true };
    case 'SHIELD_ON':
      await save({
        web: {
          active: true,
          strict: Boolean(msg.strict),
          blockList: msg.blockList ?? [],
          allowList: msg.allowList ?? [],
          goal: msg.goal ?? '',
          sessionId: msg.sessionId ?? '',
          at: Date.now(),
        },
        ...(senderOrigin ? { webUrl: senderOrigin } : {}),
        ...(sender?.tab?.id !== undefined ? { focusTabId: sender.tab.id } : {}),
      });
      await apply();
      return { ok: true, strict: Boolean(msg.strict) };
    case 'SHIELD_OFF':
      await save({ web: { active: false, strict: false, blockList: [], allowList: [], goal: '', sessionId: '', at: Date.now() } });
      await chrome.storage.local.remove('focusTabId');
      await apply();
      return { ok: true };
    case 'GET_STATE': {
      const s = await load();
      return { ...effective(s), connected: Boolean(s.token), apiUrl: s.apiUrl, webUrl: s.webUrl, lastError: s.lastError, lastPollAt: s.lastPollAt, attempts: (s.attempts ?? []).length };
    }
    case 'GET_ATTEMPTS': {
      // Web lấy các lần cố thoát để ghi vào Nhật ký phân tâm, rồi xoá
      const s = await load();
      await save({ attempts: [] });
      return { ok: true, attempts: s.attempts ?? [] };
    }
    case 'RECORD_ATTEMPT': {
      const s = await load();
      if (effective(s).active) await recordAttempt(msg.host, 'site');
      return { ok: true };
    }
    case 'MANUAL_START': {
      const s = await load();
      const blockList = s.remote?.blockList?.length ? s.remote.blockList : s.web?.blockList?.length ? s.web.blockList : DEFAULT_BLOCK;
      const until = Date.now() + msg.minutes * 60_000;
      await save({ manual: { until, blockList } });
      await chrome.alarms.create(MANUAL_ALARM, { when: until + 500 });
      await apply();
      return { ok: true };
    }
    case 'MANUAL_STOP':
      await chrome.storage.local.remove('manual');
      await apply();
      return { ok: true };
    case 'DISCONNECT':
      await chrome.storage.local.remove(['token', 'apiUrl', 'remote']);
      await apply();
      return { ok: true };
    case 'POLL':
      await poll();
      return { ok: true };
    default:
      return { ok: false, error: 'unknown message' };
  }
}

chrome.runtime.onMessageExternal.addListener((msg: Msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
  // Tin nhắn nội bộ (popup, trang chặn) không được đặt tab học
  handle(msg.type === 'SHIELD_ON' ? { ...msg } : msg, msg.type === 'SHIELD_ON' ? undefined : sender).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
