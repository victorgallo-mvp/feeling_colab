import { Router } from 'express';
import { validate, q } from '../middleware/validate.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { one, pool, query } from '../db.js';
import { audit } from '../services/audit.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { tx } from '../db.js';
import { createAccessCode, revokeUserSessions } from '../services/auth.js';

export const adminRouter = Router();

// ---------- usuários ----------
adminRouter.get('/users', wrap(async (req, res) => {
  res.json(await query(
    `select u.id, u.email, u.name, u.avatar_url, u.role, u.area_id, a.name as area_name, u.is_active, u.last_seen_at, u.created_at,
       exists(select 1 from sessions s where s.user_id = u.id and s.revoked_at is null and s.rotated_at is null and s.expires_at > now()) as has_session,
       (select max(m.expires_at) from magic_links m where m.user_id = u.id and m.used_at is null and m.expires_at > now()) as code_expires_at
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
  if (b.isActive === false) await revokeUserSessions(u!.id);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.update', entity: 'user', entityId: u!.id, before, after: u });
  res.json(u);
}));

/** Importação em lote: cria quem ainda não existe (por e-mail) e cria as áreas que faltarem. */
adminRouter.post('/users/bulk', validate({ body: S.bulkUsersBody }), wrap(async (req, res) => {
  const tid = req.user.tenantId;
  const out = await tx(async (db) => {
    const created: any[] = []; const skipped: { email: string; reason: string }[] = [];
    const areas = new Map<string, string>((await query(`select id, name from areas where tenant_id = $1 and deleted_at is null`, [tid], db)).map((a) => [a.name.toLowerCase(), a.id]));
    const seen = new Set<string>((await query(`select lower(email) e from users where tenant_id = $1 and deleted_at is null`, [tid], db)).map((r) => r.e));
    for (const row of req.body.users as Array<{ name: string; email: string; role?: string; area?: string | null }>) {
      const email = row.email.toLowerCase();
      if (seen.has(email)) { skipped.push({ email, reason: 'já cadastrado' }); continue; }
      seen.add(email);
      let areaId: string | null = null;
      if (row.area) {
        areaId = areas.get(row.area.toLowerCase()) ?? null;
        if (!areaId) { areaId = (await one(`insert into areas (tenant_id, name) values ($1,$2) returning id`, [tid, row.area], db))!.id; areas.set(row.area.toLowerCase(), areaId!); }
      }
      const u = await one(`insert into users (tenant_id, email, name, role, area_id) values ($1,$2,$3,$4,$5) returning id, name, email, role`, [tid, email, row.name, row.role ?? 'member', areaId], db);
      created.push(u);
    }
    await audit(db, { tenantId: tid, actorId: req.user.id, action: 'user.bulk_create', entity: 'user', entityId: req.user.id, after: { created: created.length, skipped: skipped.length } });
    return { created, skipped };
  });
  res.status(201).json(out);
}));

/** Ativar, desativar ou remover várias pessoas de uma vez. Quem executa nunca entra na desativação/remoção. */
adminRouter.post('/users/bulk-action', validate({ body: S.bulkActionBody }), wrap(async (req, res) => {
  const { action } = req.body as { action: 'activate' | 'deactivate' | 'remove' };
  const ids = (req.body.ids as string[]).filter((id) => action === 'activate' || id !== req.user.id);
  const sql = action === 'activate' ? `update users set is_active = true, updated_at = now() where tenant_id = $1 and id = any($2::uuid[]) and deleted_at is null returning id`
    : action === 'deactivate' ? `update users set is_active = false, updated_at = now() where tenant_id = $1 and id = any($2::uuid[]) and deleted_at is null returning id`
    : `update users set deleted_at = now(), is_active = false, updated_at = now() where tenant_id = $1 and id = any($2::uuid[]) and deleted_at is null returning id`;
  const rows = await query<{ id: string }>(sql, [req.user.tenantId, ids]);
  if (action !== 'activate' && rows.length) await query(`update sessions set revoked_at = now() where user_id = any($1::uuid[]) and revoked_at is null`, [rows.map((r) => r.id)]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: `user.bulk_${action}`, entity: 'user', entityId: req.user.id, after: { ids: rows.map((r) => r.id) } });
  res.json({ ok: true, affected: rows.length });
}));

/** Códigos de acesso (uso único, 7 dias). O código só aparece nesta resposta: o banco guarda apenas o hash. */
adminRouter.post('/users/access-codes', validate({ body: S.userIdsBody }), wrap(async (req, res) => {
  const active = await query<{ id: string }>(`select id from users where tenant_id = $1 and id = any($2::uuid[]) and deleted_at is null and is_active order by name`, [req.user.tenantId, req.body.ids]);
  const codes = [];
  for (const u of active) codes.push(await createAccessCode(req.user.tenantId, u.id));
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.access_codes', entity: 'user', entityId: req.user.id, after: { ids: active.map((u) => u.id) } });
  res.status(201).json(codes);
}));

/** Aparelho perdido: derruba todas as sessões da pessoa. Ela volta a entrar com um código novo. */
adminRouter.post('/users/:id/revoke-sessions', validate({ params: S.idParam }), wrap(async (req, res) => {
  const u = await one(`select id from users where id = $1 and tenant_id = $2 and deleted_at is null`, [req.params.id, req.user.tenantId]);
  if (!u) throw notFound('Usuário não encontrado');
  await revokeUserSessions(u.id);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'user.revoke_sessions', entity: 'user', entityId: u.id });
  res.json({ ok: true });
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
       theme = coalesce($18, theme), font_display = coalesce($19, font_display), auth_mode = coalesce($20, auth_mode),
       coins_per_week = coalesce($21, coins_per_week), message_min_chars = coalesce($22, message_min_chars), updated_at = now() where id = $1 returning *`,
    [req.user.tenantId, b.name ?? null, 'logoUrl' in b, b.logoUrl ?? null, b.primaryColor ?? null, b.secondaryColor ?? null, b.timezone ?? null,
     b.coinsPerCycle ?? null, b.recognitionCost ?? null, b.maxPerReceiverPerCycle ?? null, b.goalParticipationPct ?? null, b.goalMinRecognitions ?? null, b.goalMinMissions ?? null,
     'logoDarkUrl' in b, b.logoDarkUrl ?? null, 'symbolUrl' in b, b.symbolUrl ?? null, b.theme ?? null, b.fontDisplay ?? null, b.authMode ?? null, b.coinsPerWeek ?? null, b.messageMinChars ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'tenant.settings', entity: 'tenant', entityId: req.user.tenantId, before, after: t });
  res.json({ ...t, note: 'Moedas por semana e justificativa mínima valem na hora. Regras de temporada (saldo, custo, meta) valem a partir da próxima temporada.' });
}));

// ---------- prêmios (catálogo do CEO) ----------
adminRouter.get('/rewards', wrap(async (req, res) => {
  res.json(await query(`select * from rewards where tenant_id = $1 and deleted_at is null order by kind, sort_order, title`, [req.user.tenantId]));
}));
adminRouter.post('/rewards', validate({ body: S.rewardBody }), wrap(async (req, res) => {
  const b = req.body;
  const r = await one(`insert into rewards (tenant_id, title, description, kind, weight, is_active, sort_order, effect) values ($1,$2,$3,$4,coalesce($5,1),coalesce($6,true),coalesce($7,0),coalesce($8,'prize')) returning *`,
    [req.user.tenantId, b.title, b.description ?? null, b.kind, b.weight ?? null, b.isActive ?? null, b.sortOrder ?? null, b.effect ?? null]);
  await audit(pool, { tenantId: req.user.tenantId, actorId: req.user.id, action: 'reward.create', entity: 'reward', entityId: r!.id, after: r });
  res.status(201).json(r);
}));
adminRouter.patch('/rewards/:id', validate({ params: S.idParam, body: S.updateRewardBody }), wrap(async (req, res) => {
  const b = req.body;
  const r = await one(
    `update rewards set title = coalesce($3,title), description = case when $4::boolean then $5 else description end, kind = coalesce($6,kind),
       weight = coalesce($7,weight), is_active = coalesce($8,is_active), sort_order = coalesce($9,sort_order), effect = coalesce($10,effect), updated_at = now()
     where id = $1 and tenant_id = $2 and deleted_at is null returning *`,
    [req.params.id, req.user.tenantId, b.title ?? null, 'description' in b, b.description ?? null, b.kind ?? null, b.weight ?? null, b.isActive ?? null, b.sortOrder ?? null, b.effect ?? null]);
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
    `select s.id, s.week_key, s.points, s.spun_at, s.delivered_at, s.status, s.delivery_note, s.multiplier, u.name as user_name, u.avatar_url as user_avatar, rw.title as reward_title, rw.effect as reward_effect
     from wheel_spins s join users u on u.id = s.user_id join rewards rw on rw.id = s.reward_id where s.tenant_id = $1 order by s.spun_at desc limit 100`, [req.user.tenantId]));
}));
/** Entrega do prêmio: a combinar → agendado → entregue. Folga e home office dependem de acordo com a liderança. */
adminRouter.patch('/wheel/spins/:id', validate({ params: S.idParam, body: S.deliveredBody }), wrap(async (req, res) => {
  const b = req.body as { delivered?: boolean; status?: 'pending' | 'scheduled' | 'delivered'; note?: string | null };
  const status = b.status ?? (b.delivered === undefined ? null : b.delivered ? 'delivered' : 'pending');
  const s = await one(
    `update wheel_spins set status = coalesce($3, status),
       delivered_at = case when $3::text is null then delivered_at when $3 = 'delivered' then coalesce(delivered_at, now()) else null end,
       delivery_note = case when $4::boolean then $5 else delivery_note end
     where id = $1 and tenant_id = $2 returning *`,
    [req.params.id, req.user.tenantId, status, 'note' in b, b.note || null]);
  if (!s) throw notFound('Giro não encontrado');
  res.json(s);
}));

