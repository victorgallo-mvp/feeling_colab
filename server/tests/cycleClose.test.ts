import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { as, ensureOpenCycle, makeChip, makeTenant, makeUser, one, pool, query, resetDb } from './helpers.js';

describe('fechamento de ciclo', () => {
  let tenant: any, admin: any, a: any, b: any, c: any, chip: any, manager: any;

  beforeEach(async () => {
    await resetDb();
    ({ tenant } = await makeTenant({ coins: 20, cost: 5, maxPer: 3, goalPct: 50 }));
    admin = await makeUser(tenant.id, 'Admin', 'admin');
    manager = await makeUser(tenant.id, 'Manager', 'manager');
    a = await makeUser(tenant.id, 'Alice');
    b = await makeUser(tenant.id, 'Bob');
    c = await makeUser(tenant.id, 'Carol');
    chip = await makeChip(tenant.id);
  });
  afterAll(() => pool.end());

  it('gera snapshot, ranking, meta coletiva, zera placar e abre a próxima temporada', async () => {
    const cycle = await ensureOpenCycle(tenant.id);
    // Alice recebe 3 (15 pts), Bob recebe 1 (5 pts) e ganha missão (10)
    await as(b.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id, message: 'top' });
    await as(c.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id });
    await as(admin.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id });
    await as(a.token).post('/api/recognitions', { receiverId: b.id, chipId: chip.id });
    const m = (await as(manager.token).post('/api/missions', { title: 'Missão teste', points: 10, recurrence: 'once', scope: 'all' })).body;
    const comp = (await as(b.token).post(`/api/missions/${m.id}/complete`)).body;
    await as(manager.token).post(`/api/completions/${comp.id}/review`, { approve: true });
    const pendingComp = (await as(c.token).post(`/api/missions/${m.id}/complete`)).body; // fica pendente

    const notAdmin = await as(manager.token).post(`/api/cycles/${cycle.id}/close`);
    expect(notAdmin.status).toBe(403);

    const r = await as(admin.token).post(`/api/cycles/${cycle.id}/close`, { teamRewardNote: 'Pizza na sexta' });
    expect(r.status).toBe(200);
    expect(r.body.closed.status).toBe('closed');
    expect(r.body.closed.team_reward_note).toBe('Pizza na sexta');
    expect(r.body.next.status).toBe('open');
    expect(r.body.next.id).not.toBe(cycle.id);
    expect(new Date(r.body.next.ends_at).getTime()).toBeGreaterThan(Date.now());

    const snaps = await query(`select * from cycle_user_snapshots where cycle_id = $1 order by rank, points_total desc`, [cycle.id]);
    expect(snaps.length).toBe(5);
    const sa = snaps.find((s) => s.user_id === a.id);
    const sb = snaps.find((s) => s.user_id === b.id);
    expect(sa.points_total).toBe(15); expect(sa.rank).toBe(1); expect(sa.recognitions_received).toBe(3);
    expect(sa.coins_given).toBe(5); expect(sa.coins_unspent).toBe(15);
    expect(sb.points_total).toBe(15); expect(sb.rank).toBe(1); // empate = mesma posição
    expect(sb.points_missions).toBe(10); expect(sb.missions_completed).toBe(1);
    expect(sa.received_by_chip[chip.id]).toBe(3);

    // pendente no ciclo fechado é recusado automaticamente
    const pc = await one(`select status from mission_completions where id = $1`, [pendingComp.id]);
    expect(pc!.status).toBe('rejected');

    // placar zerado na nova temporada
    const home = await as(a.token).get('/api/me/home');
    expect(home.body.cycle.id).toBe(r.body.next.id);
    expect(home.body.me.points_total).toBe(0);
    expect(home.body.me.balance).toBe(20);
    expect(home.body.colleagues.every((x: any) => x.given_count === 0)).toBe(true);

    // histórico consultável
    const summary = await as(a.token).get(`/api/cycles/${cycle.id}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.cycle.status).toBe('closed');
    expect(summary.body.ranking[0].points_total).toBe(15);
    expect(summary.body.recognitions_by_user[a.id].length).toBe(3);
    expect(summary.body.ranking[0].individual_reward_note).toBeUndefined(); // não-admin não vê

    // não fecha duas vezes
    const again = await as(admin.token).post(`/api/cycles/${cycle.id}/close`);
    expect(again.status).toBe(409);
  });

  it('calcula a meta coletiva de participação com os mínimos do ciclo', async () => {
    const cycle = await ensureOpenCycle(tenant.id);
    // ninguém atinge >=3 dados + >=1 missão
    const r = await as(admin.token).post(`/api/cycles/${cycle.id}/close`);
    expect(r.body.participation.reached).toBe(false);
    expect(r.body.participation.pct).toBe(0);
    expect(r.body.closed.team_goal_reached).toBe(false);
  });

  it('admin registra prêmio individual após o fechamento', async () => {
    const cycle = await ensureOpenCycle(tenant.id);
    const before = await as(admin.token).patch(`/api/cycles/${cycle.id}/rewards/${a.id}`, { note: 'Vale 200' });
    expect(before.status).toBe(404); // ainda sem snapshot
    await as(admin.token).post(`/api/cycles/${cycle.id}/close`);
    const after = await as(admin.token).patch(`/api/cycles/${cycle.id}/rewards/${a.id}`, { note: 'Vale 200' });
    expect(after.status).toBe(200);
    expect(after.body.individual_reward_note).toBe('Vale 200');
    const summary = await as(admin.token).get(`/api/cycles/${cycle.id}/summary`);
    expect(summary.body.ranking.find((x: any) => x.user_id === a.id).individual_reward_note).toBe('Vale 200');
  });

  it('mudança de regra no tenant só vale na próxima temporada', async () => {
    const cycle = await ensureOpenCycle(tenant.id);
    await as(admin.token).patch('/api/admin/settings', { coinsPerCycle: 30, recognitionCost: 10 });
    const cur = await as(a.token).get('/api/me/home');
    expect(cur.body.cycle.coins_per_user).toBe(20);
    await as(admin.token).post(`/api/cycles/${cycle.id}/close`);
    const next = await as(a.token).get('/api/me/home');
    expect(next.body.cycle.coins_per_user).toBe(30);
    expect(next.body.cycle.recognition_cost).toBe(10);
  });
});
