import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';
import './shell.css';
import './guide.css';
import { PwaRegister } from '@/components/PwaRegister';
import { cookies } from 'next/headers';
import { tr } from '@/lib/i18n';
import { LangGate } from '@/components/LangGate';

// Be Vietnam Pro: thiết kế cho tiếng Việt, dấu rõ ràng ở mọi cỡ chữ
const vn = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-vn',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'FOCUSLY – Learn with focus. Grow with consistency.', template: '%s · FOCUSLY' },
  description: tr('Nền tảng quản lý học tập và sự tập trung trên Web & Mobile.'),
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/favicon.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'FOCUSLY', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#16203a',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get('focusly_lang')?.value === 'en' ? 'en' : 'vi';
  return (
    <html lang={lang} className={vn.variable}>
      <body>
        {lang === 'en' ? <LangGate>{children}</LangGate> : children}
        <PwaRegister />
      </body>
    </html>
  );
}
