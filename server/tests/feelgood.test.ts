import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, coinAt, ensureOpenCycle, makeFeelGoodTenant, makeUser, one, pool, query, resetDb } from './helpers.js';

const MSG = 'Me ajudou a fechar a entrega urgente de hoje.';

describe('programa Feel Good', () => {
  let tenant: any, admin: any, a: any, b: any, c: any, d: any;
  beforeEach(async () => {
    await resetDb();
    ({ tenant } = await makeFeelGoodTenant());
    admin = await makeUser(tenant.id, 'Admin', 'admin');
    a = await makeUser(tenant.id, 'Alice'); b = await makeUser(tenant.id, 'Bob'); c = await makeUser(tenant.id, 'Carol'); d = await makeUser(tenant.id, 'Dani');
    await ensureOpenCycle(tenant.id);
  });
  afterAll(() => pool.end());

  const give = (from: any, to: any, message: string | undefined = MSG) => as(from.token).post('/api/recognitions', { receiverId: to.id, message });
  const prize = (title: string, effect: 'prize' | 'double_next' = 'prize') => as(admin.token).post('/api/admin/rewards', { title, kind: 'wheel', weight: 1, effect });

  describe('moedas da semana', () => {
    it('5 moedas por semana: a 6ª é bloqueada e o saldo aparece na home', async () => {
      const home0 = await as(a.token).get('/api/me/home');
      expect(home0.body.me.balance).toBe(5);
      expect(home0.body.rules).toEqual({ coins_per_week: 5, message_min_chars: 10 });
      for (let i = 0; i < 5; i++) {
        const r = await give(a, i % 2 ? b : c);
        expect(r.status).toBe(201);
        expect(r.body.balance).toBe(4 - i);
      }
      const sixth = await give(a, d);
      expect(sixth.status).toBe(409);
      expect(sixth.body.code).toBe('insufficient_balance');
      expect((await as(a.token).get('/api/me/home')).body.me.balance).toBe(0);
    });

    it('zera toda semana: o que foi dado (ou não) na semana passada não muda o saldo desta', async () => {
      for (let i = 0; i < 5; i++) await coinAt(tenant.id, a.id, b.id, 7);
      expect((await as(a.token).get('/api/me/home')).body.me.balance).toBe(5);
      // quem não usou nada na semana passada também começa com 5, não com 10
      expect((await as(c.token).get('/api/me/home')).body.me.balance).toBe(5);
      expect((await give(a, b)).body.balance).toBe(4);
    });

    it('não vaza saldo em requisições concorrentes', async () => {
      const results = await Promise.all(Array.from({ length: 9 }, (_, i) => give(a, i % 2 ? b : c)));
      expect(results.filter((r) => r.status === 201).length).toBe(5);
    });

    it('quem entra no meio da semana já pode dar suas moedas; quem é desativado sai da grade e do ranking', async () => {
      const novo = await makeUser(tenant.id, 'Novato');
      expect((await as(novo.token).get('/api/me/home')).body.me.balance).toBe(5);
      await give(a, b);
      await as(admin.token).patch(`/api/admin/users/${b.id}`, { isActive: false });
      const home = await as(a.token).get('/api/me/home');
      expect(home.body.colleagues.map((x: any) => x.id)).not.toContain(b.id);
      expect(home.body.week.ranking.map((x: any) => x.user_id)).not.toContain(b.id);
    });
  });

  describe('justificativa', () => {
    it('toda moeda exige texto com o mínimo de caracteres', async () => {
      const none = await as(a.token).post('/api/recognitions', { receiverId: b.id });
      expect(none.status).toBe(400);
      expect(none.body.code).toBe('message_required');
      expect((await give(a, b, 'valeu')).body.code).toBe('message_required');
      expect((await give(a, b, '          ')).status).toBe(400);
      const ok = await give(a, b);
      expect(ok.status).toBe(201);
      // moeda recusada não gasta saldo
      expect(ok.body.balance).toBe(4);
      const blank = await as(a.token).patch(`/api/recognitions/${ok.body.recognition.id}`, { message: 'oi' });
      expect(blank.status).toBe(400);
    });
  });

  describe('ranking da semana e Destaque', () => {
    it('ranking da semana: mais moedas; no empate, mais colegas diferentes', async () => {
      await give(a, b); await give(a, b);          // Bob: 2 moedas de 1 colega
      await give(b, c); await give(d, c);          // Carol: 2 moedas de 2 colegas
      await give(c, d);                            // Dani: 1 moeda
      await coinAt(tenant.id, b.id, a.id, 7);      // semana passada não entra
      const home = await as(a.token).get('/api/me/home');
      const rk = home.body.week.ranking;
      expect(rk.slice(0, 3).map((r: any) => r.user_id)).toEqual([c.id, b.id, d.id]);
      expect(rk[0]).toMatchObject({ rank: 1, coins: 2, givers: 2 });
      expect(rk[1]).toMatchObject({ rank: 2, coins: 2, givers: 1 });
      expect(rk.find((r: any) => r.user_id === a.id)).toMatchObject({ coins: 0 });
      expect(home.body.week.my_rank).toBeNull();
    });

    it('Destaque: desempata por colegas diferentes', async () => {
      await prize('Vale-pizza');
      await coinAt(tenant.id, c.id, a.id); await coinAt(tenant.id, c.id, a.id);   // Alice: 2 de 1 colega
      await coinAt(tenant.id, a.id, b.id); await coinAt(tenant.id, c.id, b.id);   // Bob: 2 de 2 colegas
      const w = await as(d.token).get('/api/wheel');
      expect(w.body.winner.user_id).toBe(b.id);
      expect(w.body.winner.points).toBe(2);
      expect(w.body.tiebreak).toEqual([]);
    });

    it('empate total: giro prévio com números diferentes, maior vence, e o resultado não muda depois', async () => {
      await prize('Vale-pizza');
      await coinAt(tenant.id, c.id, a.id);
      await coinAt(tenant.id, c.id, b.id);
      const w1 = await as(d.token).get('/api/wheel');
      expect(w1.body.tiebreak.length).toBe(2);
      const [first, second] = w1.body.tiebreak;
      expect(first.roll).toBeGreaterThan(second.roll);
      expect(w1.body.winner.user_id).toBe(first.user_id);
      const w2 = await as(a.token).get('/api/wheel');
      expect(w2.body.tiebreak).toEqual(w1.body.tiebreak);
      const loser = first.user_id === a.id ? b : a;
      const winner = first.user_id === a.id ? a : b;
      expect((await as(loser.token).post('/api/wheel/spin')).status).toBe(403);
      expect((await as(winner.token).post('/api/wheel/spin')).status).toBe(200);
    });

    it('pontos de missão não contam para o Destaque', async () => {
      await prize('Vale-pizza');
      await coinAt(tenant.id, c.id, a.id);
      const m = await one(`insert into missions (tenant_id, created_by, title, points, recurrence) values ($1,$2,'Missão',50,'once') returning id`, [tenant.id, admin.id]);
      await query(
        `insert into mission_completions (tenant_id, mission_id, user_id, cycle_id, period_key, status, points_awarded, reviewed_by, reviewed_at)
         select $1, $2, $3, id, 'once', 'approved', 50, $4, now() - interval '7 days' from cycles where tenant_id = $1 and status = 'open'`,
        [tenant.id, m!.id, b.id, admin.id]);
      expect((await as(d.token).get('/api/wheel')).body.winner.user_id).toBe(a.id);
    });
  });

  describe('roleta: Dobre e passe', () => {
    it('cair na dobra não paga prêmio; o próximo Destaque gira sem a dobra e leva em dobro', async () => {
      const dobre = await prize('Dobre e passe para o próximo', 'double_next');
      expect(dobre.body.effect).toBe('double_next');
      await coinAt(tenant.id, c.id, a.id);
      // só a dobra na roleta: Alice cai nela
      const s1 = await as(a.token).post('/api/wheel/spin');
      expect(s1.status).toBe(200);
      expect(s1.body.reward.effect).toBe('double_next');
      expect(s1.body.multiplier).toBe(1);

      // uma semana depois: o giro da dobra passa a ser "da semana retrasada" e Bob é o novo Destaque
      await query(`update wheel_spins set week_key = to_char(date_trunc('week', now() at time zone 'America/Sao_Paulo') - interval '2 weeks', 'IYYY-"W"IW') where tenant_id = $1`, [tenant.id]);
      await query(`update recognitions set created_at = created_at - interval '7 days' where tenant_id = $1`, [tenant.id]);
      await prize('Vale-pizza');
      await coinAt(tenant.id, c.id, b.id);

      const w = await as(d.token).get('/api/wheel');
      expect(w.body.winner.user_id).toBe(b.id);
      expect(w.body.multiplier).toBe(2);
      expect(w.body.prizes.map((p: any) => p.title)).toEqual(['Vale-pizza']); // a dobra sai da roleta
      const s2 = await as(b.token).post('/api/wheel/spin');
      expect(s2.body.reward.title).toBe('Vale-pizza');
      expect(s2.body.multiplier).toBe(2);

      const spins = await as(admin.token).get('/api/admin/wheel/spins');
      const pizza = spins.body.find((s: any) => s.reward_title === 'Vale-pizza');
      expect(pizza).toMatchObject({ multiplier: 2, status: 'pending' });
      expect(spins.body.find((s: any) => s.reward_effect === 'double_next').status).toBe('delivered');

      // entrega: a combinar → agendado (com nota) → entregue
      const sched = await as(admin.token).patch(`/api/admin/wheel/spins/${pizza.id}`, { status: 'scheduled', note: 'Sexta, 12/12' });
      expect(sched.body).toMatchObject({ status: 'scheduled', delivery_note: 'Sexta, 12/12', delivered_at: null });
      const done = await as(admin.token).patch(`/api/admin/wheel/spins/${pizza.id}`, { status: 'delivered' });
      expect(done.body.status).toBe('delivered');
      expect(done.body.delivered_at).not.toBeNull();
      expect(done.body.delivery_note).toBe('Sexta, 12/12');
    });
  });

  describe('acesso por código e sessão de um ano', () => {
    const codeFor = async (u: any) => (await as(admin.token).post('/api/admin/users/access-codes', { ids: [u.id] })).body[0];

    it('admin gera o código, a pessoa entra uma vez e o código não vale de novo', async () => {
      const c1 = await codeFor(a);
      expect(c1.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(c1.link).toContain('/entrar?c=');
      const list = await as(admin.token).get('/api/admin/users');
      expect(list.body.find((u: any) => u.id === a.id)).toMatchObject({ has_session: false });
      expect(list.body.find((u: any) => u.id === a.id).code_expires_at).not.toBeNull();

      const login = await request(app).post('/api/auth/code').send({ code: c1.code.toLowerCase().replace('-', ' ') });
      expect(login.status).toBe(200);
      const me = await request(app).get('/api/me').set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(me.body.user.id).toBe(a.id);
      expect((await request(app).post('/api/auth/code').send({ code: c1.code })).status).toBe(401);

      const sess = await one(`select expires_at > now() + interval '360 days' as long from sessions where user_id = $1`, [a.id]);
      expect(sess!.long).toBe(true);
      const after = await as(admin.token).get('/api/admin/users');
      expect(after.body.find((u: any) => u.id === a.id)).toMatchObject({ has_session: true, code_expires_at: null });
    });

    it('gerar um código novo invalida o anterior; código errado, expirado ou de pessoa inativa não entra', async () => {
      const old = await codeFor(a);
      const fresh = await codeFor(a);
      expect((await request(app).post('/api/auth/code').send({ code: old.code })).status).toBe(401);
      expect((await request(app).post('/api/auth/code').send({ code: 'ABCD-EFGH' })).status).toBe(401);
      await query(`update magic_links set expires_at = now() - interval '1 minute' where user_id = $1 and used_at is null`, [a.id]);
      expect((await request(app).post('/api/auth/code').send({ code: fresh.code })).status).toBe(401);

      const forB = await codeFor(b);
      await as(admin.token).patch(`/api/admin/users/${b.id}`, { isActive: false });
      expect((await request(app).post('/api/auth/code').send({ code: forB.code })).status).toBe(401);
      expect((await as(admin.token).post('/api/admin/users/access-codes', { ids: [b.id] })).body).toEqual([]);
    });

    it('modo "código": a entrada por clique fica fechada', async () => {
      const set = await as(admin.token).patch('/api/admin/settings', { authMode: 'invite' });
      expect(set.body.auth_mode).toBe('invite');
      expect((await request(app).get('/api/public/users')).body).toEqual([]);
      expect((await request(app).post('/api/auth/click-login').send({ userId: a.id })).status).toBe(401);
    });

    it('renovação com tolerância: o token anterior ainda vale por alguns minutos, depois não', async () => {
      const login = await request(app).post('/api/auth/code').send({ code: (await codeFor(a)).code });
      const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
      expect(r1.status).toBe(200);
      expect(r1.body.refreshToken).not.toBe(login.body.refreshToken);
      // resposta "perdida": o aparelho repete com o token antigo
      const retry = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
      expect(retry.status).toBe(200);
      await query(`update sessions set rotated_at = now() - interval '10 minutes' where user_id = $1 and rotated_at is not null`, [a.id]);
      expect((await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
      expect((await request(app).post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status).toBe(200);
    });

    it('desconectar aparelhos, desativar e remover encerram as sessões', async () => {
      const tokens = async (u: any) => (await request(app).post('/api/auth/code').send({ code: (await codeFor(u)).code })).body;
      const ta = await tokens(a), tb = await tokens(b), tc = await tokens(c);
      await as(admin.token).post(`/api/admin/users/${a.id}/revoke-sessions`);
      await as(admin.token).patch(`/api/admin/users/${b.id}`, { isActive: false });
      await as(admin.token).delete(`/api/admin/users/${c.id}`);
      for (const t of [ta, tb, tc]) expect((await request(app).post('/api/auth/refresh').send({ refreshToken: t.refreshToken })).status).toBe(401);
      // Alice continua ativa: só precisa de um código novo
      expect((await request(app).post('/api/auth/code').send({ code: (await codeFor(a)).code })).status).toBe(200);
    });
  });

  describe('admin: pessoas em lote', () => {
    it('importa lista, pula e-mails repetidos e cria as áreas que faltam', async () => {
      const r = await as(admin.token).post('/api/admin/users/bulk', { users: [
        { name: 'Zeca Lima', email: 'Zeca@feeling.dev', area: 'Mídia' },
        { name: 'Yara Dias', email: 'yara@feeling.dev', area: 'mídia', role: 'manager' },
        { name: 'Zeca Repetido', email: 'zeca@feeling.dev' },
        { name: 'Alice de novo', email: a.email },
      ] });
      expect(r.status).toBe(201);
      expect(r.body.created.map((u: any) => u.email)).toEqual(['zeca@feeling.dev', 'yara@feeling.dev']);
      expect(r.body.skipped.map((s: any) => s.email)).toEqual(['zeca@feeling.dev', a.email]);
      const areas = await query(`select name from areas where tenant_id = $1 and lower(name) = 'mídia'`, [tenant.id]);
      expect(areas.length).toBe(1);
      const list = await as(admin.token).get('/api/admin/users');
      expect(list.body.find((u: any) => u.email === 'yara@feeling.dev')).toMatchObject({ role: 'manager', area_name: 'Mídia' });
      expect((await as(a.token).post('/api/admin/users/bulk', { users: [{ name: 'Xis', email: 'x@feeling.dev' }] })).status).toBe(403);
    });

    it('desativa, reativa e remove em lote, sem nunca atingir o próprio admin', async () => {
      const all = [admin.id, a.id, b.id, c.id, d.id];
      const off = await as(admin.token).post('/api/admin/users/bulk-action', { ids: all, action: 'deactivate' });
      expect(off.body.affected).toBe(4);
      expect((await as(admin.token).get('/api/me')).status).toBe(200);
      expect((await as(a.token).get('/api/me')).status).toBe(401);
      const on = await as(admin.token).post('/api/admin/users/bulk-action', { ids: [a.id, b.id], action: 'activate' });
      expect(on.body.affected).toBe(2);
      expect((await as(a.token).get('/api/me')).status).toBe(200);
      const rm = await as(admin.token).post('/api/admin/users/bulk-action', { ids: all, action: 'remove' });
      expect(rm.body.affected).toBe(4);
      const list = await as(admin.token).get('/api/admin/users');
      expect(list.body.map((u: any) => u.id)).toEqual([admin.id]);
    });
  });

  describe('admin: regras e jogo justo', () => {
    it('moedas por semana e justificativa mínima são configuráveis e valem na hora', async () => {
      await give(a, b);
      const r = await as(admin.token).patch('/api/admin/settings', { coinsPerWeek: 2, messageMinChars: 0 });
      expect(r.body).toMatchObject({ coins_per_week: 2, message_min_chars: 0 });
      expect((await as(a.token).get('/api/me/home')).body.me.balance).toBe(1);
      expect((await as(a.token).post('/api/recognitions', { receiverId: c.id })).status).toBe(201);
      expect((await give(a, d)).status).toBe(409);
    });

    it('admin anula uma moeda: sai do ranking e o saldo da semana volta para quem deu', async () => {
      const r = await give(a, b);
      expect((await as(a.token).get('/api/me/home')).body.me.balance).toBe(4);
      const list = await as(admin.token).get('/api/admin/recognitions');
      expect(list.body.map((x: any) => x.id)).toContain(r.body.recognition.id);
      expect((await as(a.token).delete(`/api/admin/recognitions/${r.body.recognition.id}`)).status).toBe(403);
      expect((await as(admin.token).delete(`/api/admin/recognitions/${r.body.recognition.id}`)).status).toBe(200);
      const home = await as(a.token).get('/api/me/home');
      expect(home.body.me.balance).toBe(5);
      expect(home.body.feed).toEqual([]);
      expect(home.body.week.ranking.find((x: any) => x.user_id === b.id).coins).toBe(0);
      expect((await as(admin.token).delete(`/api/admin/recognitions/${r.body.recognition.id}`)).status).toBe(404);
    });

    it('relatório aponta troca recíproca, concentração e justificativa curta', async () => {
      await give(a, b); await give(b, a);                    // troca
      await give(c, d); await give(c, d); await give(c, d);  // concentração
      await give(d, a, 'valeu demais!');                     // curta (passa do mínimo, mas diz pouco)
      const r = await as(admin.token).get('/api/admin/fairplay');
      expect(r.status).toBe(200);
      expect(r.body.reciprocal).toHaveLength(1);
      expect([r.body.reciprocal[0].a_name, r.body.reciprocal[0].b_name].sort()).toEqual(['Alice', 'Bob']);
      expect(r.body.concentrated).toEqual([expect.objectContaining({ giver_name: 'Carol', receiver_name: 'Dani', coins: 3 })]);
      expect(r.body.short.map((s: any) => s.message)).toEqual(['valeu demais!']);
      expect((await as(a.token).get('/api/admin/fairplay')).status).toBe(403);
    });
  });
});
