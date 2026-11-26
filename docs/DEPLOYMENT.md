# Phase 4 – Triển khai, vận hành & phát hành

## 1. Kiểm thử

```bash
cd backend
npm test            # Vitest: SM-2, chấm quiz, múi giờ, bảo mật, AI helpers + test tích hợp API (MongoDB in-memory)
npm run typecheck
cd ../web && npm run typecheck && npm run build
```
Lần đầu chạy test tích hợp, `mongodb-memory-server` tải binary MongoDB (~100 MB).

## 2. CI/CD (GitHub Actions)

> Workflow nằm ở `ci/github-workflows/`. Khi đưa lên GitHub, chép vào `.github/workflows/`:
> `mkdir -p .github/workflows && cp ci/github-workflows/*.yml .github/workflows/`

- `.github/workflows/ci.yml`: mỗi push/PR → typecheck + test backend, build web, build extension (artifact), build Docker image.
- `.github/workflows/android-release.yml`: push tag `v2.0.0` → build APK release → đính kèm GitHub Release.
  - Cần commit `mobile/android` (sau khi chạy `mobile/setup.sh`).
  - Ký APK: thêm secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` và cấu hình `signingConfigs.release` trong `android/app/build.gradle`:

```gradle
signingConfigs {
    release {
        if (project.hasProperty('FOCUSLY_UPLOAD_STORE_FILE')) {
            storeFile file(FOCUSLY_UPLOAD_STORE_FILE)
            storePassword FOCUSLY_UPLOAD_STORE_PASSWORD
            keyAlias FOCUSLY_UPLOAD_KEY_ALIAS
            keyPassword FOCUSLY_UPLOAD_KEY_PASSWORD
        }
    }
}
buildTypes { release { signingConfig signingConfigs.release; minifyEnabled true } }
```

Tạo keystore: `keytool -genkeypair -v -keystore release.keystore -alias focusly -keyalg RSA -keysize 2048 -validity 10000`

## 3. Docker

```bash
cp backend/.env.example backend/.env    # điền secrets
docker compose -f docker-compose.prod.yml up -d --build
# Web http://localhost:3000 · API http://localhost:4000/health
```
Image backend multi-stage, chạy user không phải root, có HEALTHCHECK. Web build `output: standalone`.

## 4. Deploy miễn phí (Vercel + Render + Atlas)

| Bước | Việc cần làm |
|---|---|
| Atlas | Tạo cluster M0 → Network Access `0.0.0.0/0` (Render không có IP tĩnh) → user DB → copy URI |
| Render | New → Blueprint → chọn repo (`render.yaml`). Điền `MONGODB_URI`, `CORS_ORIGINS`, `WEB_URL`, `PUBLIC_API_URL`, tuỳ chọn `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_BASE64`, `CLOUDINARY_*`, `SMTP_*`. Build tự chạy `npm run db:indexes` |
| Vercel | Import repo, Root Directory `web`, env `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_EXTENSION_ID` |
| Cloudinary | **Nên bật** – Render free không lưu file lâu dài (file trong `uploads/` mất khi redeploy) |
| Firebase | Project → Cloud Messaging → Service account → JSON → `base64 -w0 sa.json` → `FIREBASE_SERVICE_ACCOUNT_BASE64` |
| Anthropic | Tạo API key → `ANTHROPIC_API_KEY`. AI **có tính phí theo token** – giữ `AI_MAX_REQUESTS_PER_HOUR` thấp |

## 5. Giám sát

- `GET /health` → `{ ok, db, uptimeSeconds, features: { ai, push, scheduler } }`, trả 503 khi mất DB.
- Mỗi request có `X-Request-Id` (log production dạng `:rid :method :url :status`).
- Dùng UptimeRobot/BetterStack ping `/health` mỗi 5–10 phút: vừa giám sát, vừa giữ Render free không ngủ (nhờ vậy bộ nhắc lịch chạy đúng giờ). Lưu ý giới hạn 750 giờ/tháng của Render free.

## 6. Bảo mật đã áp dụng

- JWT access 15 phút + refresh token xoay vòng, lưu băm SHA-256, thu hồi theo thiết bị.
- bcrypt (cost 12), rate limit (auth 50/15 phút, API 300/phút, AI theo giờ).
- Helmet, CORS whitelist, chống NoSQL injection (loại key `$`/`.`), giới hạn kích thước body/file, kiểm tra MIME upload.
- Zod validate mọi input; lỗi trả định dạng thống nhất, không lộ stack trace.
- Extension dùng token phạm vi `shield:read` riêng.
- Web: security headers (HSTS, nosniff, frame options, permissions policy).

## 7. Hiệu năng

- `compression`, cache tĩnh `/uploads` 7 ngày, index MongoDB cho mọi truy vấn chính (`{user, updatedAt}`, `{user, srs.due}`, text index tài liệu…), `autoIndex` tắt ở production.
- Dashboard/analytics dùng `lean()` và lọc theo khoảng thời gian; sync pull phân trang 2000 bản ghi/collection.
- Web PWA: Service Worker cache-first cho asset `_next/static`, network-first cho trang, trang offline.

## 8. Checklist phát hành

- [ ] `npm test` xanh, CI xanh
- [ ] Đổi `JWT_*` secrets production (Render generateValue)
- [ ] `CORS_ORIGINS` = domain Vercel; domain Vercel trong `extension/static/manifest.json`
- [ ] `mobile/src/config.ts` → `PROD_URL`, `GOOGLE_WEB_CLIENT_ID`
- [ ] Bật Cloudinary
- [ ] Tăng `version` (backend/web/extension/mobile `android/app/build.gradle` versionCode) + cập nhật `CHANGELOG.md`
- [ ] Tag `vX.Y.Z` → APK tự đính kèm Release; thêm link tải vào README
