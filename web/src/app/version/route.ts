/** Mã bản web đang chạy trên máy chủ (để tab đang mở biết đã có bản mới) */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ id: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || '' }, { headers: { 'Cache-Control': 'no-store' } });
}
