import { one, query } from '../../db.js';
import type { NotificationProvider, NotificationType } from './provider.js';
import { render } from './templates.js';
import { WebPushProvider } from './webPush.js';

let providers: NotificationProvider[] = [new WebPushProvider()];
/** Permite trocar/adicionar canais (WhatsApp no futuro) sem tocar nos chamadores. */
export function setProviders(p: NotificationProvider[]) { providers = p; }

/**
 * Persiste a notificação (vira histórico in-app) e despacha para cada provider.
 * Nunca lança: falha de canal não pode quebrar o fluxo de negócio.
 */
export async function notify(userId: string, type: NotificationType, data: Record<string, any> = {}) {
  try {
    const user = await one(`select id, tenant_id from users where id = $1 and deleted_at is null and is_active`, [userId]);
    if (!user) return null;
    const t = render(type, data);
    const row = await one(
      `insert into notifications (tenant_id, user_id, type, channel, title, body, deep_link, payload) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [user.tenant_id, userId, type, providers[0]?.channel ?? 'none', t.title, t.body, t.deepLink, JSON.stringify(data)],
    );
    const n = { id: row!.id, userId, tenantId: user.tenant_id, type, title: t.title, body: t.body, deepLink: t.deepLink, payload: data };
    let ok = false; let err: string | undefined;
    for (const p of providers) {
      const r = await p.send(n).catch((e) => ({ delivered: false, error: String(e?.message ?? e) }));
      if (r.delivered) ok = true; else err = r.error;
    }
    await query(ok ? `update notifications set sent_at = now() where id = $1` : `update notifications set failed_at = now(), error = $2 where id = $1`, ok ? [n.id] : [n.id, err ?? null]);
    return n.id;
  } catch (e) {
    console.error('[notify] erro', e);
    return null;
  }
}

export async function listForUser(userId: string, limit = 20) {
  return query(`select id, type, title, body, deep_link, read_at, created_at from notifications where user_id = $1 order by created_at desc limit $2`, [userId, limit]);
}

export async function markRead(userId: string, ids: string[] | 'all') {
  if (ids === 'all') await query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [userId]);
  else await query(`update notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null`, [userId, ids]);
}

/** Dedupe simples pra jobs: já existe notificação deste tipo pro usuário nas últimas N horas? */
export async function sentRecently(userId: string, type: NotificationType, hours: number, payloadMatch?: Record<string, unknown>) {
  const r = await one(
    `select 1 from notifications where user_id = $1 and type = $2 and created_at > now() - ($3::int * interval '1 hour') and ($4::jsonb is null or payload @> $4::jsonb) limit 1`,
    [userId, type, hours, payloadMatch ? JSON.stringify(payloadMatch) : null],
  );
  return !!r;
}
