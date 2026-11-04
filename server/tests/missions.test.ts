import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { as, makeTenant, makeUser, one, pool, resetDb } from './helpers.js';

describe('missões e validação', () => {
  let tenant: any, area: any, manager: any, otherManager: any, admin: any, member: any;

  beforeEach(async () => {
    await resetDb();
    ({ tenant, area } = await makeTenant());
    admin = await makeUser(tenant.id, 'Admin', 'admin');
    manager = await makeUser(tenant.id, 'Manager', 'manager');
    otherManager = await makeUser(tenant.id, 'Other Manager', 'manager');
    member = await makeUser(tenant.id, 'Member', 'member', area.id);
  });
  afterAll(() => pool.end());

  async function createMission(body: any = {}) {
    const r = await as(manager.token).post('/api/missions', { title: 'Atualizar board', points: 10, recurrence: 'weekly', scope: 'all', ...body });
    expect(r.status).toBe(201);
    return r.body;
  }

  it('colaborador não cria missão', async () => {
    const r = await as(member.token).post('/api/missions', { title: 'x'.repeat(5), points: 10, recurrence: 'weekly' });
    expect(r.status).toBe(403);
  });

  it('crédito de pontos só após aprovação do gestor criador', async () => {
    const m = await createMission();
    const c = await as(member.token).post(`/api/missions/${m.id}/complete`);
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('pending');

    let home = await as(member.token).get('/api/me/home');
    expect(home.body.me.points_missions).toBe(0);
    expect(home.body.missions.find((x: any) => x.id === m.id).completion_status).toBe('pending');

    // outro gestor (não criador) não valida
    const forb = await as(otherManager.token).post(`/api/completions/${c.body.id}/review`, { approve: true });
    expect(forb.status).toBe(403);

    // fila do criador tem o item
    const queue = await as(manager.token).get('/api/completions/pending');
    expect(queue.body.map((x: any) => x.id)).toContain(c.body.id);

    const ok = await as(manager.token).post(`/api/completions/${c.body.id}/review`, { approve: true });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
    expect(ok.body.points_awarded).toBe(10);

    home = await as(member.token).get('/api/me/home');
    expect(home.body.me.points_missions).toBe(10);
    expect(home.body.me.points_total).toBe(10);
    expect(home.body.me.missions_completed).toBe(1);
  });

  it('recusa não credita e permite reenviar; aprovação não se repete', async () => {
    const m = await createMission();
    const c = await as(member.token).post(`/api/missions/${m.id}/complete`);
    const rej = await as(manager.token).post(`/api/completions/${c.body.id}/review`, { approve: false, note: 'Faltou o cliente X' });
    expect(rej.body.status).toBe('rejected');
    expect(rej.body.points_awarded).toBe(0);
    const again = await as(manager.token).post(`/api/completions/${c.body.id}/review`, { approve: true });
    expect(again.status).toBe(409);

    const resend = await as(member.token).post(`/api/missions/${m.id}/complete`);
    expect(resend.status).toBe(201);
    expect(resend.body.id).toBe(c.body.id);
    expect(resend.body.status).toBe('pending');
  });

  it('"Concluí" é idempotente por período', async () => {
    const m = await createMission();
    await as(member.token).post(`/api/missions/${m.id}/complete`);
    const dup = await as(member.token).post(`/api/missions/${m.id}/complete`);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('already_completed');
  });

  it('missão de área só aparece para quem é da área; admin valida qualquer', async () => {
    const m = await createMission({ scope: 'area', areaId: area.id });
    const outsider = await makeUser(tenant.id, 'Outsider');
    const list = await as(outsider.token).get('/api/missions');
    expect(list.body.find((x: any) => x.id === m.id)).toBeUndefined();
    const denied = await as(outsider.token).post(`/api/missions/${m.id}/complete`);
    expect(denied.status).toBe(404);

    const c = await as(member.token).post(`/api/missions/${m.id}/complete`);
    const ok = await as(admin.token).post(`/api/completions/${c.body.id}/review`, { approve: true });
    expect(ok.status).toBe(200);
  });

  it('templates ficam disponíveis (globais + do tenant)', async () => {
    await one(`insert into mission_templates (tenant_id, title, points, recurrence) values (null, 'Global', 5, 'weekly')`);
    await one(`insert into mission_templates (tenant_id, title, points, recurrence) values ($1, 'Do tenant', 5, 'monthly')`, [tenant.id]);
    const t = await as(manager.token).get('/api/missions/templates');
    expect(t.body.map((x: any) => x.title).sort()).toEqual(['Do tenant', 'Global']);
  });
});
