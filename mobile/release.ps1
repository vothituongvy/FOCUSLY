# ======================================================================
#  FOCUSLY – Phát hành bản app mới (Android APK) lên GitHub Releases
#
#  Cách dùng (PowerShell, trong thư mục mobile):
#     .\release.ps1 1.0.1 "Sửa lỗi trang Ôn tập, thêm ô dịch"
#
#  Script sẽ:
#   1. Đổi số phiên bản ở android/app/build.gradle và src/config.ts
#   2. Build file APK đã ký (gradlew assembleRelease)
#   3. Commit + tag v<phiên bản> + push lên GitHub
#   4. Tạo Release và tải APK lên (nếu máy có GitHub CLI "gh"),
#      nếu không thì mở sẵn trang tạo Release và thư mục chứa APK
# ======================================================================
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Notes = ""
)
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$Gradle = Join-Path $Here "android\app\build.gradle"
$Config = Join-Path $Here "src\config.ts"
$Apk = Join-Path $Here "android\app\build\outputs\apk\release\app-release.apk"
$Repo = "vothituongvy/FOCUSLY"
$Tag = "v$Version"

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Phiên bản phải có dạng 1.0.1" }

# --- 1. Đổi số phiên bản -------------------------------------------------
$Utf8 = New-Object Text.UTF8Encoding $false
$g = [IO.File]::ReadAllText($Gradle, $Utf8)
$code = [int]([regex]::Match($g, 'versionCode\s+(\d+)').Groups[1].Value) + 1
$g = [regex]::Replace($g, 'versionCode\s+\d+', "versionCode $code")
$g = [regex]::Replace($g, 'versionName\s+"[^"]*"', "versionName `"$Version`"")
[IO.File]::WriteAllText($Gradle, $g, $Utf8)

$c = [IO.File]::ReadAllText($Config, $Utf8)
$c = [regex]::Replace($c, "APP_VERSION = '[^']*'", "APP_VERSION = '$Version'")
[IO.File]::WriteAllText($Config, $c, $Utf8)
Write-Host "1/4  Phiên bản $Version (versionCode $code)" -ForegroundColor Cyan

# --- 2. Build APK --------------------------------------------------------
Push-Location (Join-Path $Here "android")
try {
  .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) { throw "Build APK thất bại – xem lỗi phía trên" }
} finally { Pop-Location }
if (-not (Test-Path $Apk)) { throw "Không thấy file APK: $Apk" }
$size = "{0:N1} MB" -f ((Get-Item $Apk).Length / 1MB)
Write-Host "2/4  Đã build APK ($size)" -ForegroundColor Cyan

# --- 3. Commit, tag, push --------------------------------------------------
Push-Location $Root
try {
  git add mobile
  git commit -m "chore(mobile): phát hành bản $Version"
  git tag $Tag
  git push
  git push origin $Tag
} finally { Pop-Location }
Write-Host "3/4  Đã đẩy code và tag $Tag lên GitHub" -ForegroundColor Cyan

# --- 4. Tạo Release --------------------------------------------------------
if (-not $Notes) { $Notes = "FOCUSLY $Version" }
if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh release create $Tag $Apk --repo $Repo --title "FOCUSLY $Version" --notes $Notes --latest
  Write-Host "4/4  Đã đăng Release $Tag" -ForegroundColor Green
} else {
  Write-Host "4/4  Máy chưa có GitHub CLI (gh). Mở trang tạo Release để bạn làm tay:" -ForegroundColor Yellow
  Write-Host "     - Tag đã có sẵn: $Tag"
  Write-Host "     - Kéo file APK trong cửa sổ thư mục vừa mở vào ô 'Attach binaries'"
  Write-Host "     - Release label chọn None, rồi bấm Publish release"
  Set-Clipboard -Value $Notes
  Write-Host "     - Ghi chú đã được chép sẵn, dán (Ctrl+V) vào ô mô tả"
  Start-Process "https://github.com/$Repo/releases/new?tag=$Tag&title=FOCUSLY%20$Version"
  Start-Process explorer.exe "/select,`"$Apk`""
}
Write-Host ""
Write-Host "Link tải cho người dùng: https://github.com/$Repo/releases/latest/download/app-release.apk" -ForegroundColor Green
