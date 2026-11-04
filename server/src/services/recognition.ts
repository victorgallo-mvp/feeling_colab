import { one, query, tx } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { ensureOpenCycle, type Cycle } from './cycles.js';
import { notify } from './notifications/index.js';
import { evaluateUser } from './achievements.js';

export interface GiveInput { tenantId: string; giverId: string; receiverId: string; chipId: string; message?: string | null }

export async function giverBalance(cycle: Cycle, giverId: string, db: any) {
  const r = await one<{ spent: number; cnt: number }>(
    `select coalesce(sum(coins_spent),0)::int as spent, count(*)::int as cnt from recognitions where cycle_id = $1 and giver_id = $2 and deleted_at is null`,
    [cycle.id, giverId], db,
  );
  return { spent: r!.spent, given: r!.cnt, balance: Math.max(0, cycle.coins_per_user - r!.spent) };
}

export async function giveRecognition(input: GiveInput) {
  if (input.giverId === input.receiverId) throw badRequest('Você não pode reconhecer a si mesmo', 'self_recognition');
  const out = await tx(async (db) => {
    // serializa gastos do mesmo giver
    await query(`select id from users where id = $1 for update`, [input.giverId], db);
    const cycle = await ensureOpenCycle(input.tenantId, db);

    const receiver = await one(`select id, name from users where id = $1 and tenant_id = $2 and deleted_at is null and is_active`, [input.receiverId, input.tenantId], db);
    if (!receiver) throw notFound('Colega não encontrado');

    const chip = await one(
      `select id, label, emoji, color from chips where id = $1 and tenant_id = $2 and deleted_at is null and valid_from <= now() and (valid_until is null or valid_until > now())`,
      [input.chipId, input.tenantId], db,
    );
    if (!chip) throw badRequest('Motivo inválido ou fora de vigência', 'invalid_chip');

    const bal = await giverBalance(cycle, input.giverId, db);
    if (bal.balance < cycle.recognition_cost) throw conflict(`Saldo insuficiente: você tem ${bal.balance} moedas e cada reconhecimento custa ${cycle.recognition_cost}`, 'insufficient_balance');

    const pair = await one<{ cnt: number }>(
      `select count(*)::int cnt from recognitions where cycle_id = $1 and giver_id = $2 and receiver_id = $3 and deleted_at is null`,
      [cycle.id, input.giverId, input.receiverId], db,
    );
    if (pair!.cnt >= cycle.max_per_receiver) throw conflict(`Você já reconheceu ${receiver.name} ${cycle.max_per_receiver}x nesta temporada`, 'receiver_limit');

    const rec = await one(
      `insert into recognitions (tenant_id, cycle_id, giver_id, receiver_id, chip_id, message, coins_spent, points_awarded)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning *`,
      [input.tenantId, cycle.id, input.giverId, input.receiverId, input.chipId, input.message?.trim() || null, cycle.recognition_cost], db,
    );
    const after = await giverBalance(cycle, input.giverId, db);
    return { recognition: { ...rec, chip }, balance: after.balance, receiverName: receiver.name, cycle, pairCount: pair!.cnt + 1 };
  });

  const giver = await one(`select name from users where id = $1`, [input.giverId]);
  notify(input.receiverId, 'recognition_received', { giverName: giver?.name ?? 'Alguém', chipLabel: out.recognition.chip.label, recognitionId: out.recognition.id }).catch(() => {});
  evaluateUser(input.tenantId, input.giverId).catch(() => {});
  evaluateUser(input.tenantId, input.receiverId).catch(() => {});
  return out;
}

export async function setMessage(tenantId: string, recognitionId: string, userId: string, message: string) {
  const rec = await one(`select * from recognitions where id = $1 and tenant_id = $2 and deleted_at is null`, [recognitionId, tenantId]);
  if (!rec) throw notFound('Reconhecimento não encontrado');
  if (rec.giver_id !== userId) throw forbidden('Só quem deu o reconhecimento pode editar o texto');
  const updated = await one(`update recognitions set message = $2, updated_at = now() where id = $1 returning *`, [recognitionId, message.trim() || null]);
  return updated;
}

export async function feed(tenantId: string, userId: string, cycleId: string | null, limit = 30, before?: string) {
  const rows = await query(
    `select r.id, r.giver_id, g.name as giver_name, g.avatar_url as giver_avatar,
            r.receiver_id, rc.name as receiver_name, rc.avatar_url as receiver_avatar,
            r.message, r.created_at, r.cycle_id,
            json_build_object('id', c.id, 'label', c.label, 'emoji', c.emoji, 'color', c.color) as chip,
            (select count(*)::int from reactions x where x.recognition_id = r.id and x.deleted_at is null) as claps,
            exists(select 1 from reactions x where x.recognition_id = r.id and x.user_id = $2 and x.deleted_at is null) as clapped
     from recognitions r
     join users g on g.id = r.giver_id join users rc on rc.id = r.receiver_id join chips c on c.id = r.chip_id
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
