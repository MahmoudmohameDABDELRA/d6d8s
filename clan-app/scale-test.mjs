/**
 * اختبار التوسّع: هل الأداء يتدهور مع نمو البيانات؟
 *
 * السؤال الحقيقي في مليون مستخدم ليس "كم طلب/ثانية"
 * بل "هل الاستعلام يبقى سريعاً وقاعدة البيانات ممتلئة؟"
 *
 * نزرع بيانات متزايدة ونقيس نفس الاستعلام في كل مرحلة.
 */
import 'dotenv/config';
import prisma from './src/config/prisma.js';

const BASE = 'http://127.0.0.1:3000';
const U = JSON.parse(process.env.LIVE_TOKENS);

const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

/** يقيس زمن استعلام مباشر على القاعدة */
const timeQuery = async (label, fn, runs = 20) => {
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return { label, p50: times[Math.floor(runs * 0.5)], p95: times[Math.floor(runs * 0.95)] };
};

/** يقيس زمن مسار HTTP */
const timeApi = async (path, token, runs = 20) => {
  const times = [];
  for (let i = 0; i < runs; i += 1) {
    const t = performance.now();
    const r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await r.arrayBuffer();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(runs * 0.5)];
};

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║       اختبار التوسّع — الأداء مع نمو البيانات            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

const userId = U.ahmed.id;

// ── نظّف ──
await prisma.taskStep.deleteMany({ where: { task: { userId } } });
await prisma.taskHistory.deleteMany({ where: { task: { userId } } });
await prisma.task.deleteMany({ where: { userId } });
await prisma.sparkTransaction.deleteMany({ where: { userId } });

console.log('  حجم البيانات      قائمة المهام    الإحصاءات    معاملات الشرارات');
console.log('  ' + '─'.repeat(66));

const stages = [100, 1000, 5000, 20000, 50000];
const measurements = [];
let created = 0;

for (const target of stages) {
  // نزرع الفرق فقط
  const toAdd = target - created;
  const CHUNK = 2000;

  for (let i = 0; i < toAdd; i += CHUNK) {
    const batch = Math.min(CHUNK, toAdd - i);
    await prisma.task.createMany({
      data: Array.from({ length: batch }, (_, k) => ({
        userId,
        title: `مهمة ${created + i + k}`,
        priority: ['CRITICAL', 'GROWTH', 'QUICK'][(created + i + k) % 3],
        isCompleted: (created + i + k) % 2 === 0,
      })),
    });
    await prisma.sparkTransaction.createMany({
      data: Array.from({ length: batch }, (_, k) => ({
        userId,
        amount: 2,
        source: 'TASK_COMPLETED',
        balanceAfter: 500 + created + i + k,
      })),
    });
  }
  created = target;

  const listMs = await timeApi('/api/tasks', U.ahmed.token, 15);
  const statsMs = await timeApi('/api/auth/me/stats', U.ahmed.token, 15);
  const sparkQ = await timeQuery('sparks', () =>
    prisma.sparkTransaction.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 50,
    }), 15);

  measurements.push({ n: target, list: listMs, stats: statsMs, spark: sparkQ.p50 });

  console.log(
    `  ${fmt(target).padStart(8)} صف   ` +
    `${fmt(listMs).padStart(9)}ms   ` +
    `${fmt(statsMs).padStart(9)}ms   ` +
    `${fmt(sparkQ.p50).padStart(12)}ms`,
  );
}

// ── التحليل ──
const first = measurements[0];
const last = measurements.at(-1);
const growth = last.n / first.n;
const listSlow = last.list / first.list;
const statsSlow = last.stats / first.stats;
const sparkSlow = last.spark / first.spark;

console.log('\n  ' + '─'.repeat(66));
console.log(`  البيانات نمت ×${fmt(growth)}`);
console.log(`  قائمة المهام تباطأت ×${fmt(listSlow, 1)}   ${listSlow < 3 ? '✅' : '⚠️'}`);
console.log(`  الإحصاءات تباطأت ×${fmt(statsSlow, 1)}   ${statsSlow < 3 ? '✅' : '⚠️'}`);
console.log(`  الشرارات تباطأت ×${fmt(sparkSlow, 1)}   ${sparkSlow < 3 ? '✅' : '⚠️'}`);

const linear = growth;
console.log(`\n  لو كان الاستعلام خطياً (بلا فهرس) لتباطأ ×${fmt(linear)}`);
console.log(`  الفعلي ×${fmt(Math.max(listSlow, statsSlow, sparkSlow), 1)} → ` +
            `${Math.max(listSlow, statsSlow, sparkSlow) < linear / 10 ? '✅ الفهارس تعمل' : '⚠️ مسح كامل'}`);

// ── خطة تنفيذ حقيقية من PostgreSQL ──
console.log('\n━━━ خطة التنفيذ الفعلية (EXPLAIN) ━━━\n');

const plans = await prisma.$queryRawUnsafe(`
  EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  SELECT * FROM "Task" WHERE "userId" = '${userId}'
  ORDER BY "createdAt" DESC LIMIT 50
`);
const plan = plans[0]['QUERY PLAN'][0];
const node = plan.Plan;

console.log(`  نوع المسح:     ${node['Node Type']}`);
console.log(`  زمن التنفيذ:   ${fmt(plan['Execution Time'], 2)}ms`);
console.log(`  صفوف مفحوصة:   ${fmt(node['Actual Rows'])}`);

const usesIndex = JSON.stringify(node).includes('Index');
console.log(`  ${usesIndex ? '✅ يستخدم فهرساً' : '❌ مسح كامل للجدول (Seq Scan)'}`);

// ── حجم الجداول ──
console.log('\n━━━ حجم البيانات على القرص ━━━\n');
const sizes = await prisma.$queryRawUnsafe(`
  SELECT relname AS table, n_live_tup AS rows,
         pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_stat_user_tables
  WHERE n_live_tup > 0
  ORDER BY n_live_tup DESC LIMIT 6
`);
sizes.forEach((s) => {
  console.log(`  ${s.table.padEnd(22)} ${fmt(Number(s.rows)).padStart(9)} صف   ${s.size}`);
});

// ── تنظيف ──
console.log('\n  جارٍ التنظيف...');
await prisma.sparkTransaction.deleteMany({ where: { userId } });
await prisma.task.deleteMany({ where: { userId } });

console.log('\n' + '═'.repeat(60));
console.log(`  ${listSlow < 3 && usesIndex ? '✅ التوسّع سليم — الفهارس تحمي الأداء' : '⚠️ يحتاج مراجعة'}`);
console.log('═'.repeat(60) + '\n');

await prisma.$disconnect();
process.exit(0);
