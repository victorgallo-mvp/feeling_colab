import { Router } from 'express';
import { wrap } from '../wrap.js';
import { spin, weekWinner } from '../services/wheel.js';

export const wheelRouter = Router();
wheelRouter.get('/', wrap(async (req, res) => {
  const w = await weekWinner(req.user.tenantId);
  res.json({ ...w, can_spin: !!w.winner && w.winner.user_id === req.user.id && !w.spin && w.prizes.length > 0 });
}));
wheelRouter.post('/spin', wrap(async (req, res) => {
  res.json(await spin(req.user.tenantId, req.user.id));
}));
