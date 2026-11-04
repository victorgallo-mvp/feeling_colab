import { Router } from 'express';
import { one, query } from '../db.js';
import { wrap } from '../wrap.js';
import { homePayload } from '../services/scoreboard.js';
import { config } from '../config.js';

export const meRouter = Router();

meRouter.get('/', wrap(async (req, res) => {
  const u = req.user;
  const [tenant, area] = await Promise.all([
    one(`select id, slug, name, logo_url, logo_dark_url, symbol_url, theme, font_display, auth_mode, primary_color, secondary_color, timezone from tenants where id = $1`, [u.tenantId]),
    u.areaId ? one(`select id, name from areas where id = $1`, [u.areaId]) : null,
  ]);
  const me = await one(`select id, name, email, avatar_url, role from users where id = $1`, [u.id]);
  query(`update users set last_seen_at = now() where id = $1`, [u.id]).catch(() => {});
  res.json({ user: { ...me, area }, tenant, push: { vapidPublicKey: config.vapid.publicKey || null } });
}));

meRouter.get('/home', wrap(async (req, res) => {
  res.json(await homePayload(req.user));
}));
