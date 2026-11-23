/**
 * Gera um código de acesso pelo terminal, para quando o admin perde o próprio acesso.
 * Uso: npm run access-code -w server -- pessoa@empresa.com
 */
import { one, pool } from '../db.js';
import { createAccessCode } from '../services/auth.js';

async function main() {
  const email = process.argv[2];
  if (!email) { console.error('Informe o e-mail: npm run access-code -w server -- pessoa@empresa.com'); process.exit(1); }
  const u = await one(`select id, tenant_id from users where lower(email) = lower($1) and deleted_at is null and is_active order by created_at asc limit 1`, [email]);
  if (!u) { console.error(`Nenhuma pessoa ativa com o e-mail ${email}`); process.exit(1); }
  const c = await createAccessCode(u.tenant_id, u.id);
  console.log(`Código de ${c.name}: ${c.code}\nLink: ${c.link}\nUso único, vale até ${new Date(c.expires_at).toLocaleString('pt-BR')}.`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
