# FOCUSLY – Learning & Focus Management Platform

> **Learn with focus. Grow with consistency.**

Monorepo TypeScript cho FOCUSLY (**Phase 1 → Phase 4**): Web (Next.js), Mobile (React Native CLI), Backend (Node.js + Express + MongoDB) và Chrome Extension (Focus Shield).

| Phase | Nội dung |
|---|---|
| 1 – MVP | Auth & Profile · Dashboard · Learning Management · Focus Session · Focus Shield · Distraction Journal · Đồng bộ Web/Mobile |
| 2 – Learning Experience | Focus Recovery (Quick Reset) · Learning Materials · Flashcard + Spaced Repetition · Quiz & Active Recall · Notification (in-app, trình duyệt, FCM) |
| 3 – Smart Learning | AI Learning Assistant (chat theo tài liệu, tóm tắt, giải thích, sinh quiz/flashcard, kế hoạch học) · Analytics & Insights · Focus Intelligence |
| 4 – Optimization & Deployment | Test, CI/CD, Docker, bảo mật, hiệu năng, PWA, phát hành APK, giám sát – xem [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

Lịch sử thay đổi: [CHANGELOG.md](CHANGELOG.md)

## Chi tiết Phase 1

| # | Hạng mục | Backend | Web | Mobile | Extension |
|---|----------|:------:|:---:|:------:|:---------:|
| 1 | Authentication & Profile (đăng ký, đăng nhập, Google, quên/đặt lại mật khẩu, avatar, sở thích học tập, đổi mật khẩu, quản lý phiên đăng nhập) | ✅ | ✅ | ✅ (avatar/đổi MK trên Web) | – |
| 2 | Dashboard cơ bản (thời gian tập trung, nhiệm vụ, Focus Score tham khảo, streak, tiến độ tuần, sắp tới, hoạt động gần đây, Quick Start) | ✅ | ✅ | ✅ | – |
| 3 | Learning Management (môn học, khoá học/chủ đề, mục tiêu, nhiệm vụ, ưu tiên, deadline, trạng thái, lịch, nhiệm vụ lặp lại) | ✅ | ✅ | ✅ | – |
| 4 | Focus Session (start/pause/resume/end, Pomodoro, custom, nghỉ, mục tiêu phiên, lịch sử, tổng kết, **thời gian thực theo server + khôi phục phiên**) | ✅ | ✅ | ✅ (chạy được offline) | – |
| 5 | Focus Shield cơ bản (Focus Mode, Fullscreen, ẩn xao nhãng, Block List, chặn website, nhắc quay lại, Focus Schedule, Device Sync) | ✅ | ✅ | ✅ (phát hiện rời app) | ✅ |
| 6 | Distraction Journal (ghi nhận, nguyên nhân, phân loại, ghi chú, lịch sử, tần suất, xu hướng, gợi ý) | ✅ | ✅ | ✅ | – |
| 7 | Đồng bộ Web/Mobile (REST + Socket.IO realtime, pull/push, offline outbox SQLite, idempotent, xử lý xung đột) | ✅ | ✅ | ✅ | ✅ (poll) |

## Cấu trúc

```
FOCUSLY/
├── backend/     # Node.js + Express + TypeScript + MongoDB (Mongoose) + Socket.IO
├── web/         # Next.js 15 (App Router) + TypeScript + Zustand
├── mobile/      # React Native CLI + TypeScript + React Navigation + Zustand + OP-SQLite
├── extension/   # Chrome Extension Manifest V3 + TypeScript
├── docs/        # API.md, DATABASE.md, ARCHITECTURE.md
├── docker-compose.yml   # MongoDB local
└── render.yaml          # Blueprint deploy backend lên Render
```

## Chạy local (khoảng 10 phút)

Yêu cầu: Node.js ≥ 20, Docker (hoặc MongoDB Atlas), Android Studio (cho mobile).

```bash
# 1) MongoDB
docker compose up -d

# 2) Backend  → http://localhost:4000/api
cd backend
cp .env.example .env
npm install
npm run seed        # tài khoản demo: demo@focusly.app / Focusly123 (kèm tài liệu, flashcard, quiz mẫu)
npm run dev
npm test            # (tuỳ chọn) chạy bộ test

# 3) Web → http://localhost:3000
cd ../web
cp .env.example .env.local
npm install
npm run dev

# 4) Chrome Extension
cd ../extension
npm install && npm run build
# chrome://extensions → bật Developer mode → Load unpacked → chọn extension/dist
# copy Extension ID vào web/.env.local (NEXT_PUBLIC_EXTENSION_ID) rồi khởi động lại web
# Web → Cài đặt → Focus Shield → "Kết nối extension với tài khoản"

# 5) Mobile (Android)
cd ../mobile
bash setup.sh       # tạo native project RN CLI + cài thư viện
npm run android
```

## Deploy miễn phí

| Thành phần | Nền tảng | Cách làm |
|---|---|---|
| Database | MongoDB Atlas (M0) | Tạo cluster free → lấy connection string → `MONGODB_URI` |
| Backend | Render (Free Web Service) | New → Blueprint → chọn repo (dùng `render.yaml`) → điền biến môi trường |
| Web | Vercel (Hobby) | Import repo → Root Directory: `web` → `NEXT_PUBLIC_API_URL=https://<api>.onrender.com` |
| Ảnh avatar | Cloudinary | Điền `CLOUDINARY_*` cho backend (nếu bỏ trống: lưu local, sẽ mất khi Render redeploy) |
| Android | APK / GitHub Releases | `cd mobile/android && ./gradlew assembleRelease` |

Sau khi deploy:
- Backend: `CORS_ORIGINS=https://<web>.vercel.app`, `WEB_URL=https://<web>.vercel.app`, `PUBLIC_API_URL=https://<api>.onrender.com`.
- Extension: thêm domain Vercel vào `externally_connectable.matches` trong `extension/static/manifest.json`.
- Mobile: sửa `PROD_URL` trong `mobile/src/config.ts`.

> ⚠️ Render free sẽ ngủ sau 15 phút không hoạt động (lần gọi đầu chậm ~30–60s). MongoDB Atlas free: 512 MB. Không dùng gói free cho production thật.

## Những quyết định kỹ thuật quan trọng

- **Thời gian thực tế của phiên học** được tính từ các *segment* thời gian (`focus`/`break`) do server ghi lại, không dựa vào đồng hồ UI. Client chỉ hiển thị dựa trên segment + độ lệch giờ server.
- **Khôi phục phiên**: client gửi heartbeat 30s/lần. Nếu mất heartbeat > 3 phút, server tự tạm dừng phiên tại lần heartbeat cuối (thời gian "chết" không bị tính). Nếu thiết bị chỉ mất mạng và sau đó gửi lên các sự kiện có mốc thời gian muộn hơn, server mở lại segment → không mất thời gian học. Phiên bỏ quá 12h tự kết thúc.
- **Offline trên Mobile**: mọi thay đổi ghi vào SQLite + hàng đợi `outbox` với `mutationId` duy nhất; khi có mạng gửi `/sync/push` theo thứ tự (idempotent), rồi `/sync/pull?since=`. Bản ghi tạo offline dùng `clientId`, server hiểu `clientId` ở mọi tham chiếu.
- **Xung đột**: client gửi `baseUpdatedAt` (phiên bản server đã thấy). Nếu bản server mới hơn cả thay đổi của client → giữ bản server, trả `conflict` để client cập nhật.
- **Một phiên học mở tại một thời điểm** trên mọi thiết bị: bắt đầu trên Laptop, mở Mobile vẫn thấy và điều khiển được phiên đó (Socket.IO `session:updated`).
- **Focus Score** chỉ là *điểm tham khảo* với công thức công khai (50% đạt thời gian mục tiêu, 30% hoàn thành nhiệm vụ, 20% ít phân tâm) và hiển thị chi tiết từng thành phần – đúng định hướng "không gộp thành 1 điểm nếu chưa có công thức rõ ràng".
- **Focus Shield** không thể khoá mọi ứng dụng: Web dùng Fullscreen API + Focus Mode + Chrome Extension (declarativeNetRequest); Mobile phase 1 phát hiện khi rời app và ghi vào nhật ký. Chặn app Android (Accessibility/Usage Access) và iOS Screen Time để cho giai đoạn sau.

## Bật tính năng tuỳ chọn

| Tính năng | Biến môi trường backend |
|---|---|
| Trợ lý AI (Phase 3) | `ANTHROPIC_API_KEY`, `AI_MODEL` (mặc định `claude-haiku-5-5`), `AI_MAX_REQUESTS_PER_HOUR` |
| Push notification Mobile | `FIREBASE_SERVICE_ACCOUNT_BASE64` + chạy `mobile/setup-push.sh` |
| Lưu file bền vững | `CLOUDINARY_*` |
| Gửi email đặt lại mật khẩu | `SMTP_*` |

Thiếu các biến này app vẫn chạy: AI trả thông báo "chưa cấu hình", thông báo chỉ hiện in-app, file lưu local, link reset in ra console.

Chạy toàn bộ bằng Docker: `docker compose -f docker-compose.prod.yml up -d --build`

Xem thêm: [docs/API.md](docs/API.md) · [docs/DATABASE.md](docs/DATABASE.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
