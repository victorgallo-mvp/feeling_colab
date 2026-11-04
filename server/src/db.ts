import pg from 'pg';
import { config } from './config.js';

const wantSsl = /sslmode=require/.test(config.databaseUrl) || process.env.DATABASE_SSL === 'true';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: wantSsl ? { rejectUnauthorized: false } : undefined,
});

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v)); // bigint (count) -> number
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric -> number

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = [], db: Queryable = pool) {
  const res = await db.query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: any[] = [], db: Queryable = pool): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
