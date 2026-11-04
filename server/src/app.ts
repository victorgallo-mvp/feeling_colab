import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { recognitionsRouter } from './routes/recognitions.js';
import { completionsRouter, missionsRouter } from './routes/missions.js';
import { cyclesRouter } from './routes/cycles.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter, pushRouter } from './routes/notifications.js';
import { publicRouter } from './routes/public.js';
import { docsHtml, openapi } from './openapi.js';
import { adminAvatarRouter, avatarsPublicRouter, myAvatarRouter } from './routes/avatars.js';
import { wheelRouter } from './routes/wheel.js';
import { profileRouter } from './routes/profile.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  // FRONTEND_URL em produção; previews da Vercel (*.vercel.app) e localhost em dev. Sem cookies: o token vai no header.
  app.use(cors({ origin: [config.frontendUrl, /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/, /^http:\/\/localhost:\d+$/], credentials: false }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/docs.json', (_req, res) => res.json(openapi));
  app.get('/api/docs', (_req, res) => res.type('html').send(docsHtml));

  app.use('/api', apiLimiter);
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/avatars', avatarsPublicRouter);
  app.use('/api/me/avatar', myAvatarRouter);
  app.use('/api/me', requireAuth, meRouter);
  app.use('/api/recognitions', requireAuth, recognitionsRouter);
  app.use('/api/missions', requireAuth, missionsRouter);
  app.use('/api/completions', requireAuth, completionsRouter);
  app.use('/api/cycles', requireAuth, cyclesRouter);
  app.use('/api/wheel', requireAuth, wheelRouter);
  app.use('/api/users', requireAuth, profileRouter);
  app.use('/api/admin/users', adminAvatarRouter);
  app.use('/api/admin', requireAuth, requireRole('admin'), adminRouter);
  app.use('/api/notifications', requireAuth, notificationsRouter);
  app.use('/api/push', requireAuth, pushRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada', code: 'not_found' }));
  app.use(errorHandler);
  return app;
}
