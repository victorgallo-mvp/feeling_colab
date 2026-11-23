import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query, one } from '../src/db.js';
import { signAccessToken } from '../src/middleware/auth.js';
import { ensureOpenCycle } from '../src/services/cycles.js';

export const app = createApp();

export async function resetDb() {
  // Dar uma moeda dispara trabalho assíncrono depois da resposta (conquistas, notificação). Se ele ainda estiver
  // rodando do teste anterior, o truncate pode entrar em deadlock com ele: nesse caso, tenta de novo.
  for (let attempt = 0; ; attempt++) {
    try {
      await query(`truncate audit_log, notifications, push_subscriptions, cycle_user_snapshots, mission_completions, missions, mission_templates, reactions, recognitions, chips, cycles, sessions, magic_links, users, areas, tenants cascade`);
      return;
    } catch (e: any) {
      if (e?.code !== '40P01' || attempt >= 5) throw e;
    }
  }
}

export async function makeTenant(overrides: Partial<{ coins: number; cost: number; maxPer: number; goalPct: number; perWeek: number; minMessage: number }> = {}) {
  const t = await one(
    `insert into tenants (slug, name, coins_per_cycle, recognition_cost, max_per_receiver_per_cycle, goal_participation_pct, coins_per_week, message_min_chars) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    ['t-' + Math.random().toString(36).slice(2, 8), 'Teste', overrides.coins ?? 20, overrides.cost ?? 5, overrides.maxPer ?? 3, overrides.goalPct ?? 80, overrides.perWeek ?? 0, overrides.minMessage ?? 0]);
  const area = await one(`insert into areas (tenant_id, name) values ($1,'Geral') returning *`, [t!.id]);
  return { tenant: t!, area: area! };
}

export async function makeUser(tenantId: string, name: string, role: 'member' | 'manager' | 'admin' = 'member', areaId: string | null = null) {
  const u = await one(`insert into users (tenant_id, email, name, role, area_id) values ($1,$2,$3,$4,$5) returning *`, [tenantId, `${name.toLowerCase().replace(/\s/g, '')}-${Math.random().toString(36).slice(2, 6)}@t.dev`, name, role, areaId]);
  return { ...u!, token: signAccessToken(u!) };
}

export async function makeChip(tenantId: string, label = 'Mandou bem') {
  return (await one(`insert into chips (tenant_id, label) values ($1,$2) returning *`, [tenantId, label]))!;
}

/** Tenant nas regras do Feel Good: 5 moedas por semana, 1 moeda por reconhecimento, justificativa obrigatória. */
export const makeFeelGoodTenant = () => makeTenant({ coins: 0, cost: 1, maxPer: 0, perWeek: 5, minMessage: 10 });

/** Moeda datada (por padrão, na semana passada), direto no banco. */
export async function coinAt(tenantId: string, giverId: string, receiverId: string, daysAgo = 7, message = 'ajudou muito na entrega') {
  await query(
    `insert into recognitions (tenant_id, cycle_id, giver_id, receiver_id, message, coins_spent, points_awarded, created_at)
     select $1, id, $2, $3, $4, 1, 1, now() - ($5::int * interval '1 day') from cycles where tenant_id = $1 and status = 'open'`,
    [tenantId, giverId, receiverId, message, daysAgo]);
}

export const as = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string, body?: any) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  patch: (url: string, body?: any) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  delete: (url: string, body?: any) => request(app).delete(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
});

export { pool, query, one, ensureOpenCycle };
