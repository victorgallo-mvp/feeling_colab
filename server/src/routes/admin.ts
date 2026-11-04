import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { one, pool, query } from '../db.js';
import { audit } from '../services/audit.js';
import { badRequest, conflict, notFound } from '../errors.js';

export const adminRouter = Router();

// ---------- usuários ----------
adminRouter.get('/users', wrap(async (req, res) => {
  res.json(await query(
    `select u.id, u.email, u.name, u.avatar_url, u.role, u.area_id, a.name as area_name, u.is_active, u.last_seen_at, u.created_at
     from users u left join areas a on a.id = u.area_id where u.tenant_id = $1 and u.deleted_at is null order by u.name`, [req.user.tenantId]));
}));

adminRouter.post('/users', validate({ body: S.createUserBody }), wrap(async (req, res) => {
  const b = req.body;
  const dup = await one(`select 1 from users where tenant_id = $1 and lower(email) = lower($2) and deleted_at is null`, [req.user.tenantId, b.email]);
  if (dup) throw conflict('Já existe um usuário com este e-mail', 'email_taken');
  const u = await one(`insert into users (tenant_id, email, name, role, area_id, avatar_url) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.tenantId, b.email.toLowerCase(), b.name, b.role, b.areaId ?? null, b.avatarUrl ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.create', entity: 'user', entityId: u!.id, after: u });
  res.status(201).json(u);
}));

adminRouter.patch('/users/:id', validate({ params: S.idParam, body: S.updateUserBody }), wrap(async (req, res) => {
  const before = await one(`select * from users where id = $1 and tenant_id = $2 and deleted_at is null`, [req.params.id, req.user.tenantId]);
  if (!before) throw notFound('Usuário não encontrado');
  const b = req.body;
  if (before.id === req.user.id && (b.role && b.role !== 'admin' || b.isActive === false)) throw badRequest('Você não pode rebaixar ou desativar a si mesmo', 'self_lock');
  const u = await one(
    `update users set email = coalesce($3, email), name = coalesce($4, name), role = coalesce($5, role),
       area_id = case when $6::boolean then $7 else area_id end, avatar_url = case when $8::boolean then $9 else avatar_url end,
       is_active = coalesce($10, is_active), updated_at = now() where id = $1 and tenant_id = $2 returning *`,
    [req.params.id, req.user.tenantId, b.email?.toLowerCase() ?? null, b.name ?? null, b.role ?? null,
     'areaId' in b, b.areaId ?? null, 'avatarUrl' in b, b.avatarUrl ?? null, b.isActive ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.update', entity: 'user', entityId: u!.id, before, after: u });
  res.json(u);
}));

adminRouter.delete('/users/:id', validate({ params: S.idParam }), wrap(async (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('Você não pode remover a si mesmo', 'self_lock');
  const u = await one(`update users set deleted_at = now(), is_active = false, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning id`, [req.params.id, req.user.tenantId]);
  if (!u) throw notFound('Usuário não encontrado');
  await query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [u.id]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.delete', entity: 'user', entityId: u.id });
  res.json({ ok: true });
}));

// ---------- áreas ----------
adminRouter.get('/areas', wrap(async (req, res) => {
  res.json(await query(`select a.*, (select count(*)::int from users u where u.area_id = a.id and u.deleted_at is null) as users_count from areas a where tenant_id = $1 and deleted_at is null order by name`, [req.user.tenantId]));
}));
adminRouter.post('/areas', validate({ body: S.areaBody }), wrap(async (req, res) => {
  const a = await one(`insert into areas (tenant_id, name) values ($1,$2) returning *`, [req.user.tenantId, req.body.name]).catch((e) => { if (e.code === '23505') throw conflict('Área já existe'); throw e; });
  res.status(201).json(a);
}));
adminRouter.patch('/areas/:id', validate({ params: S.idParam, body: S.areaBody }), wrap(async (req, res) => {
  const a = await one(`update areas set name = $3, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning *`, [req.params.id, req.user.tenantId, req.body.name]);
  if (!a) throw notFound('Área não encontrada');
  res.json(a);
}));
adminRouter.delete('/areas/:id', validate({ params: S.idParam }), wrap(async (req, res) => {
  await query(`update users set area_id = null where area_id = $1`, [req.params.id]);
  const a = await one(`update areas set deleted_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning id`, [req.params.id, req.user.tenantId]);
  if (!a) throw notFound('Área não encontrada');
  res.json({ ok: true });
}));

// ---------- chips ----------
adminRouter.get('/chips', wrap(async (req, res) => {
  res.json(await query(`select *, (valid_from <= now() and (valid_until is null or valid_until > now())) as active from chips where tenant_id = $1 and deleted_at is null order by sort_order, label`, [req.user.tenantId]));
}));
adminRouter.post('/chips', validate({ body: S.chipBody }), wrap(async (req, res) => {
  const b = req.body;
  const c = await one(`insert into chips (tenant_id, label, emoji, color, sort_order, valid_from, valid_until) values ($1,$2,$3,$4,coalesce($5,(select coalesce(max(sort_order),0)+1 from chips where tenant_id=$1)),coalesce($6, now()),$7) returning *`,
    [req.user.tenantId, b.label, b.emoji ?? null, b.color ?? null, b.sortOrder ?? null, b.validFrom ?? null, b.validUntil ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'chip.create', entity: 'chip', entityId: c!.id, after: c });
  res.status(201).json(c);
}));
adminRouter.patch('/chips/:id', validate({ params: S.idParam, body: S.updateChipBody }), wrap(async (req, res) => {
  const b = req.body;
  const before = await one(`select * from chips where id = $1 and tenant_id = $2 and deleted_at is null`, [req.params.id, req.user.tenantId]);
  if (!before) throw notFound('Chip não encontrado');
  const c = await one(
    `update chips set label = coalesce($3,label), emoji = case when $4::boolean then $5 else emoji end, color = case when $6::boolean then $7 else color end,
       sort_order = coalesce($8, sort_order), valid_from = coalesce($9, valid_from), valid_until = case when $10::boolean then $11 else valid_until end, updated_at = now()
     where id = $1 and tenant_id = $2 returning *`,
    [req.params.id, req.user.tenantId, b.label ?? null, 'emoji' in b, b.emoji ?? null, 'color' in b, b.color ?? null, b.sortOrder ?? null, b.validFrom ?? null, 'validUntil' in b, b.validUntil ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'chip.update', entity: 'chip', entityId: c!.id, before, after: c });
  res.json(c);
}));
adminRouter.delete('/chips/:id', validate({ params: S.idParam }), wrap(async (req, res) => {
  // encerra vigência em vez de apagar: histórico continua apontando pro chip
  const c = await one(`update chips set valid_until = now(), updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning *`, [req.params.id, req.user.tenantId]);
  if (!c) throw notFound('Chip não encontrado');
  res.json(c);
}));

// ---------- configurações do tenant ----------
adminRouter.get('/settings', wrap(async (req, res) => {
  res.json(await one(`select * from tenants where id = $1`, [req.user.tenantId]));
}));
adminRouter.patch('/settings', validate({ body: S.settingsBody }), wrap(async (req, res) => {
  const b = req.body;
  const before = await one(`select * from tenants where id = $1`, [req.user.tenantId]);
  const t = await one(
    `update tenants set name = coalesce($2,name), logo_url = case when $3::boolean then $4 else logo_url end, primary_color = coalesce($5,primary_color),
       secondary_color = coalesce($6,secondary_color), timezone = coalesce($7,timezone), coins_per_cycle = coalesce($8,coins_per_cycle),
       recognition_cost = coalesce($9,recognition_cost), max_per_receiver_per_cycle = coalesce($10,max_per_receiver_per_cycle),
       goal_participation_pct = coalesce($11,goal_participation_pct), goal_min_recognitions = coalesce($12,goal_min_recognitions),
       goal_min_missions = coalesce($13,goal_min_missions),
       logo_dark_url = case when $14::boolean then $15 else logo_dark_url end, symbol_url = case when $16::boolean then $17 else symbol_url end,
       theme = coalesce($18, theme), font_display = coalesce($19, font_display), auth_mode = coalesce($20, auth_mode), updated_at = now() where id = $1 returning *`,
    [req.user.tenantId, b.name ?? null, 'logoUrl' in b, b.logoUrl ?? null, b.primaryColor ?? null, b.secondaryColor ?? null, b.timezone ?? null,
     b.coinsPerCycle ?? null, b.recognitionCost ?? null, b.maxPerReceiverPerCycle ?? null, b.goalParticipationPct ?? null, b.goalMinRecognitions ?? null, b.goalMinMissions ?? null,
     'logoDarkUrl' in b, b.logoDarkUrl ?? null, 'symbolUrl' in b, b.symbolUrl ?? null, b.theme ?? null, b.fontDisplay ?? null, b.authMode ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'tenant.settings', entity: 'tenant', entityId: req.user.tenantId, before, after: t });
  res.json({ ...t, note: 'Regras de moeda/meta valem a partir da próxima temporada; a temporada aberta mantém as regras com que começou.' });
}));

// ---------- prêmios (catálogo do CEO) ----------
adminRouter.get('/rewards', wrap(async (req, res) => {
  res.json(await query(`select * from rewards where tenant_id = $1 and deleted_at is null order by kind, sort_order, title`, [req.user.tenantId]));
}));
adminRouter.post('/rewards', validate({ body: S.rewardBody }), wrap(async (req, res) => {
  const b = req.body;
  const r = await one(`insert into rewards (tenant_id, title, description, kind, weight, is_active, sort_order) values ($1,$2,$3,$4,coalesce($5,1),coalesce($6,true),coalesce($7,0)) returning *`,
    [req.user.tenantId, b.title, b.description ?? null, b.kind, b.weight ?? null, b.isActive ?? null, b.sortOrder ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'reward.create', entity: 'reward', entityId: r!.id, after: r });
  res.status(201).json(r);
}));
adminRouter.patch('/rewards/:id', validate({ params: S.idParam, body: S.updateRewardBody }), wrap(async (req, res) => {
  const b = req.body;
  const r = await one(
    `update rewards set title = coalesce($3,title), description = case when $4::boolean then $5 else description end, kind = coalesce($6,kind),
       weight = coalesce($7,weight), is_active = coalesce($8,is_active), sort_order = coalesce($9,sort_order), updated_at = now()
     where id = $1 and tenant_id = $2 and deleted_at is null returning *`,
    [req.params.id, req.user.tenantId, b.title ?? null, 'description' in b, b.description ?? null, b.kind ?? null, b.weight ?? null, b.isActive ?? null, b.sortOrder ?? null]);
  if (!r) throw notFound('Prêmio não encontrado');
  res.json(r);
}));
adminRouter.delete('/rewards/:id', validate({ params: S.idParam }), wrap(async (req, res) => {
  const r = await one(`update rewards set deleted_at = now(), is_active = false, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning id`, [req.params.id, req.user.tenantId]);
  if (!r) throw notFound('Prêmio não encontrado');
  res.json({ ok: true });
}));
adminRouter.get('/wheel/spins', wrap(async (req, res) => {
  res.json(await query(
    `select s.id, s.week_key, s.points, s.spun_at, s.delivered_at, u.name as user_name, u.avatar_url as user_avatar, rw.title as reward_title
     from wheel_spins s join users u on u.id = s.user_id join rewards rw on rw.id = s.reward_id where s.tenant_id = $1 order by s.spun_at desc limit 100`, [req.user.tenantId]));
}));
adminRouter.patch('/wheel/spins/:id', validate({ params: S.idParam, body: S.deliveredBody }), wrap(async (req, res) => {
  const s = await one(`update wheel_spins set delivered_at = case when $3::boolean then now() else null end where id = $1 and tenant_id = $2 returning *`, [req.params.id, req.user.tenantId, req.body.delivered]);
  if (!s) throw notFound('Giro não encontrado');
  res.json(s);
}));
