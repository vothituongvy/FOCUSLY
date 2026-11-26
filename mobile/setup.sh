#!/usr/bin/env bash
# Tạo project React Native CLI (android/ios native) rồi ghép source FOCUSLY vào.
# Chạy 1 lần:  cd mobile && bash setup.sh
set -euo pipefail

APP_NAME="FocuslyMobile"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"

echo "▶ Khởi tạo template React Native CLI + TypeScript..."
(cd "$TMP" && npx --yes @react-native-community/cli@latest init "$APP_NAME" --skip-install --skip-git-init --pm npm)

echo "▶ Ghép native project + config vào mobile/ (không ghi đè source FOCUSLY)..."
for item in android ios package.json tsconfig.json babel.config.js metro.config.js .eslintrc.js .prettierrc.js Gemfile .watchmanconfig jest.config.js __tests__ .bundle .gitignore; do
  if [ -e "$TMP/$APP_NAME/$item" ] && [ ! -e "$HERE/$item" ]; then
    cp -R "$TMP/$APP_NAME/$item" "$HERE/"
  fi
done
rm -rf "$TMP"

cd "$HERE"
echo "▶ Cài thư viện..."
npm install
npm install \
  @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs \
  react-native-screens react-native-safe-area-context react-native-svg \
  zustand socket.io-client \
  @react-native-async-storage/async-storage \
  @react-native-community/netinfo \
  @op-engineering/op-sqlite \
  @react-native-google-signin/google-signin

# Module ghim màn hình (Phiên nghiêm ngặt)
JAVA_DIR=android/app/src/main/java/com/focuslymobile
if [ -d "$JAVA_DIR" ]; then
  cp native-android/*.kt "$JAVA_DIR/"
  grep -q FocusLockPackage "$JAVA_DIR/MainApplication.kt" || \
    sed -i 's/PackageList(this).packages.apply {/PackageList(this).packages.apply {\n              add(FocusLockPackage())/' "$JAVA_DIR/MainApplication.kt"
fi

echo ""
echo "✅ Xong! Tiếp theo:"
echo "   1. Sửa API_URL trong src/config.ts (emulator Android: http://10.0.2.2:4000)"
echo "   2. npm run android"
