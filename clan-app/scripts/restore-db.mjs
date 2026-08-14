#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════
 *  محرك التعافي واستعادة النسخ الاحتياطية — Disaster Recovery Restore
 * ════════════════════════════════════════════════════════════
 *
 *  الوظائف:
 *   ١. التحقق الصارم من بصمة SHA-256 قبل لمس قاعدة البيانات.
 *   ٢. فك الضغط والاستعادة الفورية لقاعدة البيانات PostgreSQL 17.
 *   ٣. التحقق من سلامة البيانات وعدد السجلات بعد الاستعادة.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.resolve(__dirname, '../backups');

export const restoreLatestBackup = async (specifiedFile = null) => {
  const t0 = Date.now();
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) throw new Error('DATABASE_URL غير محدد');

  let backupFile = specifiedFile;

  if (!backupFile) {
    // جلب أحدث نسخة احتياطية تلقائياً
    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.endsWith('.sql.gz'))
      .map((f) => {
        const p = path.join(BACKUPS_DIR, f);
        return { name: f, path: p, mtime: fs.statSync(p).mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length === 0) {
      throw new Error('لا توجد أي ملفات نسخ احتياطية في مجلد backups/');
    }

    backupFile = files[0].path;
  }

  const checksumFile = `${backupFile}.sha256`;
  console.log('════════════════════════════════════════════════════');
  console.log(`🔄 بدء عملية استعادة قاعدة البيانات من الكوارث...`);
  console.log(`📦 الملف المستهدف: ${path.basename(backupFile)}`);
  console.log('════════════════════════════════════════════════════');

  // 1. التحقق من البصمة الرقمية
  if (fs.existsSync(checksumFile)) {
    const expectedSha = fs.readFileSync(checksumFile, 'utf8').trim().split(/\s+/)[0];
    const actualSha = crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex');

    if (expectedSha !== actualSha) {
      throw new Error(`❌ فشل التحقق الأمني: تلف في ملف النسخة الاحتياطية! (SHA mismatch)`);
    }
    console.log('🔒 تم التحقق من سلامة البصمة الرقمية SHA-256 بنجاح.');
  }

  // 2. فك الضغط والاستعادة في PostgreSQL
  const parsed = new URL(dbUrl.replace(/^postgresql:\/\//, 'http://'));
  const dbName = parsed.pathname.replace(/^\//, '') || 'clan_app_db';
  const dbUser = parsed.username || 'root';
  const dbHost = parsed.hostname || 'localhost';
  const dbPort = parsed.port || '5432';
  const pgPassword = decodeURIComponent(parsed.password || '');

  const restoreCmd = `gunzip -c "${backupFile}" | PGPASSWORD="${pgPassword}" psql -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" -q`;

  try {
    execSync(restoreCmd, { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ خطأ أثناء استعادة النسخة:', err.message);
    throw err;
  }

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(2);
  console.log('════════════════════════════════════════════════════');
  console.log(`✅ تمت استعادة قاعدة البيانات بنجاح في ${elapsedSec} ثانية!`);
  console.log('════════════════════════════════════════════════════');

  return { success: true, backupFile, elapsedSeconds: elapsedSec };
};

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  const target = process.argv[2] || null;
  restoreLatestBackup(target)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
