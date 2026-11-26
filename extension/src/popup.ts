export {};

interface PopupState {
  active: boolean;
  strict: boolean;
  attempts: number;
  manualOn: boolean;
  manualUntil: number;
  domains: string[];
  goal: string;
  connected: boolean;
  apiUrl?: string;
  webUrl?: string;
  lastError?: string;
  lastPollAt?: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(msg: Record<string, unknown>) => chrome.runtime.sendMessage(msg) as Promise<T>;

async function render() {
  const s = await send<PopupState>({ type: 'GET_STATE' });
  $('status').textContent = s.strict
    ? `Phiên nghiêm ngặt: khoá tab, chỉ mở trang được phép${s.attempts ? ` (${s.attempts} lần cố thoát)` : ''}`
    : s.active
      ? 'Đang bật: các trang trong Block List bị chặn'
      : 'Đang tắt';
  $('status').className = `status ${s.active ? 'on' : ''}`;
  $('goal').textContent = s.goal ? `Mục tiêu: ${s.goal}` : '';
  $('domains').innerHTML = s.active
    ? (s.strict ? [] : s.domains).map((d) => `<span class="chip">${d.replace(/[<>&]/g, '')}</span>`).join('')
    : '<span class="muted">Shield tự bật khi bạn bắt đầu phiên học trên FOCUSLY (Web hoặc Mobile).</span>';
  $('connection').textContent = s.connected
    ? `Đã kết nối tài khoản${s.lastPollAt ? ` · cập nhật ${new Date(s.lastPollAt).toLocaleTimeString('vi-VN')}` : ''}`
    : 'Chưa kết nối – mở FOCUSLY › Cài đặt › Focus Shield › Kết nối extension';
  $('error').textContent = s.lastError ?? '';
  $<HTMLButtonElement>('manual-start').hidden = s.manualOn;
  $<HTMLButtonElement>('manual-stop').hidden = !s.manualOn;
  $('manual-info').textContent = s.manualOn ? `Chặn thủ công đến ${new Date(s.manualUntil).toLocaleTimeString('vi-VN')}` : '';
  const open = $<HTMLAnchorElement>('open-web');
  open.href = s.webUrl ?? 'http://localhost:3000';
}

$('manual-start').addEventListener('click', async () => {
  await send({ type: 'MANUAL_START', minutes: Number($<HTMLSelectElement>('minutes').value) || 25 });
  void render();
});
$('manual-stop').addEventListener('click', async () => {
  await send({ type: 'MANUAL_STOP' });
  void render();
});
$('refresh').addEventListener('click', async () => {
  await send({ type: 'POLL' });
  void render();
});

void render();
