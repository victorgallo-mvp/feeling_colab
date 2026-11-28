import { one, query, type Queryable } from '../db.js';

const DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
/** "sexta às 15h" */
export const lockLabel = (dow: number, hour: number) => `${DAYS[dow - 1]} às ${hour}h`;

/**
 * Semana corrente (segunda 00:00 a domingo 23:59) no fuso do tenant.
 * Com trava configurada (coins_lock_dow/hour), `locks_at` é o instante em que as moedas da semana fecham
 * e `locked` diz se já fechou; a trava cai sozinha na virada da semana.
 */
export async function currentWeek(tenantId: string, db: Queryable) {
  const w = await one<{ week_key: string; starts_at: Date; ends_at: Date; locks_at: Date | null; locked: boolean; lock_dow: number | null; lock_hour: number }>(
    `select week_key, starts_at, ends_at, locks_at, (locks_at is not null and now() >= locks_at) as locked, lock_dow, lock_hour
     from (
       select to_char(wk, 'IYYY-"W"IW') as week_key,
              (wk at time zone timezone) as starts_at,
              ((wk + interval '1 week') at time zone timezone) as ends_at,
              case when coins_per_week > 0 and coins_lock_dow is not null and (coins_lock_from is null or wk::date >= coins_lock_from)
                   then ((wk + (coins_lock_dow - 1) * interval '1 day' + coins_lock_hour * interval '1 hour') at time zone timezone) end as locks_at,
              coins_lock_dow as lock_dow, coins_lock_hour as lock_hour
       from (select t.*, date_trunc('week', now() at time zone t.timezone) as wk from tenants t where t.id = $1) x
     ) y`, [tenantId], db);
  return w!;
}

/** Moedas dadas pela pessoa na semana corrente. As moedas zeram toda segunda: nada acumula. */
export async function weekSpent(tenantId: string, giverId: string, db: Queryable) {
  const w = await currentWeek(tenantId, db);
  const r = await one<{ spent: number; cnt: number }>(
    `select coalesce(sum(coins_spent),0)::int as spent, count(*)::int as cnt from recognitions
     where tenant_id = $1 and giver_id = $2 and deleted_at is null and created_at >= $3 and created_at < $4`,
    [tenantId, giverId, w.starts_at, w.ends_at], db);
  return { spent: r!.spent, given: r!.cnt, locked: w.locked, lockLabel: w.locks_at && w.lock_dow ? lockLabel(w.lock_dow, w.lock_hour) : null };
}

export interface WeekRow { user_id: string; name: string; avatar_url: string | null; coins: number; received: number; givers: number }

/**
 * Moedas recebidas num intervalo, só de reconhecimentos (missões não contam).
 * Ordem do deck: mais moedas; no empate, mais colegas diferentes.
 */
export async function weekStandings(tenantId: string, from: Date, to: Date, db: Queryable): Promise<WeekRow[]> {
  return query<WeekRow>(
    `select u.id as user_id, u.name, u.avatar_url,
       coalesce(r.coins,0)::int as coins, coalesce(r.cnt,0)::int as received, coalesce(r.givers,0)::int as givers
     from users u
     left join (select receiver_id, sum(points_awarded) coins, count(*) cnt, count(distinct giver_id) givers from recognitions
                where tenant_id = $1 and deleted_at is null and created_at >= $2 and created_at < $3 group by receiver_id) r on r.receiver_id = u.id
     where u.tenant_id = $1 and u.deleted_at is null and u.is_active
     order by coins desc, givers desc, u.name asc`, [tenantId, from, to], db);
}

/** Posição com empate: mesmas moedas e mesmos colegas diferentes = mesma posição. */
export function ranked(rows: WeekRow[]) {
  let rank = 0, seen = 0, last = '';
  return rows.map((r) => { seen++; const k = `${r.coins}/${r.givers}`; if (k !== last) { rank = seen; last = k; } return { ...r, rank }; });
}
