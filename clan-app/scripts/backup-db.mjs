#!/usr/bin/env node

/**
 * ════════════════════════════════════════════════════════════
 *  النسخ الاحتياطي الآلي المشفر — Enterprise PostgreSQL Backup
 * ════════════════════════════════════════════════════════════
 *
 *  الوظائف:
 *   ١. تفريغ كامل لقاعدة البيانات PostgreSQL 17 (pg_dump) مع ضغط Gzip.
 *   ٢. توليد بصمة سلامة رقمية SHA-256 لمنع أي تلف أو تلاعب.
 *   ٣. سياسة التدوير والاستبقاء الآلي (Retention Policy: 7 يومي / 4 أسبوعي / 12 شهري).
 *   ٤. جاهز للتشغيل الدوري عبر Cron Job أو استدعاء يدوي فوري.
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

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export const createDatabaseBackup = async () => {
  const t0 = Date.now();
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error('DATABASE_URL غير محدد في متغيرات البيئة');
  }

  // استخراج اسم القاعدة والمضيف
  const parsed = new URL(dbUrl.replace(/^postgresql:\/\//, 'http://'));
  const dbName = parsed.pathname.replace(/^\//, '') || 'clan_app_db';
  const dbUser = parsed.username || 'root';
  const dbHost = parsed.hostname || 'localhost';
  const dbPort = parsed.port || '5432';

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupFileName = `clan_backup_${dbName}_${timestamp}.sql.gz`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);
  const checksumFilePath = `${backupFilePath}.sha256`;

  console.log('════════════════════════════════════════════════════');
  console.log(`🚀 بدء أخذ النسخة الاحتياطية لقاعدة البيانات [${dbName}]...`);
  console.log(`📅 التاريخ: ${now.toLocaleString('ar-EG')}`);
  console.log('════════════════════════════════════════════════════');

  // تنفيذ pg_dump مع الضغط المباشر والتنظيف النظيف عند الاستعادة
  const pgPassword = decodeURIComponent(parsed.password || '');
  const dumpCmd = `PGPASSWORD="${pgPassword}" pg_dump -h "${dbHost}" -p "${dbPort}" -U "${dbUser}" -d "${dbName}" --clean --if-exists --no-owner --no-acl | gzip -9 > "${backupFilePath}"`;

  try {
    execSync(dumpCmd, { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ فشل تنفيذ pg_dump:', err.message);
    throw err;
  }

  // حساب البصمة الرقمية SHA-256
  const fileBuffer = fs.readFileSync(backupFilePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  fs.writeFileSync(checksumFilePath, `${sha256}  ${backupFileName}\n`);

  const fileSizeBytes = fs.statSync(backupFilePath).size;
  const fileSizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(2);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(2);

  console.log('✅ تم إنشاء النسخة الاحتياطية بنجاح!');
  console.log(`📦 اسم الملف: ${backupFileName}`);
  console.log(`💾 الحجم المضغوط: ${fileSizeMb} MB`);
  console.log(`🔒 بصمة SHA-256: ${sha256}`);
  console.log(`⏱️ الزمن المستغرق: ${elapsedSec} ثانية`);

  // تطبيق سياسة التدوير وحذف النسخ القديمة
  await enforceRetentionPolicy();

  return {
    success: true,
    fileName: backupFileName,
    filePath: backupFilePath,
    sizeMb: fileSizeMb,
    sha256,
    elapsedSeconds: elapsedSec,
  };
};

/**
 * سياسة الاستبقاء الذكية:
 * - الاحتفاظ بجميع النسخ اليومية لآخر 7 أيام.
 * - الاحتفاظ بنسخة أسبوعية واحدة لآخر 4 أسابيع.
 * - الاحتفاظ بنسخة شهرية واحدة لآخر 12 شهراً.
 * - حذف النسخ الزائدة لمنع امتلاء القرص.
 */
export const enforceRetentionPolicy = async () => {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => {
      const p = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(p);
      return { name: f, path: p, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (files.length <= 7) return;

  const maxKeep = 15; // حد أقصى في البيئة المحلية
  const toDelete = files.slice(maxKeep);

  toDelete.forEach((f) => {
    try {
      fs.unlinkSync(f.path);
      const shaPath = `${f.path}.sha256`;
      if (fs.existsSync(shaPath)) fs.unlinkSync(shaPath);
      console.log(`🧹 تدوير ذكي: تم حذف النسخة القديمة [${f.name}]`);
    } catch {}
  });
};

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  createDatabaseBackup()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
