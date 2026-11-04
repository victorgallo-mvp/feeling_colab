import crypto from 'node:crypto';
import { one, query } from '../db.js';
import { config } from '../config.js';
import { unauthorized } from '../errors.js';
import { signAccessToken } from '../middleware/auth.js';
import { sendMagicLink } from './mailer.js';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function requestMagicLink(email: string, tenantSlug?: string | null) {
  const user = await one(
    `select u.id, u.tenant_id, u.email, t.name as tenant_name, t.slug from users u join tenants t on t.id = u.tenant_id
     where lower(u.email) = lower($1) and u.deleted_at is null and u.is_active and t.deleted_at is null and ($2::text is null or t.slug = $2)
     order by u.created_at asc limit 1`,
    [email, tenantSlug ?? null],
  );
  if (!user) return { ok: true as const, devLink: null };
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `insert into magic_links (tenant_id, user_id, token_hash, expires_at) values ($1,$2,$3, now() + ($4::int * interval '1 minute'))`,
    [user.tenant_id, user.id, sha(token), config.magicLinkMinutes],
  );
  const link = `${config.frontendUrl}/auth/callback?token=${token}`;
  const { delivered } = await sendMagicLink(user.email, link, user.tenant_name);
  return { ok: true as const, devLink: !delivered && config.env !== 'production' ? link : null };
}

async function createSession(user: { id: string; tenant_id: string; role: any }, userAgent?: string) {
  const refresh = crypto.randomBytes(48).toString('base64url');
  await query(
    `insert into sessions (tenant_id, user_id, refresh_token_hash, user_agent, expires_at) values ($1,$2,$3,$4, now() + ($5::int * interval '1 day'))`,
    [user.tenant_id, user.id, sha(refresh), userAgent ?? null, config.refreshTokenDays],
  );
  return { accessToken: signAccessToken(user), refreshToken: refresh };
}

export async function verifyMagicLink(token: string, userAgent?: string) {
  const ml = await one(
    `update magic_links set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
    [sha(token)],
  );
  if (!ml) throw unauthorized('Link inválido ou expirado. Peça um novo.');
  const user = await one(`select id, tenant_id, role from users where id = $1 and deleted_at is null and is_active`, [ml.user_id]);
  if (!user) throw unauthorized('Usuário inativo');
  await query(`update users set last_seen_at = now() where id = $1`, [user.id]);
  return createSession(user, userAgent);
}

export async function refreshSession(refreshToken: string, userAgent?: string) {
  const s = await one(
    `update sessions set revoked_at = now(), last_used_at = now() where refresh_token_hash = $1 and revoked_at is null and expires_at > now() returning user_id`,
    [sha(refreshToken)],
  );
  if (!s) throw unauthorized('Sessão expirada. Entre novamente.');
  const user = await one(`select id, tenant_id, role from users where id = $1 and deleted_at is null and is_active`, [s.user_id]);
  if (!user) throw unauthorized('Usuário inativo');
  await query(`update users set last_seen_at = now() where id = $1`, [user.id]);
  return createSession(user, userAgent);
}

/**
 * Acesso por clique (piloto): sem e-mail, a pessoa escolhe a si mesma na tela de entrada.
 * Só funciona se o tenant estiver em auth_mode = 'click'. Troque para 'magic_link' no admin quando quiser fechar.
 */
export async function clickLogin(userId: string, tenantSlug: string | null | undefined, userAgent?: string) {
  const user = await one(
    `select u.id, u.tenant_id, u.role from users u join tenants t on t.id = u.tenant_id
     where u.id = $1 and u.deleted_at is null and u.is_active and t.deleted_at is null and t.auth_mode = 'click' and ($2::text is null or t.slug = $2)`,
    [userId, tenantSlug ?? null]);
  if (!user) throw unauthorized('Acesso por clique não está habilitado para esta pessoa');
  await query(`update users set last_seen_at = now() where id = $1`, [user.id]);
  return createSession(user, userAgent);
}

export async function revokeSession(refreshToken: string) {
  await query(`update sessions set revoked_at = now() where refresh_token_hash = $1 and revoked_at is null`, [sha(refreshToken)]);
}
