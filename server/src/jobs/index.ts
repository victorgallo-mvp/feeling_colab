import cron from 'node-cron';
import { one, query } from '../db.js';
import { getOpenCycle } from '../services/cycles.js';
import { giverBalance } from '../services/recognition.js';
import { notify, sentRecently } from '../services/notifications/index.js';
import { notifyWeekWinner } from '../services/wheel.js';

/** Roda de hora em hora e decide, por tenant, no fuso local, o que disparar. */
export async function runHourly(now = new Date()) {
  const tenants = await query(`select id, name, timezone from tenants where deleted_at is null`);
  for (const t of tenants) {
    const local = await one<{ dow: number; hour: number }>(
      `select extract(isodow from ($1::timestamptz at time zone $2))::int as dow, extract(hour from ($1::timestamptz at time zone $2))::int as hour`, [now, t.timezone]);
    const cycle = await getOpenCycle(t.id, (await import('../db.js')).pool);
    if (!cycle || !local) continue;
    const users = await query(`select id from users where tenant_id = $1 and deleted_at is null and is_active`, [t.id]);
    const daysLeft = Math.ceil((+new Date(cycle.ends_at) - +now) / 86400000);

    // Modo simples (sem saldo): nenhuma mensagem automática além do aviso de reconhecimento recebido.
    if (cycle.coins_per_user <= 0) continue;

    // Roleta: segunda às 9h locais avisa quem ganhou o direito de girar
    if (local.dow === 1 && local.hour === 9) await notifyWeekWinner(t.id).catch((e) => console.error('[jobs] roleta', e));

    // Lembrete semanal de saldo: quarta e sexta às 10h locais
    if ((local.dow === 3 || local.dow === 5) && local.hour === 10) {
      for (const u of users) {
        const bal = await giverBalance(cycle, u.id, (await import('../db.js')).pool);
        if (bal.balance !== null && bal.balance >= cycle.recognition_cost && !(await sentRecently(u.id, 'balance_reminder', 20))) {
          await notify(u.id, 'balance_reminder', { balance: bal.balance, cycleName: cycle.name });
        }
      }
    }
    // Fim de ciclo chegando: 3 dias antes, às 10h locais, uma vez por ciclo
    if (daysLeft <= 3 && daysLeft > 0 && local.hour === 10) {
      for (const u of users) {
        if (await sentRecently(u.id, 'cycle_ending', 24 * 7, { cycleId: cycle.id })) continue;
        const bal = await giverBalance(cycle, u.id, (await import('../db.js')).pool);
        await notify(u.id, 'cycle_ending', { cycleName: cycle.name, days: daysLeft, balance: bal.balance, cycleId: cycle.id });
      }
    }
  }
}

export function startJobs() {
  cron.schedule('5 * * * *', () => { runHourly().catch((e) => console.error('[jobs] erro', e)); });
  console.log('[jobs] cron horário ativo');
}
