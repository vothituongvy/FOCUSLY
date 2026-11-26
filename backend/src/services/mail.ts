import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.log(`\n[mail:dev] Tới: ${to}\nTiêu đề: ${subject}\n${html.replace(/<[^>]+>/g, '')}\n`);
    return;
  }
  await transporter.sendMail({ from: env.smtp.from, to, subject, html });
}

export function resetPasswordEmail(name: string, link: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#4f46e5">FOCUSLY</h2>
    <p>Xin chào ${escapeHtml(name)},</p>
    <p>Bạn vừa yêu cầu đặt lại mật khẩu. Nhấn vào liên kết dưới đây (hiệu lực 30 phút):</p>
    <p><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Đặt lại mật khẩu</a></p>
    <p style="color:#666;font-size:13px">Link: ${link}</p>
    <p style="color:#666;font-size:13px">Nếu không phải bạn, hãy bỏ qua email này.</p>
  </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
