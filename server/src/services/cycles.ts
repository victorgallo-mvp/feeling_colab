import type pg from 'pg';
import { one, query, tx, type Queryable } from '../db.js';
import { conflict, notFound } from '../errors.js';
import { audit } from './audit.js';
import { notify } from './notifications/index.js';
import { evaluateCycleClose } from './achievements.js';

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export interface Cycle {
  id: string; tenant_id: string; name: string; starts_at: Date; ends_at: Date; status: 'open' | 'closed';
  coins_per_user: number; recognition_cost: number; max_per_receiver: number;
  goal_participation_pct: number; goal_min_recognitions: number; goal_min_missions: number;
  closed_at: Date | null; team_goal_reached: boolean | null; participation_pct: number | null; team_reward_note: string | null;
}

export async function getOpenCycle(tenantId: string, db: Queryable): Promise<Cycle | null> {
  return one<Cycle>(`select * from cycles where tenant_id = $1 and status = 'open' and deleted_at is null`, [tenantId], db);
}

/** Limites do mês (no fuso do tenant) que contém `ref`, deslocado `offsetMonths`. */
async function monthRange(tz: string, ref: Date, offsetMonths: number, db: Queryable) {
  const row = await one<{ starts_at: Date; ends_at: Date; month: number; year: number }>(
    `with base as (
       select (date_trunc('month', ($1::timestamptz at time zone $2)) + ($3::int * interval '1 month')) as m
     )
     select (m at time zone $2) as starts_at,
            ((m + interval '1 month') at time zone $2) as ends_at,
            extract(month from m)::int as month,
            extract(year from m)::int as year
     from base`,
    [ref, tz, offsetMonths], db,
  );
  return row!;
}

export function cycleName(month: number, year: number, now = new Date()) {
  const sameYear = now.getFullYear() === year;
  return `Temporada ${MONTHS[month - 1]}${sameYear ? '' : ' ' + year}`;
}

