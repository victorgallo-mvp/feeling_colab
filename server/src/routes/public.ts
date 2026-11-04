import { Router } from 'express';
import { one, query } from '../db.js';
import { wrap } from '../wrap.js';

export const publicRouter = Router();

/** Lista de pessoas para a tela de entrada por clique. Só responde se o tenant estiver nesse modo. */
publicRouter.get('/users', wrap(async (req, res) => {
  const slug = typeof req.query.tenant === 'string' ? req.query.tenant : null;
  const rows = await query(
    `select u.id, u.name, u.avatar_url, a.name as area_name from users u join tenants t on t.id = u.tenant_id left join areas a on a.id = u.area_id
     where t.deleted_at is null and t.auth_mode = 'click' and ($1::text is null or t.slug = $1) and u.deleted_at is null and u.is_active
       and t.id = (select id from tenants where deleted_at is null and ($1::text is null or slug = $1) order by created_at asc limit 1)
     order by u.name`, [slug]);
  res.json(rows);
}));

/** Marca do tenant para a tela de login. Por slug (?tenant=) ou o primeiro cadastrado (piloto). */
publicRouter.get('/tenant', wrap(async (req, res) => {
  const slug = typeof req.query.tenant === 'string' ? req.query.tenant : null;
  const t = await one(
    `select slug, name, logo_url, logo_dark_url, symbol_url, theme, font_display, auth_mode, primary_color, secondary_color from tenants where deleted_at is null and ($1::text is null or slug = $1) order by created_at asc limit 1`, [slug]);
  res.json(t ?? { slug: null, name: 'Reconhecimento', logo_url: null, logo_dark_url: null, symbol_url: null, theme: 'light', font_display: 'default', auth_mode: 'magic_link', primary_color: '#4f46e5', secondary_color: '#f59e0b' });
}));
