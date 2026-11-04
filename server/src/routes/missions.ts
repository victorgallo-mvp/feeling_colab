import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { pool, one, query } from '../db.js';
import { archiveMission, complete, createMission, listForUser, pendingQueue, review, templates } from '../services/missions.js';

export const missionsRouter = Router();

missionsRouter.get('/', wrap(async (req, res) => {
  res.json(await listForUser(req.user.tenantId, req.user.id, req.user.areaId, pool));
}));

missionsRouter.get('/templates', wrap(async (req, res) => {
  res.json(await templates(req.user.tenantId, pool));
}));

missionsRouter.post('/templates', requireRole('manager'), validate({ body: S.templateBody }), wrap(async (req, res) => {
  const t = await one(`insert into mission_templates (tenant_id, title, description, points, recurrence) values ($1,$2,$3,$4,$5) returning *`,
    [req.user.tenantId, req.body.title, req.body.description ?? null, req.body.points, req.body.recurrence]);
  res.status(201).json(t);
}));

missionsRouter.get('/mine', requireRole('manager'), wrap(async (req, res) => {
  const rows = await query(
    `select m.*, (select count(*)::int from mission_completions c where c.mission_id = m.id and c.status = 'pending' and c.deleted_at is null) as pending_count,
            (select count(*)::int from mission_completions c where c.mission_id = m.id and c.status = 'approved' and c.deleted_at is null) as approved_count
     from missions m where m.tenant_id = $1 and m.deleted_at is null and ($3::boolean or m.created_by = $2) order by m.created_at desc`,
    [req.user.tenantId, req.user.id, req.user.role === 'admin']);
  res.json(rows);
}));

missionsRouter.post('/', requireRole('manager'), validate({ body: S.createMissionBody }), wrap(async (req, res) => {
  const m = await createMission({ tenantId: req.user.tenantId, createdBy: req.user.id, ...req.body });
  res.status(201).json(m);
}));

missionsRouter.delete('/:id', requireRole('manager'), validate({ params: S.idParam }), wrap(async (req, res) => {
  await archiveMission(req.user.tenantId, req.params.id as string, req.user);
  res.json({ ok: true });
}));

missionsRouter.post('/:id/complete', validate({ params: S.idParam }), wrap(async (req, res) => {
  res.status(201).json(await complete(req.user.tenantId, req.params.id as string, req.user));
}));

export const completionsRouter = Router();

completionsRouter.get('/pending', requireRole('manager'), wrap(async (req, res) => {
  res.json(await pendingQueue(req.user.tenantId, req.user, pool));
}));

completionsRouter.post('/:id/review', requireRole('manager'), validate({ params: S.idParam, body: S.reviewBody }), wrap(async (req, res) => {
  res.json(await review(req.user.tenantId, req.params.id as string, req.user, req.body.approve, req.body.note));
}));
