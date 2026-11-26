# Kiến trúc FOCUSLY

```
             ┌───────────── Web (Next.js – Vercel) ─────────────┐
             │ Dashboard · Plan/Calendar · Focus · Journal · Settings
             │      │ REST (fetch + refresh token)   ▲ Socket.IO
             │      ▼                                │
 Chrome  ◄───┤ externally_connectable (SHIELD_ON/OFF)│
 Extension   └──────┼────────────────────────────────┼──────────┘
 (MV3, DNR)         │                                │
   │ poll /shield/state (extension token)            │
   ▼                ▼                                │
 ┌──────────── Backend: Node.js + Express + TS (Render) ───────────┐
 │ auth · users · subjects/courses/goals/tasks · sessions · shield │
 │ distractions · dashboard · sync(pull/push) · Socket.IO rooms    │
 └──────────────┬──────────────────────────────┬───────────────────┘
                ▼                              ▼
        MongoDB Atlas                   Cloudinary (avatar)
                ▲
                │ REST /sync + Socket.IO
 ┌──────────── Mobile (React Native CLI – Android APK) ─────────────┐
 │ Screens ⇄ Zustand stores ⇄ SQLite (records, outbox, kv)          │
 │ NetInfo: có mạng → push outbox → pull since → cập nhật UI        │
 └──────────────────────────────────────────────────────────────────┘
```

## Luồng phiên học đa thiết bị

1. Laptop: `POST /sessions` → server tạo segment focus, phát `session:updated` tới phòng `user:<id>`.
2. Mobile (đang mở) nhận socket → hiển thị cùng phiên, điều khiển được (pause/resume/end).
3. Chrome Extension: Web gửi `SHIELD_ON` ngay; nếu phiên bắt đầu trên Mobile, Web (nếu mở) nhận socket và gửi `SHIELD_ON`, còn không thì extension tự poll `/shield/state` mỗi phút.
4. Mobile mất mạng: hành động được áp dụng cục bộ + xếp hàng kèm `at`. Có mạng lại → `/sync/push` theo thứ tự → server tính lại thời gian thật.
5. App bị đóng: không còn heartbeat → sau 3 phút server tự tạm dừng tại heartbeat cuối; mở lại app → `GET /sessions/active` → hiển thị "đã tự tạm dừng", người dùng tiếp tục.

## Lộ trình đã triển khai

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 1 – MVP | Auth & Profile, Dashboard, Learning Management, Focus Session, Focus Shield cơ bản, Distraction Journal, Đồng bộ Web/Mobile | ✅ |
| 2 – Learning Experience | Focus Recovery (Quick Reset), Learning Materials, Flashcard, Quiz & Active Recall, Spaced Repetition, Notification (in-app + FCM + bộ nhắc) | ✅ |
| 3 – Smart Learning | AI Chat (RAG tài liệu), Tóm tắt, Giải thích, Sinh quiz/flashcard (bản nháp), Gợi ý & kế hoạch học, Analytics & Insights, Focus Intelligence | ✅ |
| 4 – Optimization & Deployment | Test (Vitest + Supertest + MongoDB in-memory), CI GitHub Actions, Docker, bảo mật, hiệu năng, PWA, phát hành APK & giám sát | ✅ |

## Nguyên tắc AI

- AI chỉ đưa **gợi ý**: quiz, flashcard, kế hoạch đều là bản nháp; người học xem – sửa – chọn trước khi lưu.
- Ngữ cảnh tài liệu được cắt theo đoạn liên quan (RAG đơn giản theo từ khoá) để tiết kiệm token.
- Giới hạn lượt dùng mỗi giờ, ghi log token (`aiusages`). Thiếu API key → tính năng AI tắt, phần còn lại vẫn chạy.

## Còn để ngỏ

- Chặn ứng dụng khác trên Android (Accessibility/UsageStats native module) và iOS Screen Time (FamilyControls) – cần native code & quyền đặc biệt của Apple.
- Highlight trực tiếp trên PDF (hiện dùng trình xem PDF của trình duyệt + ghi chú theo trang; highlight trực tiếp cho tài liệu văn bản).
- OCR cho PDF scan / ảnh.
