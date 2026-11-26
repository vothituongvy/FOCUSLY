import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy' };

const S = { wrap: { maxWidth: 760, margin: '0 auto', padding: '48px 20px', lineHeight: 1.7 } } as const;

/** Chính sách quyền riêng tư – bắt buộc khi đăng extension lên Chrome Web Store */
export default function PrivacyPage() {
  return (
    <main style={S.wrap}>
      <h1>Privacy Policy – FOCUSLY &amp; FOCUSLY Focus Shield</h1>
      <p className="muted small">Last updated: November 26, 2026</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account data you give us: name, email, avatar, and (if you use Google sign-in) your Google profile name, email and picture.</li>
        <li>Learning data you create: tasks, study sessions, journal entries, materials, settings and your website block list.</li>
      </ul>

      <h2>What the Focus Shield extension does</h2>
      <ul>
        <li>It reads the address of the tab you open only to check it against your own block list while a study session is running, and shows a reminder page when a site is blocked.</li>
        <li>It does not record, store or send your browsing history. Page contents are never read.</li>
        <li>It stores a connection token in the browser and talks only to the FOCUSLY server to get your block list and session status.</li>
      </ul>

      <h2>How we use data</h2>
      <p>Only to run the app features you use (planning, focus sessions, reminders, statistics, AI help). We do not sell data, show ads, or share data with third parties except the services needed to run the app (hosting, database, Google sign-in, push notifications, AI provider for features you request).</p>

      <h2>Deleting your data</h2>
      <p>To delete your account and all related data, contact us (see below) and we will remove it. You can uninstall the extension at any time to remove the data it stores in your browser.</p>

      <h2>Contact</h2>
      <p>Questions: open an issue at github.com/vothituongvy/FOCUSLY.</p>

      <hr />
      <h2>Tóm tắt tiếng Việt</h2>
      <p>FOCUSLY chỉ lưu dữ liệu bạn tạo ra (tài khoản, nhiệm vụ, phiên học, cài đặt). Extension chỉ đối chiếu địa chỉ trang bạn mở với danh sách chặn của chính bạn trong lúc đang học, không ghi lại lịch sử duyệt web và không đọc nội dung trang. Chúng tôi không bán dữ liệu và không hiển thị quảng cáo.</p>
    </main>
  );
}
