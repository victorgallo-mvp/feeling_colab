import { query, type Queryable } from '../db.js';

export async function audit(db: Queryable, p: { tenantId: string; actorId: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown }) {
  await query(
    `insert into audit_log (tenant_id, actor_id, action, entity, entity_id, before, after) values ($1,$2,$3,$4,$5,$6,$7)`,
    [p.tenantId, p.actorId, p.action, p.entity, p.entityId ?? null, p.before ? JSON.stringify(p.before) : null, p.after ? JSON.stringify(p.after) : null],
    db,
  );
}
