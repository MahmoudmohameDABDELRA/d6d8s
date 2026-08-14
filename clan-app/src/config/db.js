import pg from 'pg';

import env from './env.js';
import { scoped } from './logger.js';

const log = scoped('db');

const { Pool } = pg;

/**
 *  قبل: بيانات الاتصال (user/password) مكتوبة داخل الكود.
 *  بعد: تُقرأ من DATABASE_URL — نفس المصدر الذي يستخدمه Prisma،
 *        فلا يحدث اختلاف بين الاثنين ولا تُسرَّب كلمة المرور في Git.
 */
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.isProduction ? { rejectUnauthorized: false } : false,
});

// أخطاء العملاء الخاملة في الـ pool لا تُلتقط بـ try/catch
pool.on('error', (error) => {
  log.error(' خطأ غير متوقع في PostgreSQL pool:', error.message);
});

export const connectPostgres = async () => {
  const client = await pool.connect();

  try {
    const result = await client.query('SELECT NOW() AS now');
    log.info(' PostgreSQL connected successfully', result.rows[0].now);
  } finally {
    //  release داخل finally: لا يتسرّب الاتصال حتى لو فشل الاستعلام
    client.release();
  }
};

export const disconnectPostgres = async () => {
  await pool.end();
  log.info(' PostgreSQL pool closed');
};

export default pool;
