import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '../errors.js';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido', code: 'bad_json' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno', code: 'internal' });
}
