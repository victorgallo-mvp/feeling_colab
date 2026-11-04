import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { one, pool, query } from '../db.js';
import { notFound } from '../errors.js';
import { listForUser } from '../services/achievements.js';
import { weeklyStreaks } from '../services/streak.js';

export const profileRouter = Router();

/** Perfil público (dentro do tenant): histórico de todas as temporadas, conquistas e sequência. */
profileRouter.get('/:id/profile', validate({ params: S.idParam }), wrap(async (req, res) => {
  const id = req.params.id as string;
  const user = await one(`select u.id, u.name, u.avatar_url, u.role, u.area_id, a.name as area_name, u.created_at from users u left join areas a on a.id = u.area_id where u.id = $1 and u.tenant_id = $2 and u.deleted_at is null`, [id, req.user.tenantId]);
  if (!user) throw notFound('Pessoa não encontrada');
  const [totals, byChip, recent, seasons, achievements, streaks] = await Promise.all([
    one(`select
      (select count(*)::int from recognitions where receiver_id = $1 and deleted_at is null) as received,
      (select coalesce(sum(points_awarded),0)::int from recognitions where receiver_id = $1 and deleted_at is null) as points_received,
      (select count(*)::int from recognitions where giver_id = $1 and deleted_at is null) as given,
      (select count(distinct giver_id)::int from recognitions where receiver_id = $1 and deleted_at is null) as distinct_givers,
      (select count(*)::int from mission_completions where user_id = $1 and status = 'approved' and deleted_at is null) as missions,
      (select min(rank) from cycle_user_snapshots where user_id = $1) as best_rank,
      (select count(*)::int from cycle_user_snapshots where user_id = $1) as seasons`, [id]),
    query(`select c.id, c.label, c.emoji, c.color, count(*)::int as count from recognitions r join chips c on c.id = r.chip_id where r.receiver_id = $1 and r.deleted_at is null group by c.id, c.label, c.emoji, c.color order by count desc, c.label`, [id]),
    query(`select r.id, r.message, r.created_at, g.name as giver_name, g.avatar_url as giver_avatar, json_build_object('id', c.id, 'label', c.label, 'emoji', c.emoji, 'color', c.color) as chip
           from recognitions r join users g on g.id = r.giver_id join chips c on c.id = r.chip_id where r.receiver_id = $1 and r.deleted_at is null and r.is_public order by r.created_at desc limit 12`, [id]),
    query(`select cy.id, cy.name, s.rank, s.points_total, s.recognitions_received, s.missions_completed, s.met_participation from cycle_user_snapshots s join cycles cy on cy.id = s.cycle_id where s.user_id = $1 order by cy.starts_at desc limit 12`, [id]),
    listForUser(id, pool),
    weeklyStreaks(req.user.tenantId, pool),
  ]);
  res.json({ user, totals, by_chip: byChip, recent, seasons, achievements, streak: streaks[id] ?? 0 });
}));
