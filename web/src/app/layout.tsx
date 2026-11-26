import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';

// Be Vietnam Pro: thiết kế cho tiếng Việt, dấu rõ ràng ở mọi cỡ chữ
const vn = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-vn',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'FOCUSLY – Learn with focus. Grow with consistency.', template: '%s · FOCUSLY' },
  description: 'Nền tảng quản lý học tập và sự tập trung trên Web & Mobile.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'FOCUSLY', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#16203a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={vn.variable}>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
