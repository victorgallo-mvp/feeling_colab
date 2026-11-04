import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { forbidden, unauthorized } from '../errors.js';

export type Role = 'member' | 'manager' | 'admin';
export interface AuthUser {
  id: string;
  tenantId: string;
  role: Role;
  name: string;
  email: string;
  areaId: string | null;
}

declare global {
  namespace Express {
    interface Request { user: AuthUser; }
  }
}

export function signAccessToken(u: { id: string; tenant_id: string; role: Role }) {
  return jwt.sign({ sub: u.id, tid: u.tenant_id, role: u.role }, config.jwtSecret, { expiresIn: config.accessTokenTtl });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    let payload: any;
    try { payload = jwt.verify(token, config.jwtSecret); } catch { throw unauthorized('Sessão expirada'); }
    const user = await one(
      `select id, tenant_id, role, name, email, area_id from users where id = $1 and deleted_at is null and is_active`,
      [payload.sub],
    );
    if (!user || user.tenant_id !== payload.tid) throw unauthorized();
    req.user = { id: user.id, tenantId: user.tenant_id, role: user.role, name: user.name, email: user.email, areaId: user.area_id };
    next();
  } catch (e) { next(e); }
}

const rank: Record<Role, number> = { member: 0, manager: 1, admin: 2 };
export const requireRole = (min: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || rank[req.user.role] < rank[min]) return next(forbidden());
  next();
};
