import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, makeTenant, makeUser, pool, query, resetDb } from './helpers.js';

describe('acesso por clique', () => {
  let tenant: any, u: any;
  beforeEach(async () => { await resetDb(); ({ tenant } = await makeTenant()); u = await makeUser(tenant.id, 'Ana'); });
  afterAll(() => pool.end());

  it('bloqueado por padrão (magic link)', async () => {
    const list = await request(app).get('/api/public/users');
    expect(list.body).toEqual([]);
    const r = await request(app).post('/api/auth/click-login').send({ userId: u.id });
    expect(r.status).toBe(401);
  });

  it('habilitado no tenant: lista pessoas e entra com sessão válida', async () => {
    await query(`update tenants set auth_mode = 'click' where id = $1`, [tenant.id]);
    const list = await request(app).get('/api/public/users');
    expect(list.body.map((x: any) => x.id)).toContain(u.id);
    expect(list.body[0]).not.toHaveProperty('email');
    const r = await request(app).post('/api/auth/click-login').send({ userId: u.id });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTruthy();
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${r.body.accessToken}`);
    expect(me.body.user.id).toBe(u.id);
    const inactive = await makeUser(tenant.id, 'Fora');
    await query(`update users set is_active = false where id = $1`, [inactive.id]);
    expect((await request(app).post('/api/auth/click-login').send({ userId: inactive.id })).status).toBe(401);
  });
});
