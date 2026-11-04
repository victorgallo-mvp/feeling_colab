import { query, type Queryable } from '../db.js';

/**
 * Sequência semanal: semanas ISO consecutivas (fuso do tenant) em que a pessoa deu ao menos 1 reconhecimento.
 * A semana atual conta se já tiver reconhecimento; se ainda não tiver, não quebra a sequência.
 */
export async function weeklyStreaks(tenantId: string, db: Queryable): Promise<Record<string, number>> {
  const rows = await query<{ giver_id: string; wk: string }>(
    `select distinct r.giver_id, to_char(date_trunc('week', r.created_at at time zone t.timezone), 'YYYY-MM-DD') as wk
     from recognitions r join tenants t on t.id = r.tenant_id
     where r.tenant_id = $1 and r.deleted_at is null`, [tenantId], db);
  const cur = await query<{ wk: string }>(`select to_char(date_trunc('week', now() at time zone timezone), 'YYYY-MM-DD') wk from tenants where id = $1`, [tenantId], db);
  const thisWeek = new Date(cur[0].wk + 'T00:00:00Z');
  const byUser: Record<string, Set<string>> = {};
  for (const r of rows) (byUser[r.giver_id] ??= new Set()).add(r.wk);
  const out: Record<string, number> = {};
  for (const [uid, weeks] of Object.entries(byUser)) {
    let n = 0;
    let d = new Date(thisWeek);
    const key = (x: Date) => x.toISOString().slice(0, 10);
    if (!weeks.has(key(d))) d.setUTCDate(d.getUTCDate() - 7); // semana atual ainda sem atividade: começa da anterior
    while (weeks.has(key(d))) { n++; d.setUTCDate(d.getUTCDate() - 7); }
    out[uid] = n;
  }
  return out;
}
