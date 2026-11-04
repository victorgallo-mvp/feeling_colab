import { one, pool, query, tx, type Queryable } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { ensureOpenCycle } from './cycles.js';
import { notify } from './notifications/index.js';
import { audit } from './audit.js';
import { evaluateUser } from './achievements.js';

export type Recurrence = 'once' | 'weekly' | 'monthly';

export interface CreateMissionInput {
  tenantId: string; createdBy: string; title: string; description?: string | null; points: number;
  recurrence: Recurrence; scope: 'all' | 'area'; areaId?: string | null; startsAt?: Date | null; endsAt?: Date | null; templateId?: string | null;
}

export async function createMission(i: CreateMissionInput) {
  if (i.scope === 'area' && !i.areaId) throw badRequest('Escolha a área da missão', 'area_required');
  const m = await one(
    `insert into missions (tenant_id, created_by, title, description, points, recurrence, scope, area_id, starts_at, ends_at, template_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9, now()),$10,$11) returning *`,
    [i.tenantId, i.createdBy, i.title.trim(), i.description?.trim() || null, i.points, i.recurrence, i.scope, i.scope === 'area' ? i.areaId : null, i.startsAt ?? null, i.endsAt ?? null, i.templateId ?? null],
  );
  const targets = await query(
    `select id from users where tenant_id = $1 and deleted_at is null and is_active and id <> $2 and ($3::uuid is null or area_id = $3)`,
    [i.tenantId, i.createdBy, i.scope === 'area' ? i.areaId : null],
  );
  for (const u of targets) notify(u.id, 'mission_new', { title: m!.title, points: m!.points, missionId: m!.id }).catch(() => {});
  return m!;
}

export async function archiveMission(tenantId: string, missionId: string, actor: { id: string; role: string }) {
  const m = await one(`select * from missions where id = $1 and tenant_id = $2 and deleted_at is null`, [missionId, tenantId]);
  if (!m) throw notFound('Missão não encontrada');
  if (m.created_by !== actor.id && actor.role !== 'admin') throw forbidden();
  await query(`update missions set deleted_at = now(), updated_at = now() where id = $1`, [missionId]);
  await audit(pool, { tenantId, actorId: actor.id, action: 'mission.archive', entity: 'mission', entityId: missionId, before: m });
}

/**
 * Missões ativas para um usuário, com period_key corrente, prazo e status da própria conclusão.
 * weekly -> semana ISO no fuso do tenant; monthly -> mês; once -> 'once'.
 */
export async function listForUser(tenantId: string, userId: string, areaId: string | null, db: Queryable) {
  return query(
    `with t as (select timezone tz from tenants where id = $1),
     base as (
       select m.*, u.name as creator_name,
         case m.recurrence
           when 'weekly' then to_char(now() at time zone t.tz, 'IYYY-"W"IW')
           when 'monthly' then to_char(now() at time zone t.tz, 'YYYY-MM')
           else 'once' end as period_key,
         case m.recurrence
           when 'weekly' then least(coalesce(m.ends_at, 'infinity'::timestamptz), (date_trunc('week', now() at time zone t.tz) + interval '1 week') at time zone t.tz)
           when 'monthly' then least(coalesce(m.ends_at, 'infinity'::timestamptz), (date_trunc('month', now() at time zone t.tz) + interval '1 month') at time zone t.tz)
           else m.ends_at end as due_at
       from missions m
       join users u on u.id = m.created_by
       cross join t
       where m.tenant_id = $1 and m.deleted_at is null and m.starts_at <= now()
         and (m.ends_at is null or m.ends_at > now())
         and (m.scope = 'all' or m.area_id = $3)
     )
     select b.id, b.title, b.description, b.points, b.recurrence, b.scope, b.area_id, b.starts_at, b.ends_at, b.created_by, b.creator_name,
            b.period_key, b.due_at,
            c.id as completion_id, c.status as completion_status, c.completed_at, c.review_note
     from base b
     left join mission_completions c on c.mission_id = b.id and c.user_id = $2 and c.period_key = b.period_key and c.deleted_at is null
     order by (c.status = 'approved') nulls first, b.due_at asc nulls last, b.created_at asc`,
    [tenantId, userId, areaId],
    db,
  );
}

