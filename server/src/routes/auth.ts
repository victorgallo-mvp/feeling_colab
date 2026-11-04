import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { authLimiter, emailLimiter } from '../middleware/rateLimit.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { clickLogin, refreshSession, requestMagicLink, revokeSession, verifyMagicLink } from '../services/auth.js';

export const authRouter = Router();

authRouter.post('/magic-link', authLimiter, emailLimiter, validate({ body: S.magicLinkBody }), wrap(async (req, res) => {
  const r = await requestMagicLink(req.body.email, req.body.tenant);
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link de acesso.', devLink: r.devLink });
}));

authRouter.post('/verify', authLimiter, validate({ body: S.verifyBody }), wrap(async (req, res) => {
  res.json(await verifyMagicLink(req.body.token, req.headers['user-agent']));
}));

authRouter.post('/click-login', authLimiter, validate({ body: S.clickLoginBody }), wrap(async (req, res) => {
  res.json(await clickLogin(req.body.userId, req.body.tenant, req.headers['user-agent']));
}));

authRouter.post('/refresh', validate({ body: S.refreshBody }), wrap(async (req, res) => {
  res.json(await refreshSession(req.body.refreshToken, req.headers['user-agent']));
}));

authRouter.post('/logout', validate({ body: S.refreshBody }), wrap(async (req, res) => {
  await revokeSession(req.body.refreshToken);
  res.json({ ok: true });
}));
