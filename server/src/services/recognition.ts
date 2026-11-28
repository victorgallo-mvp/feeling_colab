import { one, query, tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { ensureOpenCycle, type Cycle } from './cycles.js';
import { notify } from './notifications/index.js';
import { evaluateUser } from './achievements.js';
import { weekSpent } from './week.js';

export interface GiveInput { tenantId: string; giverId: string; receiverId: string; chipId?: string | null; message?: string | null }

/** coins_per_user = 0 e max_per_receiver = 0 significam "sem limite" (modo simples). */
export const unlimited = (n: number) => n <= 0;

/**
 * Saldo para dar. Com `coins_per_week > 0` no tenant vale a regra semanal (zera toda segunda, não acumula,
 * e trava no dia/hora configurados, se houver);
 * senão, o saldo da temporada.
 */
export async function giverBalance(cycle: Cycle, giverId: string, db: any) {
  const t = await one<{ coins_per_week: number }>(`select coins_per_week from tenants where id = $1`, [cycle.tenant_id], db);
  if (t && t.coins_per_week > 0) {
    const w = await weekSpent(cycle.tenant_id, giverId, db);
    // Depois da trava da semana (ex.: sexta 15h) o saldo é zero até a virada de segunda.
    return { spent: w.spent, given: w.given, balance: (w.locked ? 0 : Math.max(0, t.coins_per_week - w.spent)) as number | null, weekly: true, locked: w.locked, lockLabel: w.lockLabel };
  }
  const r = await one<{ spent: number; cnt: number }>(
    `select coalesce(sum(coins_spent),0)::int as spent, count(*)::int as cnt from recognitions where cycle_id = $1 and giver_id = $2 and deleted_at is null`,
    [cycle.id, giverId], db,
  );
  return { spent: r!.spent, given: r!.cnt, balance: unlimited(cycle.coins_per_user) ? null : Math.max(0, cycle.coins_per_user - r!.spent), weekly: false, locked: false, lockLabel: null };
}

async function minMessageChars(tenantId: string, db?: any) {
  const t = await one<{ message_min_chars: number }>(`select message_min_chars from tenants where id = $1`, [tenantId], db);
  return t?.message_min_chars ?? 0;
}
const messageRequired = (min: number) => badRequest(`Conte o que a pessoa fez e como isso ajudou (mínimo de ${min} caracteres)`, 'message_required');

export async function giveRecognition(input: GiveInput) {
  if (input.giverId === input.receiverId) throw badRequest('Você não pode reconhecer a si mesmo', 'self_recognition');
  const out = await tx(async (db) => {
    // serializa gastos do mesmo giver
    await query(`select id from users where id = $1 for update`, [input.giverId], db);
    const cycle = await ensureOpenCycle(input.tenantId, db);

    const receiver = await one(`select id, name from users where id = $1 and tenant_id = $2 and deleted_at is null and is_active`, [input.receiverId, input.tenantId], db);
    if (!receiver) throw notFound('Colega não encontrado');

    // Motivo é opcional: sem chip, o reconhecimento é "por colaboração" e o texto livre conta a história.
    const chip = input.chipId ? await one(
      `select id, label, emoji, color from chips where id = $1 and tenant_id = $2 and deleted_at is null and valid_from <= now() and (valid_until is null or valid_until > now())`,
      [input.chipId, input.tenantId], db,
    ) : null;
    if (input.chipId && !chip) throw badRequest('Motivo inválido ou fora de vigência', 'invalid_chip');

    // Toda moeda exige justificativa quando o tenant define um mínimo de caracteres.
    const message = input.message?.trim() || null;
    const min = await minMessageChars(input.tenantId, db);
    if (min > 0 && (message?.length ?? 0) < min) throw messageRequired(min);

    const bal = await giverBalance(cycle, input.giverId, db);
    if (bal.locked) throw conflict(`As moedas desta semana fecharam na ${bal.lockLabel}. Elas voltam na segunda.`, 'week_locked');
    if (bal.balance !== null && bal.balance < cycle.recognition_cost) {
      throw conflict(bal.weekly
        ? 'Suas moedas da semana acabaram. Elas voltam na segunda.'
        : `Saldo insuficiente: você tem ${bal.balance} moedas e cada reconhecimento custa ${cycle.recognition_cost}`, 'insufficient_balance');
    }

    const pair = await one<{ cnt: number }>(
      `select count(*)::int cnt from recognitions where cycle_id = $1 and giver_id = $2 and receiver_id = $3 and deleted_at is null`,
      [cycle.id, input.giverId, input.receiverId], db,
    );
    if (!unlimited(cycle.max_per_receiver) && pair!.cnt >= cycle.max_per_receiver) throw conflict(`Você já reconheceu ${receiver.name} ${cycle.max_per_receiver}x nesta temporada`, 'receiver_limit');

    const rec = await one(
      `insert into recognitions (tenant_id, cycle_id, giver_id, receiver_id, chip_id, message, coins_spent, points_awarded)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning *`,
      [input.tenantId, cycle.id, input.giverId, input.receiverId, chip?.id ?? null, message, cycle.recognition_cost], db,
    );
    const after = await giverBalance(cycle, input.giverId, db);
    return { recognition: { ...rec, chip }, balance: after.balance, receiverName: receiver.name, cycle, pairCount: pair!.cnt + 1 };
  });

  const giver = await one(`select name from users where id = $1`, [input.giverId]);
  notify(input.receiverId, 'recognition_received', { giverName: giver?.name ?? 'Alguém', chipLabel: out.recognition.chip?.label ?? null, message: out.recognition.message, recognitionId: out.recognition.id }).catch(() => {});
  evaluateUser(input.tenantId, input.giverId).catch(() => {});
  evaluateUser(input.tenantId, input.receiverId).catch(() => {});
  return out;
}

export async function setMessage(tenantId: string, recognitionId: string, userId: string, message: string) {
  const rec = await one(`select * from recognitions where id = $1 and tenant_id = $2 and deleted_at is null`, [recognitionId, tenantId]);
  if (!rec) throw notFound('Reconhecimento não encontrado');
  if (rec.giver_id !== userId) throw forbidden('Só quem deu o reconhecimento pode editar o texto');
  const min = await minMessageChars(tenantId);
  if (min > 0 && message.trim().length < min) throw messageRequired(min);
  const updated = await one(`update recognitions set message = $2, updated_at = now() where id = $1 returning *`, [recognitionId, message.trim() || null]);
  return updated;
}

export async function feed(tenantId: string, userId: string, cycleId: string | null, limit = 30, before?: string) {
  const rows = await query(
    `select r.id, r.giver_id, g.name as giver_name, g.avatar_url as giver_avatar,
            r.receiver_id, rc.name as receiver_name, rc.avatar_url as receiver_avatar,
            r.message, r.created_at, r.cycle_id,
            case when c.id is null then null else json_build_object('id', c.id, 'label', c.label, 'emoji', c.emoji, 'color', c.color) end as chip,
            (select count(*)::int from reactions x where x.recognition_id = r.id and x.deleted_at is null) as claps,
            exists(select 1 from reactions x where x.recognition_id = r.id and x.user_id = $2 and x.deleted_at is null) as clapped
     from recognitions r
     join users g on g.id = r.giver_id join users rc on rc.id = r.receiver_id left join chips c on c.id = r.chip_id
     where r.tenant_id = $1 and r.deleted_at is null and r.is_public
       and ($3::uuid is null or r.cycle_id = $3)
       and ($5::timestamptz is null or r.created_at < $5)
     order by r.created_at desc limit $4`,
    [tenantId, userId, cycleId, limit, before ?? null],
  );
  return rows;
}

export async function toggleReaction(tenantId: string, recognitionId: string, userId: string, emoji = '👏') {
  const rec = await one(`select id from recognitions where id = $1 and tenant_id = $2 and deleted_at is null`, [recognitionId, tenantId]);
  if (!rec) throw notFound('Reconhecimento não encontrado');
  const existing = await one(`select id from reactions where recognition_id = $1 and user_id = $2 and emoji = $3 and deleted_at is null`, [recognitionId, userId, emoji]);
  if (existing) {
    await query(`update reactions set deleted_at = now() where id = $1`, [existing.id]);
  } else {
    await query(`insert into reactions (tenant_id, recognition_id, user_id, emoji) values ($1,$2,$3,$4)`, [tenantId, recognitionId, userId, emoji]);
  }
  const count = await one<{ cnt: number }>(`select count(*)::int cnt from reactions where recognition_id = $1 and deleted_at is null`, [recognitionId]);
  return { clapped: !existing, claps: count!.cnt };
}
