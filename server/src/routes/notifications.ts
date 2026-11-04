import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { query } from '../db.js';
import { listForUser, markRead } from '../services/notifications/index.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', wrap(async (req, res) => {
  res.json(await listForUser(req.user.id));
}));
notificationsRouter.post('/read', validate({ body: S.markReadBody }), wrap(async (req, res) => {
  await markRead(req.user.id, req.body.ids);
  res.json({ ok: true });
}));

export const pushRouter = Router();
pushRouter.post('/subscribe', validate({ body: S.pushSubscribeBody }), wrap(async (req, res) => {
  const b = req.body;
  await query(
    `insert into push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent) values ($1,$2,$3,$4,$5,$6)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, revoked_at = null`,
    [req.user.tenantId, req.user.id, b.endpoint, b.keys.p256dh, b.keys.auth, req.headers['user-agent'] ?? null]);
  res.status(201).json({ ok: true });
}));
pushRouter.delete('/subscribe', validate({ body: S.pushUnsubscribeBody }), wrap(async (req, res) => {
  await query(`update push_subscriptions set revoked_at = now() where endpoint = $1 and user_id = $2`, [req.body.endpoint, req.user.id]);
  res.json({ ok: true });
}));
