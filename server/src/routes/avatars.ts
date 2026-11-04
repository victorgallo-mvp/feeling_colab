import { Router } from 'express';
import multer from 'multer';
import { wrap } from '../wrap.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as S from '../schemas.js';
import { MAX_UPLOAD_BYTES, clearAvatar, readAvatar, setAvatar } from '../services/avatars.js';
import { badRequest, notFound } from '../errors.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
const single = (req: any, res: any, next: any) => upload.single('file')(req, res, (err: any) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return next(badRequest('Imagem muito grande (máx. 8 MB)', 'file_too_large'));
  next(err);
});

/** Público: <img> não manda Authorization. Versionado por ?v= na URL, cache longo. */
export const avatarsPublicRouter = Router();
avatarsPublicRouter.get('/:id', validate({ params: S.idParam }), wrap(async (req, res) => {
  const a = await readAvatar(req.params.id as string);
  if (!a) throw notFound();
  res.setHeader('Content-Type', a.avatar_mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(a.avatar_data);
}));

/** Autenticado: minha foto. */
export const myAvatarRouter = Router();
myAvatarRouter.use(requireAuth);
myAvatarRouter.post('/', single, wrap(async (req, res) => {
  if (!req.file) throw badRequest('Envie o arquivo no campo "file"', 'file_required');
  res.json(await setAvatar(req.user.tenantId, req.user.id, req.file));
}));
myAvatarRouter.delete('/', wrap(async (req, res) => {
  await clearAvatar(req.user.tenantId, req.user.id);
  res.json({ ok: true });
}));

/** Admin: foto de qualquer usuário do tenant. */
export const adminAvatarRouter = Router();
adminAvatarRouter.use(requireAuth, requireRole('admin'));
adminAvatarRouter.post('/:id/avatar', validate({ params: S.idParam }), single, wrap(async (req, res) => {
  if (!req.file) throw badRequest('Envie o arquivo no campo "file"', 'file_required');
  res.json(await setAvatar(req.user.tenantId, req.params.id as string, req.file));
}));
adminAvatarRouter.delete('/:id/avatar', validate({ params: S.idParam }), wrap(async (req, res) => {
  await clearAvatar(req.user.tenantId, req.params.id as string);
  res.json({ ok: true });
}));
