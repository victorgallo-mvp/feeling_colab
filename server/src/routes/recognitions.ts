import { Router } from 'express';
import { validate, q } from '../middleware/validate.js';
import { wrap } from '../wrap.js';
import * as S from '../schemas.js';
import { feed, giveRecognition, setMessage, toggleReaction } from '../services/recognition.js';
import { getOpenCycle } from '../services/cycles.js';
import { pool } from '../db.js';

export const recognitionsRouter = Router();

recognitionsRouter.post('/', validate({ body: S.giveRecognitionBody }), wrap(async (req, res) => {
  const r = await giveRecognition({ tenantId: req.user.tenantId, giverId: req.user.id, receiverId: req.body.receiverId, chipId: req.body.chipId, message: req.body.message });
  res.status(201).json({ recognition: r.recognition, balance: r.balance, pairCount: r.pairCount, maxPerReceiver: r.cycle.max_per_receiver });
}));

recognitionsRouter.patch('/:id', validate({ params: S.idParam, body: S.messageBody }), wrap(async (req, res) => {
  res.json(await setMessage(req.user.tenantId, req.params.id as string, req.user.id, req.body.message));
}));

recognitionsRouter.get('/feed', validate({ query: S.feedQuery }), wrap(async (req, res) => {
  const { limit, before, cycleId, all } = q(req);
  const cycle = cycleId ?? (all ? null : (await getOpenCycle(req.user.tenantId, pool))?.id ?? null);
  res.json(await feed(req.user.tenantId, req.user.id, cycle, limit, before));
}));

recognitionsRouter.post('/:id/reactions', validate({ params: S.idParam }), wrap(async (req, res) => {
  res.json(await toggleReaction(req.user.tenantId, req.params.id as string, req.user.id));
}));
