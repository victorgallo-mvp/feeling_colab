import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  JWT_SECRET: z.string().min(16),
  API_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Reconhecimento <onboarding@resend.dev>'),
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  CRON_ENABLED: z.string().default('true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Mensagem clara no log do Railway em vez de stack do zod
  const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  - ');
  console.error(`\n[config] Variáveis de ambiente faltando ou inválidas:\n  - ${missing}\n\nDefina-as no serviço (Railway → Variables). Mínimo em produção: DATABASE_URL, JWT_SECRET (>= 16 caracteres), API_URL, FRONTEND_URL.\n`);
  process.exit(1);
}
const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isTest: env.NODE_ENV === 'test',
  databaseUrl: env.DATABASE_URL,
  port: env.PORT,
  jwtSecret: env.JWT_SECRET,
  apiUrl: env.API_URL,
  frontendUrl: env.FRONTEND_URL,
  resendApiKey: env.RESEND_API_KEY,
  mailFrom: env.MAIL_FROM,
  vapid: { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT },
  cronEnabled: env.CRON_ENABLED !== 'false' && env.NODE_ENV !== 'test',
  accessTokenTtl: 60 * 60, // segundos
  refreshTokenDays: 30,
  magicLinkMinutes: 15,
};
