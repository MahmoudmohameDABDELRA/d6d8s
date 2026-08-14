/**
 * كانس اليتامى — يُشغَّل من cron أو يدوياً.
 *
 * ⚠️ خارج عملية الـ API عمداً: مسح ملايين الوثائق داخل حلقة
 *    الأحداث التي تخدم الطلبات يجمّد التطبيق.
 *
 *   node scripts/reap.mjs --dry     # عرض بلا حذف
 *   node scripts/reap.mjs           # تنفيذ
 *
 * مقترح: يومياً في ساعة هادئة.
 */
import 'dotenv/config';

const dryRun = process.argv.includes('--dry');

const prisma = (await import('../src/config/prisma.js')).default;

const reaper = await import('../src/services/orphanReaper.service.js');

console.log(dryRun ? '🔍 عرض فقط (--dry)\n' : '🧹 تنفيذ\n');

const t0 = Date.now();
const r = await reaper.reapAll({ dryRun });

console.log('جلسات معلّقة:');
console.log(`   ${r.staleSessions.found} · أُغلق ${r.staleSessions.closed}`);

console.log('رموز منتهية:');
console.log(`   ${r.expiredTokens.found} · حُذف ${r.expiredTokens.deleted}`);

console.log(`\n⏱️  ${Date.now() - t0}ms`);

await prisma.$disconnect();