async function createCycle(tenantId: string, startsAt: Date, endsAt: Date, name: string, db: Queryable): Promise<Cycle> {
  const t = await one(`select * from tenants where id = $1`, [tenantId], db);
  if (!t) throw notFound('Tenant não encontrado');
  const c = await one<Cycle>(
    `insert into cycles (tenant_id, name, starts_at, ends_at, coins_per_user, recognition_cost, max_per_receiver,
       goal_participation_pct, goal_min_recognitions, goal_min_missions)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [tenantId, name, startsAt, endsAt, t.coins_per_cycle, t.recognition_cost, t.max_per_receiver_per_cycle,
     t.goal_participation_pct, t.goal_min_recognitions, t.goal_min_missions], db,
  );
  return c!;
}

/** Garante um ciclo aberto; se não houver, abre o do mês corrente. */
export async function ensureOpenCycle(tenantId: string, db: Queryable = (null as any)): Promise<Cycle> {
  if (!db) return tx((c) => ensureOpenCycle(tenantId, c));
  const existing = await getOpenCycle(tenantId, db);
  if (existing) return existing;
  const t = await one(`select timezone from tenants where id = $1`, [tenantId], db);
  const r = await monthRange(t.timezone, new Date(), 0, db);
  return createCycle(tenantId, r.starts_at, r.ends_at, cycleName(r.month, r.year), db);
}

export interface UserCycleStats {
  user_id: string; name: string; avatar_url: string | null; area_id: string | null; area_name: string | null; role: string;
  coins_given: number; recognitions_given: number; recognitions_received: number;
  points_recognition: number; points_missions: number; missions_completed: number; points_total: number;
}

export async function cycleStats(cycle: Cycle, db: Queryable): Promise<UserCycleStats[]> {
  return query<UserCycleStats>(
    `select u.id as user_id, u.name, u.avatar_url, u.area_id, a.name as area_name, u.role,
       coalesce(g.coins_given,0)::int as coins_given,
       coalesce(g.cnt,0)::int as recognitions_given,
       coalesce(r.cnt,0)::int as recognitions_received,
       coalesce(r.points,0)::int as points_recognition,
       coalesce(m.points,0)::int as points_missions,
       coalesce(m.cnt,0)::int as missions_completed,
       (coalesce(r.points,0) + coalesce(m.points,0))::int as points_total
     from users u
     left join areas a on a.id = u.area_id
     left join (select giver_id, sum(coins_spent) coins_given, count(*) cnt from recognitions where cycle_id = $1 and deleted_at is null group by giver_id) g on g.giver_id = u.id
     left join (select receiver_id, sum(points_awarded) points, count(*) cnt from recognitions where cycle_id = $1 and deleted_at is null group by receiver_id) r on r.receiver_id = u.id
     left join (select user_id, sum(points_awarded) points, count(*) cnt from mission_completions where cycle_id = $1 and status = 'approved' and deleted_at is null group by user_id) m on m.user_id = u.id
     where u.tenant_id = $2 and u.deleted_at is null and u.is_active
     order by points_total desc, recognitions_received desc, u.name asc`,
    [cycle.id, cycle.tenant_id], db,
  );
}

export function participation(cycle: Cycle, stats: UserCycleStats[]) {
  const met = stats.filter((s) => s.recognitions_given >= cycle.goal_min_recognitions && s.missions_completed >= cycle.goal_min_missions);
  const pct = stats.length ? Math.round((met.length / stats.length) * 10000) / 100 : 0;
  return { met: met.length, total: stats.length, pct, reached: pct >= cycle.goal_participation_pct };
}

export async function closeCycle(tenantId: string, cycleId: string, actorId: string, teamRewardNote?: string) {
  const result = await tx(async (db) => {
    const cycle = await one<Cycle>(`select * from cycles where id = $1 and tenant_id = $2 and deleted_at is null for update`, [cycleId, tenantId], db);
    if (!cycle) throw notFound('Ciclo não encontrado');
    if (cycle.status !== 'open') throw conflict('Ciclo já fechado', 'cycle_closed');

    const stats = await cycleStats(cycle, db);
    const part = participation(cycle, stats);

    // ranking: empate = mesma posição
    let rank = 0, last = -1, seen = 0;
    for (const s of stats) {
      seen++;
      if (s.points_total !== last) { rank = seen; last = s.points_total; }
      const byChip = await query<{ chip_id: string; cnt: number }>(
        `select chip_id, count(*) cnt from recognitions where cycle_id = $1 and receiver_id = $2 and deleted_at is null group by chip_id`,
        [cycle.id, s.user_id], db,
      );
      const received_by_chip: Record<string, number> = {};
      for (const b of byChip) if (b.chip_id) received_by_chip[b.chip_id] = b.cnt;
      await query(
        `insert into cycle_user_snapshots (tenant_id, cycle_id, user_id, coins_given, coins_unspent, recognitions_given, recognitions_received,
           points_recognition, points_missions, points_total, missions_completed, rank, met_participation, received_by_chip)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [tenantId, cycle.id, s.user_id, s.coins_given, Math.max(0, cycle.coins_per_user - s.coins_given), s.recognitions_given,
         s.recognitions_received, s.points_recognition, s.points_missions, s.points_total, s.missions_completed, rank,
         s.recognitions_given >= cycle.goal_min_recognitions && s.missions_completed >= cycle.goal_min_missions,
         JSON.stringify(received_by_chip)], db,
      );
    }

    // completions pendentes no ciclo fechado são recusadas automaticamente (não há mais o que creditar)
    await query(
      `update mission_completions set status = 'rejected', review_note = coalesce(review_note, 'Ciclo encerrado sem validação'), reviewed_at = now(), updated_at = now()
       where cycle_id = $1 and status = 'pending' and deleted_at is null`, [cycle.id], db,
    );

    const closed = await one<Cycle>(
      `update cycles set status = 'closed', closed_at = now(), closed_by = $2, team_goal_reached = $3, participation_pct = $4,
         team_reward_note = coalesce($5, team_reward_note), updated_at = now() where id = $1 returning *`,
      [cycle.id, actorId, part.reached, part.pct, teamRewardNote ?? null], db,
    );

    // abre a próxima temporada: mês seguinte ao do ciclo fechado, ou o mês atual se já passou
    const t = await one(`select timezone from tenants where id = $1`, [tenantId], db);
    let r = await monthRange(t.timezone, cycle.starts_at, 1, db);
    const now = new Date();
    if (r.ends_at <= now) r = await monthRange(t.timezone, now, 0, db);
    const startsAt = r.starts_at > now ? r.starts_at : now;
    const next = await createCycle(tenantId, startsAt, r.ends_at, cycleName(r.month, r.year), db);

    await evaluateCycleClose(tenantId, cycle.id, part.reached, db);

    await audit(db, { tenantId, actorId, action: 'cycle.close', entity: 'cycle', entityId: cycle.id, after: { participation: part, next_cycle_id: next.id } });
    return { closed: closed!, next, stats, participation: part };
  });

  const users = await query(`select id from users where tenant_id = $1 and deleted_at is null and is_active`, [tenantId]);
  for (const u of users) {
    notify(u.id, 'cycle_closed', { cycleName: result.closed.name, nextName: result.next.name, teamGoal: result.participation.reached, cycleId: result.closed.id }).catch(() => {});
  }
  return result;
}

