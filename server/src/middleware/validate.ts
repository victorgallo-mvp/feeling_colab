import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { badRequest } from '../errors.js';

type Parts = { body?: z.ZodTypeAny; query?: z.ZodTypeAny; params?: z.ZodTypeAny };

export const validate = (parts: Parts) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (parts.body) req.body = parts.body.parse(req.body ?? {});
    if (parts.query) (req as any).validatedQuery = parts.query.parse(req.query ?? {});
    if (parts.params) req.params = parts.params.parse(req.params) as any;
    next();
  } catch (e) {
    if (e instanceof ZodError) return next(badRequest('Dados inválidos', 'validation', e.issues));
    next(e);
  }
};
export const q = (req: Request) => (req as any).validatedQuery ?? req.query;
