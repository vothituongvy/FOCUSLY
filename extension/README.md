# FOCUSLY Focus Shield – Chrome Extension

Manifest V3 + TypeScript. Chặn website trong Block List bằng `declarativeNetRequest` khi phiên học đang chạy.

## Build & cài

```bash
npm install
npm run build          # -> dist/
```
1. Mở `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn `extension/dist`.
2. Copy **ID** của extension → đặt vào `web/.env.local`: `NEXT_PUBLIC_EXTENSION_ID=<id>` → khởi động lại web.
3. Web → **Cài đặt › Focus Shield › Kết nối extension với tài khoản** (cấp token chỉ-đọc 90 ngày).

## Hoạt động

- Web gửi `SHIELD_ON/OFF` tức thì khi bắt đầu/kết thúc phiên.
- Extension poll `GET /api/shield/state` mỗi phút → phiên bắt đầu trên **Mobile** hoặc **Focus Schedule** cũng kích hoạt chặn.
- Popup: xem trạng thái, "Chặn ngay 25/45/60 phút" thủ công.
- Trang bị chặn hiển thị mục tiêu phiên + bài hít thở ngắn + nút quay lại phiên học.

## Deploy

Thêm domain web production vào `static/manifest.json` → `externally_connectable.matches`, ví dụ `"https://focusly-yourname.vercel.app/*"`, rồi build lại.