export async function cycleSummary(tenantId: string, cycleId: string, db: Queryable) {
  const cycle = await one<Cycle>(`select * from cycles where id = $1 and tenant_id = $2 and deleted_at is null`, [cycleId, tenantId], db);
  if (!cycle) throw notFound('Ciclo não encontrado');
  const chips = await query(`select id, label, emoji, color from chips where tenant_id = $1`, [tenantId], db);
  const chipMap = Object.fromEntries(chips.map((c) => [c.id, c]));

  let ranking: any[];
  if (cycle.status === 'closed') {
    ranking = await query(
      `select s.*, u.name, u.avatar_url, u.area_id, a.name as area_name, u.role from cycle_user_snapshots s
       join users u on u.id = s.user_id left join areas a on a.id = u.area_id
       where s.cycle_id = $1 order by s.rank asc, u.name asc`, [cycle.id], db,
    );
  } else {
    const stats = await cycleStats(cycle, db);
    let rank = 0, last = -1, seen = 0;
    ranking = [];
    for (const s of stats) {
      seen++;
      if (s.points_total !== last) { rank = seen; last = s.points_total; }
      const byChip = await query<{ chip_id: string; cnt: number }>(
        `select chip_id, count(*) cnt from recognitions where cycle_id = $1 and receiver_id = $2 and deleted_at is null group by chip_id`,
        [cycle.id, s.user_id], db,
      );
      ranking.push({
        ...s, rank, coins_unspent: Math.max(0, cycle.coins_per_user - s.coins_given),
        met_participation: s.recognitions_given >= cycle.goal_min_recognitions && s.missions_completed >= cycle.goal_min_missions,
        received_by_chip: Object.fromEntries(byChip.filter((b) => b.chip_id).map((b) => [b.chip_id, b.cnt])), individual_reward_note: null,
      });
    }
  }

  const recognitions = await query(
    `select r.id, r.giver_id, g.name as giver_name, r.receiver_id, r.chip_id, r.message, r.created_at
     from recognitions r join users g on g.id = r.giver_id where r.cycle_id = $1 and r.deleted_at is null order by r.created_at desc`,
    [cycle.id], db,
  );
  const byUser: Record<string, any[]> = {};
  for (const r of recognitions) (byUser[r.receiver_id] ??= []).push({ ...r, chip: chipMap[r.chip_id] ?? null });

  const stats = cycle.status === 'closed' ? ranking : await cycleStats(cycle, db);
  const part = cycle.status === 'closed'
    ? { met: ranking.filter((r) => r.met_participation).length, total: ranking.length, pct: cycle.participation_pct ?? 0, reached: !!cycle.team_goal_reached }
    : participation(cycle, stats as UserCycleStats[]);

  return {
    cycle,
    participation: part,
    ranking: ranking.map((r) => ({ ...r, received_by_chip_detail: Object.entries(r.received_by_chip ?? {}).map(([id, n]) => ({ chip: chipMap[id] ?? null, count: n })) })),
    recognitions_by_user: byUser,
  };
}

export async function inactiveUsers(tenantId: string, days: number, db: Queryable) {
  return query(
    `select u.id, u.name, u.avatar_url, u.role, a.name as area_name,
       greatest(coalesce(u.last_seen_at, 'epoch'), coalesce(r.last, 'epoch'), coalesce(m.last, 'epoch'), coalesce(x.last, 'epoch')) as last_activity_at
     from users u left join areas a on a.id = u.area_id
     left join (select giver_id, max(created_at) last from recognitions where deleted_at is null group by giver_id) r on r.giver_id = u.id
     left join (select user_id, max(created_at) last from mission_completions where deleted_at is null group by user_id) m on m.user_id = u.id
     left join (select user_id, max(created_at) last from reactions where deleted_at is null group by user_id) x on x.user_id = u.id
     where u.tenant_id = $1 and u.deleted_at is null and u.is_active
       and greatest(coalesce(u.last_seen_at, 'epoch'), coalesce(r.last, 'epoch'), coalesce(m.last, 'epoch'), coalesce(x.last, 'epoch')) < now() - ($2::int * interval '1 day')
     order by last_activity_at asc`,
    [tenantId, days], db,
  );
}

export type Tx = pg.PoolClient;
