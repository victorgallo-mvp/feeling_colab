import { one, query, type Queryable } from '../db.js';
import { pool } from '../db.js';
import { notify } from './notifications/index.js';
import { weeklyStreaks } from './streak.js';

/** Conquistas não valem ponto: são visibilidade e progressão. Avaliadas após eventos-chave. */
export const CATALOG: Record<string, { label: string; emoji: string; description: string }> = {
  first_given: { label: 'Primeiro reconhecimento', emoji: '🌱', description: 'Deu o primeiro reconhecimento a um colega.' },
  first_mission: { label: 'Missão cumprida', emoji: '🎯', description: 'Teve a primeira missão validada.' },
  five_fans: { label: 'Cinco fãs', emoji: '🙌', description: 'Foi reconhecido por 5 pessoas diferentes.' },
  cross_area: { label: 'Ponte entre áreas', emoji: '🌉', description: 'Reconheceu pessoas de 3 áreas diferentes.' },
  all_in: { label: 'Mão aberta', emoji: '💸', description: 'Distribuiu 100% das moedas de uma temporada.' },
  streak_4: { label: 'Em chamas', emoji: '🔥', description: '4 semanas seguidas reconhecendo alguém.' },
  missions_5: { label: 'Executor', emoji: '⚙️', description: '5 missões validadas.' },
  champion: { label: 'Campeão da temporada', emoji: '🏆', description: 'Terminou uma temporada em 1º lugar.' },
  team_goal: { label: 'Time que joga junto', emoji: '🤝', description: 'Participou de uma temporada em que o time bateu a meta coletiva.' },
};

async function grant(tenantId: string, userId: string, key: string, cycleId: string | null, db: Queryable) {
  const r = await one(`insert into achievements (tenant_id, user_id, key, cycle_id) values ($1,$2,$3,$4) on conflict (user_id, key) do nothing returning id`, [tenantId, userId, key, cycleId], db);
  if (r) notify(userId, 'achievement', { key, label: CATALOG[key].label, emoji: CATALOG[key].emoji }).catch(() => {});
  return !!r;
}

/** Avalia conquistas "ao vivo" de um usuário (as de fechamento são dadas em closeCycle). */
export async function evaluateUser(tenantId: string, userId: string, db: Queryable = pool) {
  const have = new Set((await query<{ key: string }>(`select key from achievements where user_id = $1`, [userId], db)).map((r) => r.key));
  const need = (k: string) => !have.has(k);
  if (need('first_given') || need('cross_area')) {
    const g = await one<{ cnt: number; areas: number }>(
      `select count(*)::int cnt, count(distinct u.area_id)::int areas from recognitions r join users u on u.id = r.receiver_id where r.giver_id = $1 and r.deleted_at is null`, [userId], db);
    if (need('first_given') && g!.cnt >= 1) await grant(tenantId, userId, 'first_given', null, db);
    if (need('cross_area') && g!.areas >= 3) await grant(tenantId, userId, 'cross_area', null, db);
  }
  if (need('five_fans')) {
    const f = await one<{ cnt: number }>(`select count(distinct giver_id)::int cnt from recognitions where receiver_id = $1 and deleted_at is null`, [userId], db);
    if (f!.cnt >= 5) await grant(tenantId, userId, 'five_fans', null, db);
  }
  if (need('first_mission') || need('missions_5')) {
    const m = await one<{ cnt: number }>(`select count(*)::int cnt from mission_completions where user_id = $1 and status = 'approved' and deleted_at is null`, [userId], db);
    if (need('first_mission') && m!.cnt >= 1) await grant(tenantId, userId, 'first_mission', null, db);
    if (need('missions_5') && m!.cnt >= 5) await grant(tenantId, userId, 'missions_5', null, db);
  }
  if (need('streak_4')) {
    const s = await weeklyStreaks(tenantId, db);
    if ((s[userId] ?? 0) >= 4) await grant(tenantId, userId, 'streak_4', null, db);
  }
}

/** Conquistas de fechamento, a partir dos snapshots do ciclo. */
export async function evaluateCycleClose(tenantId: string, cycleId: string, teamGoalReached: boolean, db: Queryable) {
  const snaps = await query<{ user_id: string; rank: number; coins_unspent: number; met_participation: boolean }>(`select user_id, rank, coins_unspent, met_participation from cycle_user_snapshots where cycle_id = $1`, [cycleId], db);
  for (const s of snaps) {
    if (s.rank === 1) await grant(tenantId, s.user_id, 'champion', cycleId, db);
    if (s.coins_unspent === 0) await grant(tenantId, s.user_id, 'all_in', cycleId, db);
    if (teamGoalReached && s.met_participation) await grant(tenantId, s.user_id, 'team_goal', cycleId, db);
  }
}

export async function listForUser(userId: string, db: Queryable = pool) {
  const earned = await query<{ key: string; earned_at: Date }>(`select key, earned_at from achievements where user_id = $1 order by earned_at desc`, [userId], db);
  const map = Object.fromEntries(earned.map((e) => [e.key, e.earned_at]));
  return Object.entries(CATALOG).map(([key, c]) => ({ key, ...c, earned_at: map[key] ?? null }));
}
