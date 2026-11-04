import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { as, ensureOpenCycle, makeChip, makeTenant, makeUser, one, pool, query, resetDb } from './helpers.js';

describe('ranking, conquistas e roleta', () => {
  let tenant: any, admin: any, a: any, b: any, c: any, chip: any;
  beforeEach(async () => {
    await resetDb();
    ({ tenant } = await makeTenant());
    admin = await makeUser(tenant.id, 'Admin', 'admin');
    a = await makeUser(tenant.id, 'Alice'); b = await makeUser(tenant.id, 'Bob'); c = await makeUser(tenant.id, 'Carol');
    chip = await makeChip(tenant.id);
    await ensureOpenCycle(tenant.id);
  });
  afterAll(() => pool.end());

  it('ranking ao vivo aparece pra qualquer colaborador, com a própria posição', async () => {
    await as(b.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id });
    await as(c.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id });
    await as(a.token).post('/api/recognitions', { receiverId: b.id, chipId: chip.id });
    const home = await as(c.token).get('/api/me/home');
    expect(home.body.ranking[0].user_id).toBe(a.id);
    expect(home.body.ranking[0].rank).toBe(1);
    expect(home.body.ranking.find((r: any) => r.user_id === b.id).rank).toBe(2);
    expect(home.body.me.rank).toBe(3); // Carol empatada em 0 com Admin → posição 3
    expect(home.body.ranking.length).toBe(4);
  });

  it('conquistas: primeiro reconhecimento dado, sequência e perfil público', async () => {
    await as(a.token).post('/api/recognitions', { receiverId: b.id, chipId: chip.id });
    await new Promise((r) => setTimeout(r, 150)); // avaliação é assíncrona
    const prof = await as(c.token).get(`/api/users/${a.id}/profile`);
    expect(prof.status).toBe(200);
    expect(prof.body.achievements.find((x: any) => x.key === 'first_given').earned_at).not.toBeNull();
    expect(prof.body.achievements.find((x: any) => x.key === 'champion').earned_at).toBeNull();
    expect(prof.body.streak).toBe(1);
    expect(prof.body.totals.given).toBe(1);
    const profB = await as(c.token).get(`/api/users/${b.id}/profile`);
    expect(profB.body.by_chip[0].count).toBe(1);
    expect(profB.body.recent.length).toBe(1);
  });

  it('roleta: só o vencedor da semana anterior gira, uma vez, com prêmio sorteado no servidor', async () => {
    const rw = await as(admin.token).post('/api/admin/rewards', { title: 'Café', kind: 'wheel', weight: 1 });
    expect(rw.status).toBe(201);
    await as(admin.token).post('/api/admin/rewards', { title: 'Folga', kind: 'wheel', weight: 3 });
    // sem pontos na semana passada → sem vencedor
    let w = await as(a.token).get('/api/wheel');
    expect(w.body.winner).toBeNull();
    expect((await as(a.token).post('/api/wheel/spin')).status).toBe(404);

    // reconhecimento datado na semana passada para Alice
    await query(`insert into recognitions (tenant_id, cycle_id, giver_id, receiver_id, chip_id, coins_spent, points_awarded, created_at)
                 select $1, id, $2, $3, $4, 5, 5, now() - interval '7 days' from cycles where tenant_id = $1 and status = 'open'`, [tenant.id, b.id, a.id, chip.id]);
    w = await as(c.token).get('/api/wheel');
    expect(w.body.winner.user_id).toBe(a.id);
    expect(w.body.can_spin).toBe(false);
    const forb = await as(b.token).post('/api/wheel/spin');
    expect(forb.status).toBe(403);

    const mine = await as(a.token).get('/api/wheel');
    expect(mine.body.can_spin).toBe(true);
    const spin = await as(a.token).post('/api/wheel/spin');
    expect(spin.status).toBe(200);
    expect(['Café', 'Folga']).toContain(spin.body.reward.title);
    expect(spin.body.index).toBeGreaterThanOrEqual(0);
    const again = await as(a.token).post('/api/wheel/spin');
    expect(again.status).toBe(409);

    const after = await as(b.token).get('/api/wheel');
    expect(after.body.spin.user_id).toBe(a.id);
    expect(after.body.spin.reward_title).toBe(spin.body.reward.title);

    const spins = await as(admin.token).get('/api/admin/wheel/spins');
    expect(spins.body.length).toBe(1);
    const del = await as(admin.token).patch(`/api/admin/wheel/spins/${spins.body[0].id}`, { delivered: true });
    expect(del.body.delivered_at).not.toBeNull();
  });

  it('fechamento concede campeão e mão aberta', async () => {
    const cycle = await ensureOpenCycle(tenant.id);
    for (const g of [b, c, admin]) await as(g.token).post('/api/recognitions', { receiverId: a.id, chipId: chip.id });
    for (const r of [b, c, a]) await as(admin.token).post('/api/recognitions', { receiverId: r.id, chipId: chip.id }).catch(() => {});
    await as(admin.token).post(`/api/cycles/${cycle.id}/close`);
    const champ = await one(`select 1 from achievements where user_id = $1 and key = 'champion'`, [a.id]);
    expect(champ).not.toBeNull();
    const allIn = await one(`select 1 from achievements where user_id = $1 and key = 'all_in'`, [admin.id]);
    expect(allIn).not.toBeNull(); // admin gastou 20/20
  });
});
