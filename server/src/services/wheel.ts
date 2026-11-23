import { one, query, tx, type Queryable } from '../db.js';
import { pool } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { getOpenCycle } from './cycles.js';
import { notify } from './notifications/index.js';
import { weekStandings, type WeekRow } from './week.js';

/**
 * Roleta semanal (Destaque da Semana): quem mais recebeu moedas na semana ISO anterior (fuso do tenant)
 * ganha o direito de girar uma vez durante a semana corrente. Só moedas contam, missões não.
 * Desempate: 1º mais colegas diferentes; 2º "giro prévio" (cada empatado tira um número, o maior vence).
 * O servidor sorteia o prêmio (ponderado pelo peso); o cliente só anima até o resultado.
 */
export async function weekContext(tenantId: string, db: Queryable) {
  return one<{ week_key: string; starts_at: Date; ends_at: Date; spin_until: Date }>(
    `select to_char((date_trunc('week', now() at time zone timezone) - interval '1 week'), 'IYYY-"W"IW') as week_key,
            ((date_trunc('week', now() at time zone timezone) - interval '1 week') at time zone timezone) as starts_at,
            (date_trunc('week', now() at time zone timezone) at time zone timezone) as ends_at,
            ((date_trunc('week', now() at time zone timezone) + interval '1 week') at time zone timezone) as spin_until
     from tenants where id = $1`, [tenantId], db);
}

/** Giro prévio: garante um número (1 a 100, sem repetição na semana) para cada empatado e devolve do maior para o menor. */
async function tiebreak(tenantId: string, weekKey: string, tied: WeekRow[], db: Queryable) {
  const ids = tied.map((t) => t.user_id);
  for (let attempt = 0; attempt < 30; attempt++) {
    const rolls = await query<{ user_id: string; roll: number }>(
      `select user_id, roll from wheel_tiebreaks where tenant_id = $1 and week_key = $2 and user_id = any($3::uuid[])`, [tenantId, weekKey, ids], db);
    if (rolls.length === ids.length) {
      const byId = Object.fromEntries(rolls.map((r) => [r.user_id, r.roll]));
      return tied.map((t) => ({ user_id: t.user_id, name: t.name, avatar_url: t.avatar_url, roll: byId[t.user_id] })).sort((a, b) => b.roll - a.roll);
    }
    const have = new Set(rolls.map((r) => r.user_id));
    // "on conflict do nothing" cobre tanto quem já tem número quanto número repetido: quem ficar sem tenta de novo.
    await query(
      `insert into wheel_tiebreaks (tenant_id, week_key, user_id, roll)
       select $1, $2, u, (floor(random() * 100) + 1)::int from unnest($3::uuid[]) u on conflict do nothing`,
      [tenantId, weekKey, ids.filter((i) => !have.has(i))], db);
  }
  throw conflict('Não foi possível desempatar a semana. Tente de novo.', 'tiebreak_failed');
}

export async function weekWinner(tenantId: string, db: Queryable = pool) {
  const w = (await weekContext(tenantId, db))!;
  const rows = (await weekStandings(tenantId, w.starts_at, w.ends_at, db)).filter((r) => r.coins > 0);
  const spin = await one(
    `select s.id, s.user_id, s.spun_at, s.delivered_at, s.status, s.multiplier, rw.title as reward_title, rw.description as reward_description, rw.effect as reward_effect
     from wheel_spins s join rewards rw on rw.id = s.reward_id where s.tenant_id = $1 and s.week_key = $2`, [tenantId, w.week_key], db);

  const top = rows[0] ?? null;
  const tied = top ? rows.filter((r) => r.coins === top.coins && r.givers === top.givers) : [];
  const rolls = tied.length > 1 ? await tiebreak(tenantId, w.week_key, tied, db) : [];
  let pick = rolls.length ? rows.find((r) => r.user_id === rolls[0].user_id)! : top;
  // Depois do giro, o vencedor é quem girou (mesmo que alguém tenha sido desativado desde então).
  if (spin) pick = rows.find((r) => r.user_id === spin.user_id) ?? pick;
  const winner = pick ? { user_id: pick.user_id, name: pick.name, avatar_url: pick.avatar_url, points: pick.coins, received: pick.received, givers: pick.givers } : null;

  // "Dobre e passe": se o último giro antes desta semana caiu na dobra, o prêmio desta vale em dobro
  // e a fatia de dobra sai da roleta (a dobra não acumula sobre si mesma).
  const last = await one<{ effect: string }>(
    `select rw.effect from wheel_spins s join rewards rw on rw.id = s.reward_id where s.tenant_id = $1 and s.week_key < $2 order by s.week_key desc limit 1`,
    [tenantId, w.week_key], db);
  const multiplier = last?.effect === 'double_next' ? 2 : 1;
  const all = await query<{ id: string; title: string; description: string | null; weight: number; effect: string }>(
    `select id, title, description, weight, effect from rewards where tenant_id = $1 and kind = 'wheel' and is_active and deleted_at is null order by sort_order, title`, [tenantId], db);
  const prizes = multiplier > 1 ? all.filter((p) => p.effect !== 'double_next') : all;
  return { week_key: w.week_key, starts_at: w.starts_at, ends_at: w.ends_at, spin_until: w.spin_until, winner, tiebreak: rolls, multiplier, spin, prizes };
}

export async function spin(tenantId: string, userId: string) {
  const out = await tx(async (db) => {
    await query(`select id from tenants where id = $1 for update`, [tenantId], db);
    const ctx = await weekWinner(tenantId, db);
    if (!ctx.winner) throw notFound('Ninguém recebeu moeda na semana passada, sem roleta desta vez');
    if (ctx.winner.user_id !== userId) throw forbidden(`Só ${ctx.winner.name.split(' ')[0]} pode girar esta semana`);
    if (ctx.spin) throw conflict('A roleta desta semana já foi girada', 'already_spun');
    if (!ctx.prizes.length) throw conflict('Nenhum prêmio cadastrado na roleta', 'no_prizes');
    const total = ctx.prizes.reduce((a, p) => a + p.weight, 0);
    let r = Math.random() * total; let chosen = ctx.prizes[0];
    for (const p of ctx.prizes) { r -= p.weight; if (r <= 0) { chosen = p; break; } }
    const cycle = await getOpenCycle(tenantId, db);
    // A dobra em si não tem o que entregar: já nasce resolvida.
    const s = await one(`insert into wheel_spins (tenant_id, cycle_id, week_key, user_id, reward_id, points, multiplier, status) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [tenantId, cycle?.id ?? null, ctx.week_key, userId, chosen.id, ctx.winner.points, ctx.multiplier, chosen.effect === 'double_next' ? 'delivered' : 'pending'], db);
    return { spin: s!, reward: chosen, multiplier: ctx.multiplier, index: ctx.prizes.findIndex((p) => p.id === chosen.id), prizes: ctx.prizes };
  });
  return out;
}

/** Avisa o vencedor da semana (job de segunda-feira). */
export async function notifyWeekWinner(tenantId: string) {
  const ctx = await weekWinner(tenantId);
  if (!ctx.winner || ctx.spin || !ctx.prizes.length) return;
  const { sentRecently } = await import('./notifications/index.js');
  if (await sentRecently(ctx.winner.user_id, 'wheel_winner', 24 * 6, { weekKey: ctx.week_key })) return;
  await notify(ctx.winner.user_id, 'wheel_winner', { points: ctx.winner.points, weekKey: ctx.week_key, double: ctx.multiplier > 1 });
}
