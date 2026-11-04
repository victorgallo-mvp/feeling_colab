import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool, query, one } from '../src/db.js';
import { signAccessToken } from '../src/middleware/auth.js';
import { ensureOpenCycle } from '../src/services/cycles.js';

export const app = createApp();

export async function resetDb() {
  await query(`truncate audit_log, notifications, push_subscriptions, cycle_user_snapshots, mission_completions, missions, mission_templates, reactions, recognitions, chips, cycles, sessions, magic_links, users, areas, tenants cascade`);
}

export async function makeTenant(overrides: Partial<{ coins: number; cost: number; maxPer: number; goalPct: number }> = {}) {
  const t = await one(
    `insert into tenants (slug, name, coins_per_cycle, recognition_cost, max_per_receiver_per_cycle, goal_participation_pct) values ($1,$2,$3,$4,$5,$6) returning *`,
    ['t-' + Math.random().toString(36).slice(2, 8), 'Teste', overrides.coins ?? 20, overrides.cost ?? 5, overrides.maxPer ?? 3, overrides.goalPct ?? 80]);
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

export const as = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url: string, body?: any) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  patch: (url: string, body?: any) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  delete: (url: string, body?: any) => request(app).delete(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
});

export { pool, query, one, ensureOpenCycle };
