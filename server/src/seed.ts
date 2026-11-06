/**
 * Seed do piloto: tenant Feeling, 15 usuários (1 admin Iran, 2 gestores, 12 colaboradores),
 * 6 chips, 4 missões, ciclo aberto e reconhecimentos de exemplo.
 * Idempotente: se o tenant já existir, não faz nada (use SEED_RESET=true pra recriar).
 */
import { pool, query, one, tx } from './db.js';
import { ensureOpenCycle } from './services/cycles.js';

const SLUG = 'feeling';

async function main() {
  const existing = await one(`select id from tenants where slug = $1`, [SLUG]);
  if (existing && process.env.SEED_RESET !== 'true') {
    console.log('Seed já aplicado (tenant feeling existe). Use SEED_RESET=true para recriar.');
    return;
  }
  if (existing) {
    console.log('Removendo dados do tenant feeling...');
    await tx(async (db) => {
      const tid = existing.id;
      for (const t of ['audit_log','notifications','push_subscriptions','cycle_user_snapshots','mission_completions','missions','mission_templates','reactions','recognitions','chips','cycles','sessions','magic_links','users','areas']) {
        await query(`delete from ${t} where tenant_id = $1`, [tid], db);
      }
      await query(`delete from tenants where id = $1`, [tid], db);
    });
  }

  await tx(async (db) => {
    const tenant = await one(
      `insert into tenants (slug, name, primary_color, secondary_color, theme, font_display, logo_url, logo_dark_url, symbol_url, auth_mode, coins_per_cycle, recognition_cost, max_per_receiver_per_cycle)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'click',0,1,0) returning *`,
      [SLUG, 'Feeling', '#04D81A', '#04D81A', 'duo', 'big-shoulders', '/brand/feeling/logo-light-bg.png', '/brand/feeling/logo-dark-bg.png', '/brand/feeling/symbol-512.png'], db);
    const tid = tenant!.id;

    const areaNames = ['Atendimento', 'Criação', 'Mídia', 'Planejamento'];
    const areas: Record<string, string> = {};
    for (const n of areaNames) {
      const a = await one(`insert into areas (tenant_id, name) values ($1,$2) returning id`, [tid, n], db);
      areas[n] = a!.id;
    }

    const people: Array<[string, string, 'admin' | 'manager' | 'member', string]> = [
      ['Iran', 'iran@feeling.com.br', 'admin', 'Planejamento'],
      ['Camila Rocha', 'camila@feeling.com.br', 'manager', 'Atendimento'],
      ['Diego Martins', 'diego@feeling.com.br', 'manager', 'Criação'],
      ['Ana Beatriz', 'ana@feeling.com.br', 'member', 'Atendimento'],
      ['Bruno Lima', 'bruno@feeling.com.br', 'member', 'Atendimento'],
      ['Carla Mendes', 'carla@feeling.com.br', 'member', 'Criação'],
      ['Eduardo Reis', 'eduardo@feeling.com.br', 'member', 'Criação'],
      ['Fernanda Souza', 'fernanda@feeling.com.br', 'member', 'Criação'],
      ['Gabriel Nunes', 'gabriel@feeling.com.br', 'member', 'Mídia'],
      ['Helena Costa', 'helena@feeling.com.br', 'member', 'Mídia'],
      ['Igor Santos', 'igor@feeling.com.br', 'member', 'Mídia'],
      ['Juliana Alves', 'juliana@feeling.com.br', 'member', 'Planejamento'],
      ['Lucas Ferreira', 'lucas@feeling.com.br', 'member', 'Planejamento'],
      ['Marina Dias', 'marina@feeling.com.br', 'member', 'Atendimento'],
      ['Rafael Oliveira', 'rafael@feeling.com.br', 'member', 'Criação'],
    ];
    const users: Record<string, string> = {};
    for (const [name, email, role, area] of people) {
      const u = await one(`insert into users (tenant_id, email, name, role, area_id, avatar_url) values ($1,$2,$3,$4,$5,$6) returning id`,
        [tid, email, name, role, areas[area], null], db);
      users[name] = u!.id;
    }

    // Chips derivados dos 10 princípios do quadro de cultura da Feeling (sem cor própria: paleta oficial é verde + preto + branco)
    const chipDefs: Array<[string, string]> = [
      ['Postura de dono', '🧭'],
      ['Enfrentou de frente', '🥊'],
      ['Criou encantamento', '✨'],
      ['Fez acontecer', '⚡'],
      ['Trabalhou com empatia', '🤝'],
      ['Deu feedback de verdade', '🗣️'],
      ['Ajudou a crescer', '📈'],
      ['Melhoria contínua', '🔁'],
    ];
    const chips: string[] = [];
    let i = 0;
    for (const [label, emoji] of chipDefs) {
      const c = await one(`insert into chips (tenant_id, label, emoji, color, sort_order) values ($1,$2,$3,null,$4) returning id`, [tid, label, emoji, i++], db);
      chips.push(c!.id);
    }

    // templates globais (tenant_id null) + um do tenant
    const tpl: Array<[string | null, string, string, number, string]> = [
      [null, 'Atualizar o status dos seus projetos', 'Deixe o board/planilha em dia até sexta.', 10, 'weekly'],
      [null, 'Compartilhar um aprendizado com o time', 'Um post, áudio ou 5 min na reunião.', 15, 'weekly'],
      [null, 'Fazer 1:1 com cada pessoa do time', 'Gestores: uma conversa individual por mês.', 30, 'monthly'],
      [null, 'Documentar um processo', 'Escreva (ou grave) como se faz algo que só você sabe.', 25, 'monthly'],
      [null, 'Dar feedback estruturado a um colega', 'Use o modelo situação → comportamento → impacto.', 20, 'monthly'],
      [tid, 'Enviar relatório de resultados ao cliente', 'Todos os clientes da sua carteira, até dia 5.', 20, 'monthly'],
      [tid, 'Cultura de feedback: dê um feedback estruturado', 'Situação, comportamento, impacto. Para um colega, por mês.', 20, 'monthly'],
      [tid, 'Melhoria contínua: teste algo novo num projeto', 'Um formato, uma ferramenta ou um processo. Conte o resultado no grupo.', 15, 'monthly'],
      [tid, 'Postura de dono: resolva uma pendência que não era sua', 'Algo travado há mais de uma semana. Registre o que destravou.', 15, 'weekly'],
    ];
    for (const [t, title, desc, pts, rec] of tpl) {
      await query(`insert into mission_templates (tenant_id, title, description, points, recurrence) values ($1,$2,$3,$4,$5)`, [t, title, desc, pts, rec], db);
    }

    const cycle = await ensureOpenCycle(tid, db);

    const missions: Array<[string, string, string | null, number, string, string, string | null]> = [
      ['Iran', 'Atualizar o status dos seus projetos', 'Board em dia até sexta-feira.', 10, 'weekly', 'all', null],
      ['Iran', 'Compartilhar um aprendizado com o time', 'Um post no grupo ou 5 min na reunião de segunda.', 15, 'weekly', 'all', null],
      ['Camila Rocha', 'Enviar relatório mensal aos clientes', 'Todos os clientes da carteira até dia 5.', 20, 'monthly', 'area', areas['Atendimento']],
      ['Diego Martins', 'Organizar a pasta de referências', 'Mover tudo que está solto no Drive pras pastas certas.', 25, 'once', 'area', areas['Criação']],
    ];
    const missionIds: string[] = [];
    for (const [by, title, desc, pts, rec, scope, area] of missions) {
      const m = await one(
        `insert into missions (tenant_id, created_by, title, description, points, recurrence, scope, area_id, ends_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [tid, users[by], title, desc, pts, rec, scope, area, rec === 'once' ? cycle.ends_at : null], db);
      missionIds.push(m!.id);
    }

    // conclusões: algumas aprovadas, algumas pendentes
    const periodWeek = (await one(`select to_char(now() at time zone $1, 'IYYY-"W"IW') k`, [tenant!.timezone], db))!.k;
    const periodMonth = (await one(`select to_char(now() at time zone $1, 'YYYY-MM') k`, [tenant!.timezone], db))!.k;
    const comp = async (mi: number, who: string, period: string, status: 'approved' | 'pending', pts: number, reviewer?: string) => {
      await query(
        `insert into mission_completions (tenant_id, mission_id, user_id, cycle_id, period_key, status, points_awarded, reviewed_by, reviewed_at, completed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - interval '1 day')`,
        [tid, missionIds[mi], users[who], cycle.id, period, status, status === 'approved' ? pts : 0, reviewer ? users[reviewer] : null, status === 'approved' ? new Date() : null], db);
    };
    await comp(0, 'Ana Beatriz', periodWeek, 'approved', 10, 'Iran');
    await comp(0, 'Gabriel Nunes', periodWeek, 'approved', 10, 'Iran');
    await comp(0, 'Carla Mendes', periodWeek, 'pending', 10);
    await comp(1, 'Helena Costa', periodWeek, 'approved', 15, 'Iran');
    await comp(1, 'Bruno Lima', periodWeek, 'pending', 15);
    await comp(2, 'Marina Dias', periodMonth, 'pending', 20);
    await comp(3, 'Fernanda Souza', 'once', 'approved', 25, 'Diego Martins');

    // catálogo de prêmios do CEO (o prêmio em si é entregue fora do app)
    const rewards: Array<[string, string | null, string, number]> = [
      ['Vale-presente R$ 200', 'Para o 1º lugar da temporada.', 'individual', 1],
      ['Sexta de folga', 'Para o 2º lugar da temporada.', 'individual', 1],
      ['Happy hour por conta da casa', 'Se o time bater a meta coletiva.', 'team', 1],
      ['Café da manhã especial', null, 'wheel', 3],
      ['Sair 2h mais cedo numa sexta', null, 'wheel', 3],
      ['Almoço com o Iran', null, 'wheel', 2],
      ['Vale iFood R$ 50', null, 'wheel', 2],
      ['Escolhe a playlist da semana', null, 'wheel', 4],
      ['Dia de home office extra', null, 'wheel', 1],
    ];
    let ri = 0;
    for (const [title, desc, kind, weight] of rewards) {
      await query(`insert into rewards (tenant_id, title, description, kind, weight, sort_order) values ($1,$2,$3,$4,$5,$6)`, [tid, title, desc, kind, weight, ri++], db);
    }

    // reconhecimentos de exemplo (respeitando saldo 20 / custo 5 / máx 3 por pessoa)
    const recs: Array<[string, string, number, string | null, number]> = [
      ['Camila Rocha', 'Ana Beatriz', 2, 'Virou a noite com o cliente e entregou a apresentação impecável.', 3],
      ['Bruno Lima', 'Ana Beatriz', 0, null, 2],
      ['Diego Martins', 'Fernanda Souza', 2, 'A campanha ficou acima do briefing, cliente aprovou de primeira.', 2],
      ['Eduardo Reis', 'Fernanda Souza', 7, null, 1],
      ['Gabriel Nunes', 'Helena Costa', 4, 'Me ajudou a destravar o relatório de mídia mesmo sem ser dela.', 5],
      ['Helena Costa', 'Gabriel Nunes', 3, 'Puxou a reunião de segunda quando todo mundo tava desanimado.', 4],
      ['Iran', 'Camila Rocha', 1, 'Segurou o cliente mais difícil do mês com uma calma que eu não teria.', 6],
      ['Iran', 'Diego Martins', 0, null, 6],
      ['Juliana Alves', 'Lucas Ferreira', 3, 'A ideia do dashboard virou entrega pro cliente.', 1],
      ['Lucas Ferreira', 'Juliana Alves', 5, null, 0],
      ['Marina Dias', 'Bruno Lima', 0, 'Cuidou do cliente enquanto eu estava de folga, sem reclamar.', 1],
      ['Rafael Oliveira', 'Carla Mendes', 6, null, 0],
      ['Ana Beatriz', 'Camila Rocha', 6, null, 2],
      ['Carla Mendes', 'Eduardo Reis', 4, 'Revisou meu layout às 22h sem eu pedir.', 3],
      ['Fernanda Souza', 'Rafael Oliveira', 7, null, 1],
    ];
    const recIds: string[] = [];
    for (const [from, to, chip, msg, daysAgo] of recs) {
      const r = await one(
        `insert into recognitions (tenant_id, cycle_id, giver_id, receiver_id, chip_id, message, coins_spent, points_awarded, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$7, now() - ($8::int * interval '1 day') - (random() * interval '6 hours')) returning id`,
        [tid, cycle.id, users[from], users[to], chips[chip], msg, cycle.recognition_cost, daysAgo], db);
      recIds.push(r!.id);
    }
    // algumas palmas
    const claps: Array<[number, string]> = [[0, 'Iran'], [0, 'Marina Dias'], [0, 'Diego Martins'], [2, 'Iran'], [4, 'Ana Beatriz'], [5, 'Iran'], [5, 'Lucas Ferreira'], [6, 'Ana Beatriz'], [6, 'Bruno Lima']];
    for (const [ri, who] of claps) {
      await query(`insert into reactions (tenant_id, recognition_id, user_id) values ($1,$2,$3)`, [tid, recIds[ri], users[who]], db);
    }
    console.log(`Seed ok: tenant ${tenant!.name}, ${people.length} usuários, ${chips.length} chips, ${missions.length} missões, ciclo "${cycle.name}", ${recs.length} reconhecimentos.`);
    console.log(`Admin: iran@feeling.com.br · Gestores: camila@feeling.com.br, diego@feeling.com.br`);
  });
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
