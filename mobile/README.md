# FOCUSLY Mobile – React Native CLI + TypeScript

Android trước, iOS sau. React Navigation · Zustand · OP-SQLite (offline) · NetInfo · Socket.IO · Google Sign-In.

## Cài đặt lần đầu

```bash
cd mobile
bash setup.sh      # tạo android/ & ios/ bằng @react-native-community/cli và cài thư viện
npm run android    # cần Android Studio + emulator hoặc điện thoại bật USB debugging
```

`setup.sh` không ghi đè `App.tsx`, `index.js`, `app.json`, `src/`.

## Cấu hình

`src/config.ts`
- `API_URL`: emulator dùng `http://10.0.2.2:4000`; điện thoại thật dùng `http://<IP-máy-tính>:4000`.
- `GOOGLE_WEB_CLIENT_ID`: OAuth Client ID loại *Web application* (đồng thời thêm vào `GOOGLE_CLIENT_IDS` của backend). Cần tạo thêm Client ID *Android* với SHA-1 của keystore trong Google Cloud Console.

## Màn hình

| Tab | Chức năng |
|---|---|
| Tổng quan | thời gian tập trung, nhiệm vụ, Focus Score (tham khảo), streak, tuần, sắp tới, Quick Start |
| Kế hoạch | môn học (giữ để sửa), lọc, nhiệm vụ (tạo/sửa/xoá, ưu tiên, deadline, lặp lại) |
| Tập trung | quy trình 5 bước → Pomodoro/Custom/Free, pause/resume/nghỉ/kết thúc, Focus Mode, phát hiện rời app, ghi nhận phân tâm, tổng kết |
| Ôn tập | flashcard (Spaced Repetition, ôn offline), làm quiz offline – server chấm lại khi đồng bộ |
| Cá nhân | menu Phân tích · Nhật ký phân tâm · Tài liệu · Trợ lý AI · Thông báo; hồ sơ, đồng bộ, Block List, đăng xuất |

Trong phiên học: **🌬️ Quick Reset** (Focus Recovery) mở sau khi ghi nhận phân tâm hoặc khi quay lại app.

## Push notification (tuỳ chọn)

1. Tạo app Android trong Firebase Console, tải `google-services.json` vào `android/app/`.
2. `bash setup-push.sh`
3. Backend đặt `FIREBASE_SERVICE_ACCOUNT_BASE64`.

Chưa bật thì app vẫn có thông báo in-app (màn Thông báo).

## Offline

Mọi thay đổi (kể cả thao tác phiên học) ghi vào SQLite + `outbox`. Thanh trạng thái phía trên cho biết số thay đổi chờ đồng bộ. Khi có mạng: push → pull tự động.

## Build APK

```bash
cd android && ./gradlew assembleRelease
# app/build/outputs/apk/release/app-release.apk → đính kèm GitHub Releases
```