export async function complete(tenantId: string, missionId: string, user: { id: string; areaId: string | null }) {
  return tx(async (db) => {
    const cycle = await ensureOpenCycle(tenantId, db);
    const list = await listForUser(tenantId, user.id, user.areaId, db);
    const m = list.find((x) => x.id === missionId);
    if (!m) throw notFound('Missão não disponível para você');
    if (m.completion_id && m.completion_status !== 'rejected') throw conflict(m.completion_status === 'approved' ? 'Missão já validada neste período' : 'Missão já enviada para validação', 'already_completed');
    if (m.completion_id && m.completion_status === 'rejected') {
      // permite reenviar após recusa: reabre a mesma linha
      const c = await one(`update mission_completions set status = 'pending', completed_at = now(), reviewed_by = null, reviewed_at = null, review_note = null, updated_at = now() where id = $1 returning *`, [m.completion_id], db);
      return c!;
    }
    const c = await one(
      `insert into mission_completions (tenant_id, mission_id, user_id, cycle_id, period_key) values ($1,$2,$3,$4,$5) returning *`,
      [tenantId, missionId, user.id, cycle.id, m.period_key], db,
    );
    return c!;
  });
}

export async function review(tenantId: string, completionId: string, reviewer: { id: string; role: string }, approve: boolean, note?: string | null) {
  const out = await tx(async (db) => {
    const c = await one(
      `select c.*, m.created_by, m.points as mission_points, m.title from mission_completions c join missions m on m.id = c.mission_id
       where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null for update of c`,
      [completionId, tenantId], db,
    );
    if (!c) throw notFound('Conclusão não encontrada');
    if (c.created_by !== reviewer.id && reviewer.role !== 'admin') throw forbidden('Só quem criou a missão (ou admin) pode validar');
    if (c.status !== 'pending') throw conflict('Esta conclusão já foi avaliada', 'already_reviewed');
    const cycle = await one(`select status from cycles where id = $1`, [c.cycle_id], db);
    if (cycle?.status !== 'open') throw conflict('O ciclo desta conclusão já foi fechado', 'cycle_closed');
    const updated = await one(
      `update mission_completions set status = $2, points_awarded = $3, reviewed_by = $4, reviewed_at = now(), review_note = $5, updated_at = now() where id = $1 returning *`,
      [completionId, approve ? 'approved' : 'rejected', approve ? c.mission_points : 0, reviewer.id, note?.trim() || null], db,
    );
    return { completion: updated!, title: c.title, userId: c.user_id, points: c.mission_points };
  });
  notify(out.userId, approve ? 'mission_validated' : 'mission_rejected', { title: out.title, points: out.points, note }).catch(() => {});
  if (approve) evaluateUser(tenantId, out.userId).catch(() => {});
  return out.completion;
}

export async function pendingQueue(tenantId: string, reviewer: { id: string; role: string }, db: Queryable) {
  return query(
    `select c.id, c.mission_id, m.title, m.points, c.user_id, u.name as user_name, u.avatar_url as user_avatar, c.period_key, c.completed_at, m.created_by
     from mission_completions c join missions m on m.id = c.mission_id join users u on u.id = c.user_id
     where c.tenant_id = $1 and c.status = 'pending' and c.deleted_at is null and m.deleted_at is null
       and ($3::boolean or m.created_by = $2)
     order by c.completed_at asc`,
    [tenantId, reviewer.id, reviewer.role === 'admin'], db,
  );
}

export async function templates(tenantId: string, db: Queryable) {
  return query(`select * from mission_templates where (tenant_id = $1 or tenant_id is null) and deleted_at is null order by tenant_id nulls last, title`, [tenantId], db);
}
