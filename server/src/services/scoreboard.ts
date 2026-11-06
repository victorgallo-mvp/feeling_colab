import { query, type Queryable } from '../db.js';
import { cycleStats, ensureOpenCycle, participation } from './cycles.js';
import { giverBalance } from './recognition.js';
import { feed } from './recognition.js';
import { listForUser, pendingQueue } from './missions.js';
import { pool } from '../db.js';
import type { AuthUser } from '../middleware/auth.js';
import { weeklyStreaks } from './streak.js';
import { weekWinner } from './wheel.js';

export async function activeChips(tenantId: string, db: Queryable) {
  return query(
    `select id, label, emoji, color, sort_order from chips where tenant_id = $1 and deleted_at is null and valid_from <= now() and (valid_until is null or valid_until > now()) order by sort_order, label`,
    [tenantId], db,
  );
}

/** Payload único da tela principal. */
export async function homePayload(user: AuthUser) {
  const db = pool;
  const cycle = await ensureOpenCycle(user.tenantId);
  const [stats, chips, colleagues, missions, feedRows, bal, pairCounts, streaks, rewards, wheel] = await Promise.all([
    cycleStats(cycle, db),
    activeChips(user.tenantId, db),
    query(
      `select u.id, u.name, u.avatar_url, u.role, a.name as area_name from users u left join areas a on a.id = u.area_id
       where u.tenant_id = $1 and u.deleted_at is null and u.is_active and u.id <> $2 order by u.name`, [user.tenantId, user.id], db),
    listForUser(user.tenantId, user.id, user.areaId, db),
    feed(user.tenantId, user.id, cycle.id, 30),
    giverBalance(cycle, user.id, db),
    query(`select receiver_id, count(*)::int cnt from recognitions where cycle_id = $1 and giver_id = $2 and deleted_at is null group by receiver_id`, [cycle.id, user.id], db),
    weeklyStreaks(user.tenantId, db),
    query(`select id, title, description, kind from rewards where tenant_id = $1 and is_active and deleted_at is null and kind in ('individual','team') order by kind, sort_order, title`, [user.tenantId], db),
    weekWinner(user.tenantId, db),
  ]);
  // ranking ao vivo, visível para todos (empate = mesma posição)
  let rank = 0, last = -1, seen = 0;
  const ranking = stats.map((s) => { seen++; if (s.points_total !== last) { rank = seen; last = s.points_total; } return { user_id: s.user_id, name: s.name, avatar_url: s.avatar_url, area_name: s.area_name, rank, points_total: s.points_total, recognitions_received: s.recognitions_received, missions_completed: s.missions_completed, streak: streaks[s.user_id] ?? 0 }; });
  const me = stats.find((s) => s.user_id === user.id);
  const part = participation(cycle, stats);
  const pair = Object.fromEntries(pairCounts.map((p) => [p.receiver_id, p.cnt]));
  const queue = user.role === 'member' ? [] : await pendingQueue(user.tenantId, user, db);

  const now = Date.now();
  const total = +new Date(cycle.ends_at) - +new Date(cycle.starts_at);
  const elapsed = Math.min(Math.max(now - +new Date(cycle.starts_at), 0), total);

  return {
    cycle: {
      id: cycle.id, name: cycle.name, starts_at: cycle.starts_at, ends_at: cycle.ends_at,
      progress_pct: total > 0 ? Math.round((elapsed / total) * 100) : 0,
      coins_per_user: cycle.coins_per_user, recognition_cost: cycle.recognition_cost, max_per_receiver: cycle.max_per_receiver,
      goal: { pct: cycle.goal_participation_pct, min_recognitions: cycle.goal_min_recognitions, min_missions: cycle.goal_min_missions },
    },
    me: {
      balance: bal.balance, given: bal.given,
      points_total: me?.points_total ?? 0, points_recognition: me?.points_recognition ?? 0, points_missions: me?.points_missions ?? 0,
      recognitions_received: me?.recognitions_received ?? 0, missions_completed: me?.missions_completed ?? 0,
      met_participation: !!me && me.recognitions_given >= cycle.goal_min_recognitions && me.missions_completed >= cycle.goal_min_missions,
      streak: streaks[user.id] ?? 0,
      rank: ranking.find((r) => r.user_id === user.id)?.rank ?? null,
    },
    ranking,
    rewards,
    wheel: { ...wheel, can_spin: !!wheel.winner && wheel.winner.user_id === user.id && !wheel.spin && wheel.prizes.length > 0 },
    team: part,
    colleagues: colleagues.map((c) => ({ ...c, given_count: pair[c.id] ?? 0, can_receive: cycle.max_per_receiver <= 0 || (pair[c.id] ?? 0) < cycle.max_per_receiver })),
    chips,
    missions,
    feed: feedRows,
    queue,
  };
}
