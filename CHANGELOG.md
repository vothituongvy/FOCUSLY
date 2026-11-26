# Changelog

## [2.0.0] – 2026-11-25

### Phase 2 – Learning Experience
- **Focus Recovery**: Quick Reset (hít thở 4-4-4-4, nhắc lại mục tiêu, nghỉ ngắn / tiếp tục / kết thúc), tự mở sau khi ghi nhận phân tâm hoặc rời app, lưu lịch sử.
- **Learning Materials**: tải PDF/ảnh/TXT/DOCX (Cloudinary hoặc local), link & ghi chú văn bản, trích văn bản PDF, tìm kiếm cả nội dung, phân loại, đánh dấu, ghi chú/highlight/bookmark trang, xem gần đây, tiến độ đọc, trình xem PDF trên Web.
- **Flashcard + Spaced Repetition (SM-2)**: bộ thẻ, ôn với phím tắt, xem trước khoảng cách ôn, tạm ẩn thẻ, ôn offline trên Mobile.
- **Quiz & Active Recall**: trắc nghiệm, đúng/sai, trả lời ngắn (chấm không phân biệt dấu, chịu lỗi gõ nhỏ), kết quả & giải thích, ôn câu sai → flashcard, tiến bộ qua các lần làm, bước "Kiểm tra kiến thức" sau phiên học.
- **Notification**: in-app realtime, thông báo trình duyệt, FCM push (tuỳ chọn), nhắc lịch học / nhiệm vụ / nghỉ / tổng kết ngày / thẻ đến hạn, giờ yên lặng, cài đặt từng loại.

### Phase 3 – Smart Learning
- **AI Learning Assistant** (Claude API): hỏi đáp theo tài liệu (RAG), tóm tắt, giải thích khái niệm, sinh quiz/flashcard dạng bản nháp, phản hồi Active Recall, gợi ý phương pháp + kế hoạch 7 ngày (chọn để tạo nhiệm vụ), phân tích kết quả.
- **Analytics & Insights**: báo cáo ngày/tuần/tháng, so sánh kỳ trước, dự kiến vs thực tế, tỷ lệ hoàn thành, phân tích phân tâm, hiệu quả theo môn, kết quả kiểm tra, khung giờ hiệu quả, xuất CSV.
- **Focus Intelligence**: gợi ý tự động không cần AI (khung giờ vàng, độ dài phiên phù hợp, tính đều đặn, môn bị bỏ quên, quá hạn, môn yếu, tỷ lệ quay lại sau gián đoạn…).

### Phase 4 – Optimization & Deployment
- Vitest + Supertest + MongoDB in-memory, CI GitHub Actions, workflow phát hành APK.
- Docker (backend, web standalone) + `docker-compose.prod.yml`.
- Request ID, chống NoSQL injection, rate limit toàn API, compression, `/health` chi tiết, script đồng bộ index.
- Web PWA (manifest, service worker, trang offline), error boundary, 404, security headers.

## [1.0.0] – 2026-11-25
- Phase 1 – MVP: Auth & Profile, Dashboard, Learning Management, Focus Session, Focus Shield cơ bản + Chrome Extension, Distraction Journal, đồng bộ Web/Mobile (offline-first).
