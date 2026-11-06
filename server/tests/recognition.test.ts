import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { as, makeChip, makeTenant, makeUser, one, pool, resetDb } from './helpers.js';

describe('dar reconhecimento', () => {
  let tenant: any, giver: any, receiver: any, other: any, chip: any;

  beforeEach(async () => {
    await resetDb();
    ({ tenant } = await makeTenant({ coins: 20, cost: 5, maxPer: 3 }));
    giver = await makeUser(tenant.id, 'Giver');
    receiver = await makeUser(tenant.id, 'Receiver');
    other = await makeUser(tenant.id, 'Other');
    chip = await makeChip(tenant.id);
  });
  afterAll(() => pool.end());

  it('debita o saldo do giver e credita pontos ao receiver', async () => {
    const r = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    expect(r.status).toBe(201);
    expect(r.body.balance).toBe(15);
    expect(r.body.recognition.coins_spent).toBe(5);
    expect(r.body.recognition.points_awarded).toBe(5);

    const home = await as(receiver.token).get('/api/me/home');
    expect(home.body.me.points_recognition).toBe(5);
    expect(home.body.me.recognitions_received).toBe(1);
    const giverHome = await as(giver.token).get('/api/me/home');
    expect(giverHome.body.me.balance).toBe(15);
    expect(giverHome.body.me.points_total).toBe(0); // dar não pontua
  });

  it('chip (motivo) é opcional, mas se vier precisa ser válido', async () => {
    const semChip = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, message: 'valeu pela ajuda' });
    expect(semChip.status).toBe(201);
    expect(semChip.body.recognition.chip).toBeNull();
    const home = await as(other.token).get('/api/me/home');
    expect(home.body.feed[0].chip).toBeNull();
    expect(home.body.feed[0].message).toBe('valeu pela ajuda');

    const expirado = await one(`insert into chips (tenant_id, label, valid_until) values ($1,'Antigo', now() - interval '1 day') returning id`, [tenant.id]);
    const r = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: expirado!.id });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_chip');
  });

  it('modo simples: coins 0 e max 0 = sem limite, custo 1 moeda', async () => {
    const t = await makeTenant({ coins: 0, cost: 1, maxPer: 0 });
    const g = await makeUser(t.tenant.id, 'Giver S'); const r1 = await makeUser(t.tenant.id, 'Receiver S');
    for (let i = 0; i < 25; i++) expect((await as(g.token).post('/api/recognitions', { receiverId: r1.id })).status).toBe(201);
    const home = await as(g.token).get('/api/me/home');
    expect(home.body.me.balance).toBeNull();
    expect(home.body.me.given).toBe(25);
    expect(home.body.colleagues.find((c: any) => c.id === r1.id).can_receive).toBe(true);
  });

  it('não permite reconhecer a si mesmo', async () => {
    const r = await as(giver.token).post('/api/recognitions', { receiverId: giver.id, chipId: chip.id });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('self_recognition');
  });

  it('respeita o limite por pessoa no ciclo', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
      expect(r.status).toBe(201);
    }
    const r4 = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    expect(r4.status).toBe(409);
    expect(r4.body.code).toBe('receiver_limit');
    // ainda pode reconhecer outra pessoa com o saldo restante (5)
    const ok = await as(giver.token).post('/api/recognitions', { receiverId: other.id, chipId: chip.id });
    expect(ok.status).toBe(201);
    expect(ok.body.balance).toBe(0);
  });

  it('bloqueia quando o saldo acaba', async () => {
    await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    await as(giver.token).post('/api/recognitions', { receiverId: other.id, chipId: chip.id });
    await as(giver.token).post('/api/recognitions', { receiverId: other.id, chipId: chip.id });
    const r = await as(giver.token).post('/api/recognitions', { receiverId: other.id, chipId: chip.id });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('insufficient_balance');
  });

  it('não vaza saldo em requisições concorrentes', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
      as(giver.token).post('/api/recognitions', { receiverId: i % 2 ? receiver.id : other.id, chipId: chip.id })));
    const created = results.filter((r) => r.status === 201).length;
    expect(created).toBe(4);
    const spent = await one(`select coalesce(sum(coins_spent),0)::int s from recognitions where giver_id = $1`, [giver.id]);
    expect(spent!.s).toBe(20);
  });

  it('texto é opcional e pode ser adicionado depois só pelo giver', async () => {
    const r = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    expect(r.body.recognition.message).toBeNull();
    const upd = await as(giver.token).patch(`/api/recognitions/${r.body.recognition.id}`, { message: 'Mandou muito' });
    expect(upd.status).toBe(200);
    expect(upd.body.message).toBe('Mandou muito');
    const forbidden = await as(receiver.token).patch(`/api/recognitions/${r.body.recognition.id}`, { message: 'hack' });
    expect(forbidden.status).toBe(403);
  });

  it('reação 👏 não pontua', async () => {
    const r = await as(giver.token).post('/api/recognitions', { receiverId: receiver.id, chipId: chip.id });
    const clap = await as(other.token).post(`/api/recognitions/${r.body.recognition.id}/reactions`);
    expect(clap.body).toEqual({ clapped: true, claps: 1 });
    const home = await as(other.token).get('/api/me/home');
    expect(home.body.me.points_total).toBe(0);
    const unclap = await as(other.token).post(`/api/recognitions/${r.body.recognition.id}/reactions`);
    expect(unclap.body.clapped).toBe(false);
  });
});
