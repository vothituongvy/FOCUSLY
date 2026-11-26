#!/usr/bin/env bash
# Bật Push Notification (Firebase Cloud Messaging) cho FOCUSLY Mobile – tuỳ chọn.
# Yêu cầu: tạo app Android trong Firebase Console (package name trong android/app/build.gradle)
#          và tải google-services.json vào android/app/
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f android/app/google-services.json ]; then
  echo "⚠ Thiếu android/app/google-services.json – tải từ Firebase Console trước." >&2
  exit 1
fi

npm install @react-native-firebase/app @react-native-firebase/messaging

# Thêm plugin google-services vào Gradle (nếu chưa có)
if ! grep -q "com.google.gms:google-services" android/build.gradle; then
  sed -i.bak 's/dependencies {/dependencies {\n        classpath("com.google.gms:google-services:4.4.2")/' android/build.gradle
fi
if ! grep -q "com.google.gms.google-services" android/app/build.gradle; then
  echo 'apply plugin: "com.google.gms.google-services"' >> android/app/build.gradle
fi

echo "✅ Đã bật FCM. Backend cần FIREBASE_SERVICE_ACCOUNT_BASE64. Chạy lại: npm run android"
