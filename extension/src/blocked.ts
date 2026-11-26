export {};

const params = new URLSearchParams(location.search);
const domain = params.get('d') ?? 'website này';
const strict = params.get('strict') === '1';
(document.getElementById('domain') as HTMLElement).textContent = domain;
if (strict) {
  (document.getElementById('title') as HTMLElement).textContent = 'Phiên nghiêm ngặt đang bật';
  (document.getElementById('reason') as HTMLElement).textContent = 'Chỉ FOCUSLY và các trang bạn cho phép mới mở được cho tới khi hết phiên.';
}
// Ghi lại lần cố mở để FOCUSLY đưa vào Nhật ký phân tâm
void chrome.runtime.sendMessage({ type: 'RECORD_ATTEMPT', host: domain });

chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((s: { goal?: string; webUrl?: string; active?: boolean }) => {
  if (s?.goal) (document.getElementById('goal') as HTMLElement).textContent = `Mục tiêu: ${s.goal}`;
  const back = document.getElementById('back') as HTMLAnchorElement;
  back.href = s?.webUrl ? `${s.webUrl}/focus` : 'http://localhost:3000/focus';
  if (s && !s.active) {
    (document.getElementById('hint') as HTMLElement).textContent = 'Phiên học đã kết thúc – bạn có thể mở lại trang.';
  }
});

let n = 4;
const breathe = document.getElementById('breathe') as HTMLElement;
setInterval(() => {
  n = n === 0 ? 4 : n - 1;
  breathe.textContent = n % 2 === 0 ? 'Hít vào…' : 'Thở ra…';
}, 4000);