// ---------- jogo justo ----------
/** Distribuições fora do padrão nas últimas semanas, para a liderança olhar. Não bloqueia nada: só aponta. */
adminRouter.get('/fairplay', validate({ query: S.fairplayQuery }), wrap(async (req, res) => {
  const { weeks } = q(req) as { weeks: number };
  const tid = req.user.tenantId;
  const base = `with r as (
      select x.giver_id, x.receiver_id, date_trunc('week', x.created_at at time zone t.timezone) as wk, count(*)::int as n
      from recognitions x join tenants t on t.id = x.tenant_id
      where x.tenant_id = $1 and x.deleted_at is null
        and x.created_at >= ((date_trunc('week', now() at time zone t.timezone) - (($2::int - 1) * interval '1 week')) at time zone t.timezone)
      group by 1, 2, 3)`;
  const [reciprocal, concentrated, short] = await Promise.all([
    query(`${base}
      select to_char(a.wk, 'YYYY-MM-DD') as week_start, ua.name as a_name, ub.name as b_name, a.n as a_to_b, b.n as b_to_a
      from r a join r b on b.giver_id = a.receiver_id and b.receiver_id = a.giver_id and b.wk = a.wk and a.giver_id < a.receiver_id
      join users ua on ua.id = a.giver_id join users ub on ub.id = a.receiver_id
      order by a.wk desc, (a.n + b.n) desc, ua.name`, [tid, weeks]),
    query(`${base}
      select to_char(r.wk, 'YYYY-MM-DD') as week_start, g.name as giver_name, rc.name as receiver_name, r.n as coins
      from r join users g on g.id = r.giver_id join users rc on rc.id = r.receiver_id
      where r.n >= 3 order by r.wk desc, r.n desc, g.name`, [tid, weeks]),
    query(`select x.id, x.created_at, g.name as giver_name, rc.name as receiver_name, x.message
      from recognitions x join tenants t on t.id = x.tenant_id join users g on g.id = x.giver_id join users rc on rc.id = x.receiver_id
      where x.tenant_id = $1 and x.deleted_at is null and char_length(coalesce(x.message, '')) < 25
        and x.created_at >= ((date_trunc('week', now() at time zone t.timezone) - (($2::int - 1) * interval '1 week')) at time zone t.timezone)
      order by x.created_at desc limit 60`, [tid, weeks]),
  ]);
  res.json({ weeks, reciprocal, concentrated, short });
}));
