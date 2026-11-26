# Tạo project React Native CLI (android/ios native) rồi ghép source FOCUSLY vào.
# Chạy 1 lần trong PowerShell:
#   cd D:\FOCUSLY\FOCUSLY\mobile
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = 'Stop'

$AppName = 'FocuslyMobile'
$Here = $PSScriptRoot
$Tmp = Join-Path $env:TEMP ("focusly-rn-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null

Write-Host "▶ Khởi tạo template React Native CLI + TypeScript (vài phút)..." -ForegroundColor Cyan
Push-Location $Tmp
try {
  npx --yes @react-native-community/cli@latest init $AppName --skip-install --skip-git-init --pm npm
  if ($LASTEXITCODE -ne 0) { throw "Khởi tạo React Native thất bại (mã $LASTEXITCODE)" }
} finally {
  Pop-Location
}

Write-Host "▶ Ghép native project + config vào mobile\ (không ghi đè source FOCUSLY)..." -ForegroundColor Cyan
$items = @('android', 'ios', 'package.json', 'tsconfig.json', 'babel.config.js', 'metro.config.js',
           '.eslintrc.js', '.prettierrc.js', 'Gemfile', '.watchmanconfig', 'jest.config.js',
           '__tests__', '.bundle', '.gitignore')
foreach ($item in $items) {
  $src = Join-Path (Join-Path $Tmp $AppName) $item
  $dst = Join-Path $Here $item
  if ((Test-Path $src) -and -not (Test-Path $dst)) {
    Copy-Item -Path $src -Destination $dst -Recurse
    Write-Host "  + $item"
  }
}
Remove-Item -Path $Tmp -Recurse -Force -ErrorAction SilentlyContinue

Set-Location $Here
Write-Host "▶ Cài thư viện..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install thất bại" }
npm install `
  @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs `
  react-native-screens react-native-safe-area-context react-native-svg `
  zustand socket.io-client `
  @react-native-async-storage/async-storage `
  @react-native-community/netinfo `
  @op-engineering/op-sqlite `
  @react-native-google-signin/google-signin
if ($LASTEXITCODE -ne 0) { throw "Cài thư viện FOCUSLY thất bại" }

# Trỏ tới Android SDK nếu chưa có local.properties
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$lp = Join-Path $Here 'android\local.properties'
if ((Test-Path $sdk) -and -not (Test-Path $lp)) {
  "sdk.dir=$($sdk -replace '\\', '\\')" | Set-Content -Path $lp -Encoding ASCII
  Write-Host "  + android\local.properties (sdk.dir=$sdk)"
}

# Module ghim màn hình (Phiên nghiêm ngặt)
$javaDir = Join-Path $Here 'android\app\src\main\java\com\focuslymobile'
if (Test-Path $javaDir) {
  Copy-Item (Join-Path $Here 'native-android\*.kt') $javaDir -Force
  $ma = Join-Path $javaDir 'MainApplication.kt'
  if ((Test-Path $ma) -and -not (Select-String -Path $ma -Pattern 'FocusLockPackage' -Quiet)) {
    $c = Get-Content $ma -Raw
    $c = $c -replace 'PackageList\(this\)\.packages\.apply \{', "PackageList(this).packages.apply {`n              add(FocusLockPackage())"
    Set-Content $ma $c -Encoding UTF8
  }
  Write-Host "  + FocusLock (ghim màn hình)"
}

Write-Host ""
Write-Host "✅ Xong! Bật máy ảo Android trong Android Studio rồi chạy:  npm run android" -ForegroundColor Green
