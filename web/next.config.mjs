/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // micro: cho phép chính FOCUSLY dùng (luyện phát âm)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** Mã bản build – trình duyệt so với bản đang chạy trên máy chủ để báo "có bản web mới" */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || String(Date.now());

const nextConfig = {
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  poweredByHeader: false,
  // Hiện tên file/dòng thật trong Console khi có lỗi trên bản deploy
  productionBrowserSourceMaps: true,
  // Phase 4: build "standalone" để đóng gói Docker gọn nhẹ (Vercel bỏ qua tuỳ chọn này)
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  images: { unoptimized: true },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
