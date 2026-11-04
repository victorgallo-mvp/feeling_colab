import { one, query, tx, type Queryable } from '../db.js';
import { pool } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { getOpenCycle } from './cycles.js';
import { notify } from './notifications/index.js';

/**
 * Roleta semanal: quem mais recebeu pontos na semana ISO anterior (fuso do tenant) ganha o direito
 * de girar uma vez durante a semana corrente. O servidor sorteia (ponderado pelo peso do prêmio);
 * o cliente só anima até o resultado.
 */
export async function weekContext(tenantId: string, db: Queryable) {
  return one<{ week_key: string; starts_at: Date; ends_at: Date; spin_until: Date }>(
    `select to_char((date_trunc('week', now() at time zone timezone) - interval '1 week'), 'IYYY-"W"IW') as week_key,
            ((date_trunc('week', now() at time zone timezone) - interval '1 week') at time zone timezone) as starts_at,
            (date_trunc('week', now() at time zone timezone) at time zone timezone) as ends_at,
            ((date_trunc('week', now() at time zone timezone) + interval '1 week') at time zone timezone) as spin_until
     from tenants where id = $1`, [tenantId], db);
}

export async function weekWinner(tenantId: string, db: Queryable = pool) {
  const w = (await weekContext(tenantId, db))!;
  const rows = await query<{ user_id: string; name: string; avatar_url: string | null; points: number; received: number }>(
    `select u.id as user_id, u.name, u.avatar_url,
       (coalesce(r.pts,0) + coalesce(m.pts,0))::int as points, coalesce(r.cnt,0)::int as received
     from users u
     left join (select receiver_id, sum(points_awarded) pts, count(*) cnt from recognitions where tenant_id = $1 and deleted_at is null and created_at >= $2 and created_at < $3 group by receiver_id) r on r.receiver_id = u.id
     left join (select user_id, sum(points_awarded) pts from mission_completions where tenant_id = $1 and status = 'approved' and deleted_at is null and reviewed_at >= $2 and reviewed_at < $3 group by user_id) m on m.user_id = u.id
     where u.tenant_id = $1 and u.deleted_at is null and u.is_active
     order by points desc, received desc, u.id asc limit 1`, [tenantId, w.starts_at, w.ends_at], db);
  const winner = rows[0] && rows[0].points > 0 ? rows[0] : null;
  const spin = await one(
    `select s.id, s.user_id, s.spun_at, s.delivered_at, rw.title as reward_title, rw.description as reward_description
     from wheel_spins s join rewards rw on rw.id = s.reward_id where s.tenant_id = $1 and s.week_key = $2`, [tenantId, w.week_key], db);
  const prizes = await query(`select id, title, description, weight from rewards where tenant_id = $1 and kind = 'wheel' and is_active and deleted_at is null order by sort_order, title`, [tenantId], db);
  return { week_key: w.week_key, starts_at: w.starts_at, ends_at: w.ends_at, spin_until: w.spin_until, winner, spin, prizes };
}

export async function spin(tenantId: string, userId: string) {
  const out = await tx(async (db) => {
    await query(`select id from tenants where id = $1 for update`, [tenantId], db);
    const ctx = await weekWinner(tenantId, db);
    if (!ctx.winner) throw notFound('Ninguém pontuou na semana passada, sem roleta desta vez');
    if (ctx.winner.user_id !== userId) throw forbidden(`Só ${ctx.winner.name.split(' ')[0]} pode girar esta semana`);
    if (ctx.spin) throw conflict('A roleta desta semana já foi girada', 'already_spun');
    if (!ctx.prizes.length) throw conflict('Nenhum prêmio cadastrado na roleta', 'no_prizes');
    const total = ctx.prizes.reduce((a, p) => a + p.weight, 0);
    let r = Math.random() * total; let chosen = ctx.prizes[0];
    for (const p of ctx.prizes) { r -= p.weight; if (r <= 0) { chosen = p; break; } }
    const cycle = await getOpenCycle(tenantId, db);
    const s = await one(`insert into wheel_spins (tenant_id, cycle_id, week_key, user_id, reward_id, points) values ($1,$2,$3,$4,$5,$6) returning *`,
      [tenantId, cycle?.id ?? null, ctx.week_key, userId, chosen.id, ctx.winner.points], db);
    return { spin: s!, reward: chosen, index: ctx.prizes.findIndex((p) => p.id === chosen.id), prizes: ctx.prizes };
  });
  return out;
}

/** Avisa o vencedor da semana (job de segunda-feira). */
export async function notifyWeekWinner(tenantId: string) {
  const ctx = await weekWinner(tenantId);
  if (!ctx.winner || ctx.spin || !ctx.prizes.length) return;
  const { sentRecently } = await import('./notifications/index.js');
  if (await sentRecently(ctx.winner.user_id, 'wheel_winner', 24 * 6, { weekKey: ctx.week_key })) return;
  await notify(ctx.winner.user_id, 'wheel_winner', { points: ctx.winner.points, weekKey: ctx.week_key });
}
