import dotenv from 'dotenv';

dotenv.config();

const list = (v?: string) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/focusly'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', isProd ? undefined : 'dev-access-secret'),
  jwtExtensionSecret: required('JWT_EXTENSION_SECRET', isProd ? undefined : 'dev-extension-secret'),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  corsOrigins: list(process.env.CORS_ORIGINS ?? 'http://localhost:3000'),
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  googleClientIds: list(process.env.GOOGLE_CLIENT_IDS),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'FOCUSLY <no-reply@focusly.app>',
  },
  ai: {
    /** Anthropic Claude API – để trống thì các tính năng AI trả 503 */
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    /** 'brain' (mặc định) = FOCUSLY Brain tự xây, miễn phí · 'claude' = dùng Claude API (cần ANTHROPIC_API_KEY) */
    provider: (process.env.AI_PROVIDER ?? 'brain').toLowerCase(),
    model: process.env.AI_MODEL ?? 'claude-haiku-5-5',
    maxRequestsPerHour: Number(process.env.AI_MAX_REQUESTS_PER_HOUR ?? 40),
  },
  /** Firebase Admin (FCM) – service account JSON mã hoá base64 */
  firebaseServiceAccountB64: process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? '',
  enableScheduler: (process.env.ENABLE_SCHEDULER ?? 'true') !== 'false',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
};
