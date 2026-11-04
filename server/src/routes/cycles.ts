import { Router } from 'express';
import { validate, q } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { one, pool, query } from '../db.js';
import { closeCycle, cycleSummary, ensureOpenCycle, inactiveUsers } from '../services/cycles.js';
import { notFound } from '../errors.js';

export const cyclesRouter = Router();

cyclesRouter.get('/current', wrap(async (req, res) => {
  res.json(await ensureOpenCycle(req.user.tenantId));
}));

cyclesRouter.get('/', wrap(async (req, res) => {
  res.json(await query(`select id, name, starts_at, ends_at, status, closed_at, team_goal_reached, participation_pct, team_reward_note from cycles where tenant_id = $1 and deleted_at is null order by starts_at desc`, [req.user.tenantId]));
}));

// Resumo: colaboradores veem ranking + reconhecimentos públicos; só admin vê notas de prêmio
cyclesRouter.get('/:id/summary', validate({ params: S.idParam }), wrap(async (req, res) => {
  const s = await cycleSummary(req.user.tenantId, req.params.id as string, pool);
  if (req.user.role !== 'admin') {
    s.ranking = s.ranking.map((r: any) => ({ ...r, individual_reward_note: undefined }));
    (s as any).cycle = { ...s.cycle, team_reward_note: s.cycle.status === 'closed' ? s.cycle.team_reward_note : null };
  }
  res.json(s);
}));

cyclesRouter.post('/:id/close', requireRole('admin'), validate({ params: S.idParam, body: S.closeCycleBody }), wrap(async (req, res) => {
  const r = await closeCycle(req.user.tenantId, req.params.id as string, req.user.id, req.body.teamRewardNote);
  res.json({ closed: r.closed, next: r.next, participation: r.participation });
}));

cyclesRouter.patch('/:id/team-reward', requireRole('admin'), validate({ params: S.idParam, body: S.teamRewardBody }), wrap(async (req, res) => {
  const c = await one(`update cycles set team_reward_note = $3, updated_at = now() where id = $1 and tenant_id = $2 returning *`, [req.params.id, req.user.tenantId, req.body.note]);
  if (!c) throw notFound('Ciclo não encontrado');
  res.json(c);
}));

cyclesRouter.patch('/:id/rewards/:userId', requireRole('admin'), validate({ params: S.idParam.extend({ userId: S.uuid }), body: S.rewardNoteBody }), wrap(async (req, res) => {
  const s = await one(`update cycle_user_snapshots set individual_reward_note = $4, updated_at = now() where cycle_id = $1 and user_id = $2 and tenant_id = $3 returning *`,
    [req.params.id, req.params.userId, req.user.tenantId, req.body.note]);
  if (!s) throw notFound('Snapshot não encontrado (o ciclo ainda está aberto?)');
  res.json(s);
}));

cyclesRouter.get('/admin/inactive', requireRole('admin'), validate({ query: S.inactiveQuery }), wrap(async (req, res) => {
  res.json(await inactiveUsers(req.user.tenantId, q(req).days, pool));
}));
