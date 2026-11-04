import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Escritórios inteiros saem pelo mesmo IP: limite por IP folgado + limite apertado por e-mail.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.', code: 'rate_limited' },
});

export const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => (typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : ipKeyGenerator(req.ip ?? '')),
  message: { error: 'Já enviamos vários links para este e-mail. Confira sua caixa de entrada ou aguarde 15 minutos.', code: 'rate_limited' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
