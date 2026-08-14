#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 *  تجهيز قاعدة البيانات للتطوير المحلي
 *
 *  الاستخدام:  npm run db:setup
 *
 *  ⚠️ ليه السكربت ده موجود:
 *
 *   `prisma migrate deploy` بيقع بالخطأ ده:
 *      ERROR: column "onboarded" does not exist
 *
 *   السبب مش العمود ده لوحده. ميجريشن الأساس
 *   (20260729162529_full_schema) بتعمل **31 جدول**، والاسكيما
 *   الحالية فيها **64**. يعني الميجريشن اتكتبت وقت ما المشروع
 *   كان نصه، وبعدين الاسكيما كبرت من غير ما تتولد ميجريشن جديدة.
 *
 *   فالجدول بيتعمل ناقص أعمدة، وأول ميجريشن بتحاول تعمل فهرس على
 *   عمود مش موجود بتقع — وتوقف كل اللي بعدها.
 *
 *   الحل: `prisma db push` بيبني القاعدة **من الاسكيما مباشرة**،
 *   فبيطلع كل الـ 64 جدول بكل أعمدتهم. ودي الطريقة اللي بيوصي بيها
 *   Prisma للتطوير المحلي أصلاً.
 *
 *  ⚠️ الميجريشن التانية والتالتة (التقسيم والفهارس الجزئية) تحسينات
 *     أداء لعشرة آلاف مستخدم. محلياً مالهاش لزمة، وهي بالظبط اللي
 *     بتوقع التشغيل. للإنتاج استخدم `npm run prisma:deploy`.
 * ═══════════════════════════════════════════════════════════
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const say = (msg) => console.log(msg);
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' });

say('\n══════════════════════════════════════════');
say('  تجهيز قاعدة البيانات');
say('══════════════════════════════════════════\n');

// ── 1) .env موجود؟ ──
if (!existsSync(join(ROOT, '.env'))) {
  console.error('❌ ملف .env مش موجود.');
  console.error('   انسخه من القالب:  cp .env.example .env\n');
  process.exit(1);
}

// ── 2) القاعدة شغالة؟ ──
say('① بيتأكد إن قاعدة البيانات شغالة…');
try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env') });
} catch {
  /* dotenv مش متاح — prisma هيقرا .env بنفسه */
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL مش موجود في .env\n');
  process.exit(1);
}

// ── 3) بناء القاعدة من الاسكيما ──
say('② بيبني الجداول من الاسكيما…\n');
try {
  run('npx prisma db push --skip-generate --accept-data-loss');
} catch {
  console.error('\n❌ فشل بناء القاعدة.');
  console.error('   تأكد إن الدوكر شغال:');
  console.error('     docker compose -f docker-compose.dev.yml up -d');
  console.error('     docker ps\n');
  process.exit(1);
}

// ── 4) توليد عميل Prisma ──
say('\n③ بيولّد عميل Prisma…\n');
try {
  run('npx prisma generate');
} catch {
  console.error('\n❌ فشل توليد العميل.\n');
  process.exit(1);
}

say('\n══════════════════════════════════════════');
say('  ✅ قاعدة البيانات جاهزة');
say('══════════════════════════════════════════\n');
say('  الخطوة الجاية — تيرمينالين:');
say('    npm run dev       ← السيرفر');
say('    npm run worker    ← الجوبس\n');
