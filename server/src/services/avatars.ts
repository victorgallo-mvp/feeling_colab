import sharp from 'sharp';
import { one, query } from '../db.js';
import { config } from '../config.js';
import { badRequest, notFound } from '../errors.js';

const SIZE = 256;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Recorta ao quadrado (centro), reduz e converte pra WebP. ~10–25 KB por foto, guardada no Postgres. */
export async function setAvatar(tenantId: string, userId: string, file: { buffer: Buffer; mimetype: string }) {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif|avif)$/i.test(file.mimetype)) throw badRequest('Envie uma imagem (JPG, PNG, WebP ou HEIC)', 'invalid_image');
  let data: Buffer;
  try {
    data = await sharp(file.buffer, { failOn: 'none' }).rotate().resize(SIZE, SIZE, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw badRequest('Não consegui ler esta imagem', 'invalid_image');
  }
  const u = await one(
    `update users set avatar_data = $3, avatar_mime = 'image/webp', avatar_updated_at = now(),
       avatar_url = $4 || '/api/avatars/' || id::text || '?v=' || extract(epoch from now())::bigint::text, updated_at = now()
     where id = $1 and tenant_id = $2 and deleted_at is null returning id, avatar_url`,
    [userId, tenantId, data, config.apiUrl], );
  if (!u) throw notFound('Usuário não encontrado');
  return u;
}

export async function clearAvatar(tenantId: string, userId: string) {
  const u = await one(`update users set avatar_data = null, avatar_mime = null, avatar_updated_at = now(), avatar_url = null, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null returning id`, [userId, tenantId]);
  if (!u) throw notFound('Usuário não encontrado');
}

export async function readAvatar(userId: string) {
  return one<{ avatar_data: Buffer; avatar_mime: string; avatar_updated_at: Date }>(`select avatar_data, avatar_mime, avatar_updated_at from users where id = $1 and avatar_data is not null`, [userId]);
}

export { query };
