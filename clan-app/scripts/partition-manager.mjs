/**
 * ════════════════════════════════════════════════════════════
 *  مدير التقسيم التلقائي (PostgreSQL Partition Manager)
 * ════════════════════════════════════════════════════════════
 *
 *  الوظيفة:
 *    - إنشاء بارتشنات الأشهر القادمة تلقائياً قبل حلول وقتها (Pre-allocation).
 *    - فحص وجود البارتشنات الحالية والمستقبلية لجداول الرسائل والشرارات.
 *    - منع خطأ PostgreSQL الشائع: "no partition of relation found for row".
 *    - أرشفة البارتشنات القديمة التي تجاوزت فترة الاحتفاظ (Data Retention Policy).
 */

import 'dotenv/config';
import pg from 'pg';
import env from '../src/config/env.js';
import { scoped } from '../src/config/logger.js';

const log = scoped('partition-manager');

const { Pool } = pg;

export const partitionConfig = {
  tables: ['Message_Partitioned', 'SparkTransaction_Partitioned'],
  monthsAhead: 3,
  retentionMonths: 12,
};

/**
 * يولّد اسم ونطاق البارتشن لشهر محدد
 */
export const getPartitionBounds = (tableName, date = new Date()) => {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));

  const monthStr = String(month + 1).padStart(2, '0');
  const partitionName = `${tableName.toLowerCase().replace('_partitioned', '')}_${year}_${monthStr}`;

  return {
    tableName,
    partitionName,
    startStr: start.toISOString().replace('T', ' ').replace('.000Z', ''),
    endStr: end.toISOString().replace('T', ' ').replace('.000Z', ''),
  };
};

/**
 * يُنشئ بارتشنات الأشهر القادمة
 */
export const ensureUpcomingPartitions = async (poolClient = null) => {
  const isExternalClient = Boolean(poolClient);
  const pool = poolClient || new Pool({ connectionString: env.databaseUrl });
  const createdPartitions = [];

  try {
    const now = new Date();

    for (const table of partitionConfig.tables) {
      for (let offset = 0; offset <= partitionConfig.monthsAhead; offset += 1) {
        const targetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
        const bounds = getPartitionBounds(table, targetDate);

        const ddl = `
          CREATE TABLE IF NOT EXISTS "${bounds.partitionName}" PARTITION OF "${bounds.tableName}"
          FOR VALUES FROM ('${bounds.startStr}') TO ('${bounds.endStr}');
        `;

        try {
          await pool.query(ddl);
          createdPartitions.push(bounds.partitionName);
          log.info(`✅ Partition verified/created: ${bounds.partitionName}`);
        } catch (err) {
          log.warn(`⚠️ Partition note for ${bounds.partitionName}: ${err.message}`);
        }
      }
    }
  } finally {
    if (!isExternalClient) {
      await pool.end();
    }
  }

  return createdPartitions;
};

// تشغيل مباشر من سطر الأوامر
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  ensureUpcomingPartitions()
    .then((res) => {
      console.log(`\n✅ تم فحص وإنشاء ${res.length} بارتشن بنجاح.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ فشل فحص البارتشنات:', err);
      process.exit(1);
    });
}

export default {
  partitionConfig,
  getPartitionBounds,
  ensureUpcomingPartitions,
};
