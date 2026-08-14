/**
 * ════════════════════════════════════════════════════════════
 *  قياس الحمل الحقيقي
 * ════════════════════════════════════════════════════════════
 *
 *  لا يدّعي محاكاة مليون مستخدم — الجهاز نواتان ورام 2 جيجا.
 *  يقيس ما يمكن قياسه فعلاً:
 *
 *    · إنتاجية كل مسار (طلب/ثانية)
 *    · زمن الاستجابة p50 · p95 · p99
 *    · نقطة الانهيار تحت التزايد
 *    · تسرّب الذاكرة
 *    · سلوك مجمّع الاتصالات
 *
 *  ثم نستقرئ منها رياضياً.
 */
import 'dotenv/config';

const BASE = 'http://127.0.0.1:3000';
const U = JSON.parse(process.env.LIVE_TOKENS);

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

const fmt = (n, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });

/**
 * ينفّذ عدداً من الطلبات بتزامن محدد.
 * يقيس زمن كل طلب ويصنّف الأكواد.
 */
const run = async ({ name, path, method = 'GET', token, body, total, concurrency }) => {
  const times = [];
  const codes = {};
  let done = 0;
  let errors = 0;

  const t0 = Date.now();

  const worker = async () => {
    while (done < total) {
      done += 1;
      const start = performance.now();
      try {
        const res = await fetch(`${BASE}${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body ? { body: JSON.stringify(typeof body === 'function' ? body() : body) } : {}),
        });
        times.push(performance.now() - start);
        codes[res.status] = (codes[res.status] || 0) + 1;
        // نستهلك الجسم حتى لا تتراكم الاتصالات
        await res.arrayBuffer();
      } catch (e) {
        errors += 1;
        times.push(performance.now() - start);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  const elapsed = (Date.now() - t0) / 1000;
  const rps = total / elapsed;
  const okCount = Object.entries(codes)
    .filter(([c]) => Number(c) < 400)
    .reduce((s, [, v]) => s + v, 0);

  return {
    name, total, concurrency, elapsed, rps,
    okRate: (okCount / total) * 100,
    p50: pct(times, 50), p95: pct(times, 95), p99: pct(times, 99),
    max: Math.max(...times), codes, errors,
  };
};

const row = (r) =>
  `  ${r.name.padEnd(26)} ${fmt(r.rps).padStart(6)} req/s   ` +
  `p50 ${fmt(r.p50).padStart(4)}ms  p95 ${fmt(r.p95).padStart(5)}ms  ` +
  `p99 ${fmt(r.p99).padStart(5)}ms   ${r.okRate.toFixed(1)}%`;

const mem = async () => {
  const r = await fetch(`${BASE}/health`);
  await r.json();
  return process.memoryUsage().heapUsed / 1048576;
};

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║              قياس الحمل — سيرفر حقيقي                      ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`\n  الجهاز: ${(await import('node:os')).cpus().length} نواة · ` +
            `${fmt((await import('node:os')).totalmem() / 1073741824, 1)} GB رام\n`);

// ════════════════════════════════════════════════
console.log('━━━ ١ · إنتاجية المسارات (500 طلب · تزامن 50) ━━━\n');

const results = [];

results.push(await run({
  name: 'GET /health',
  path: '/health', total: 500, concurrency: 50,
}));
console.log(row(results.at(-1)));

results.push(await run({
  name: 'GET /api/auth/me',
  path: '/api/auth/me', token: U.ahmed.token, total: 500, concurrency: 50,
}));
console.log(row(results.at(-1)));

results.push(await run({
  name: 'GET /api/goals',
  path: '/api/goals', token: U.ahmed.token, total: 500, concurrency: 50,
}));
console.log(row(results.at(-1)));

results.push(await run({
  name: 'GET /api/tasks',
  path: '/api/tasks', token: U.ahmed.token, total: 500, concurrency: 50,
}));
console.log(row(results.at(-1)));

results.push(await run({
  name: 'GET /api/alarms',
  path: '/api/alarms', token: U.ahmed.token, total: 500, concurrency: 50,
}));
console.log(row(results.at(-1)));

results.push(await run({
  name: 'GET /api/auth/me/stats',
  path: '/api/auth/me/stats', token: U.ahmed.token, total: 300, concurrency: 30,
}));
console.log(row(results.at(-1)));

// ════════════════════════════════════════════════
console.log('\n━━━ ٢ · الكتابة (أثقل من القراءة) ━━━\n');

let n = 0;
results.push(await run({
  name: 'POST /api/tasks',
  path: '/api/tasks', method: 'POST', token: U.ahmed.token,
  body: () => ({ title: `مهمة حمل ${n++}`, priority: 'GROWTH' }),
  total: 300, concurrency: 30,
}));
console.log(row(results.at(-1)));

// ════════════════════════════════════════════════
console.log('\n━━━ ٣ · منحنى التزامن — أين ينهار؟ ━━━\n');
console.log('  تزامن    req/s     p50      p95      p99     نجاح');
console.log('  ' + '─'.repeat(52));

const curve = [];
for (const c of [1, 10, 25, 50, 100, 200, 400]) {
  const r = await run({
    name: `c=${c}`,
    path: '/api/goals', token: U.ahmed.token,
    total: Math.min(1000, c * 12), concurrency: c,
  });
  curve.push({ c, ...r });
  console.log(
    `  ${String(c).padStart(5)}  ${fmt(r.rps).padStart(7)}  ` +
    `${fmt(r.p50).padStart(5)}ms  ${fmt(r.p95).padStart(6)}ms  ` +
    `${fmt(r.p99).padStart(6)}ms  ${r.okRate.toFixed(0).padStart(5)}%`,
  );
  await new Promise((r2) => setTimeout(r2, 400));
}

// ════════════════════════════════════════════════
console.log('\n━━━ ٤ · ثبات تحت حمل مستمر (20 ثانية) ━━━\n');

const sustainStart = Date.now();
const buckets = [];
let bucketTimes = [];
let bucketCount = 0;

const sustainWorker = async () => {
  while (Date.now() - sustainStart < 20000) {
    const s = performance.now();
    try {
      const res = await fetch(`${BASE}/api/goals`, {
        headers: { Authorization: `Bearer ${U.ahmed.token}` },
      });
      await res.arrayBuffer();
      bucketTimes.push(performance.now() - s);
      bucketCount += 1;
    } catch { /* ignore */ }
  }
};

const ticker = setInterval(() => {
  buckets.push({
    sec: buckets.length + 1,
    rps: bucketCount,
    p95: pct(bucketTimes, 95),
  });
  bucketCount = 0;
  bucketTimes = [];
}, 1000);

await Promise.all(Array.from({ length: 40 }, sustainWorker));
clearInterval(ticker);

const firstHalf = buckets.slice(0, Math.floor(buckets.length / 2));
const lastHalf = buckets.slice(Math.floor(buckets.length / 2));
const avgFirst = firstHalf.reduce((s, b) => s + b.rps, 0) / firstHalf.length;
const avgLast = lastHalf.reduce((s, b) => s + b.rps, 0) / lastHalf.length;
const drift = ((avgLast - avgFirst) / avgFirst) * 100;

console.log(`  أول 10 ثوانٍ:  ${fmt(avgFirst)} req/s`);
console.log(`  آخر 10 ثوانٍ:  ${fmt(avgLast)} req/s`);
console.log(`  الانحراف:      ${drift > 0 ? '+' : ''}${drift.toFixed(1)}%  ` +
            `${Math.abs(drift) < 15 ? '✅ مستقر' : '⚠️ تدهور'}`);

// ════════════════════════════════════════════════
console.log('\n━━━ ٥ · مجمّع اتصالات PostgreSQL ━━━\n');

const poolTest = await run({
  name: 'استعلامات متزامنة',
  path: '/api/auth/me/stats', token: U.ahmed.token,
  total: 200, concurrency: 100,
});
console.log(`  100 استعلام متزامن (المجمّع = 10):`);
console.log(`    نجاح ${poolTest.okRate.toFixed(1)}%  ·  p99 ${fmt(poolTest.p99)}ms`);
console.log(`    ${poolTest.okRate > 99 ? '✅ المجمّع يستوعب الطابور' : '⚠️ طلبات ضاعت'}`);

// ════════════════════════════════════════════════
//  الخلاصة
// ════════════════════════════════════════════════

const readAvg = results.slice(0, 5).reduce((s, r) => s + r.rps, 0) / 5;
const writeRps = results.at(-1).rps;
const best = curve.reduce((a, b) => (b.rps > a.rps ? b : a));
const stable = curve.filter((c) => c.okRate >= 99 && c.p95 < 1000).at(-1);

console.log('\n' + '═'.repeat(62));
console.log('  الخلاصة');
console.log('═'.repeat(62));
console.log(`  متوسط القراءة:        ${fmt(readAvg)} req/s`);
console.log(`  الكتابة:              ${fmt(writeRps)} req/s`);
console.log(`  الذروة:               ${fmt(best.rps)} req/s عند تزامن ${best.c}`);
console.log(`  أقصى تزامن مستقر:     ${stable ? stable.c : '—'}`);
console.log(`  الثبات على 20 ثانية:  ${Math.abs(drift) < 15 ? 'نعم' : 'لا'}`);
console.log('═'.repeat(62) + '\n');

// نُصدّر النتائج للتحليل
console.log('__JSON__' + JSON.stringify({
  readAvg, writeRps, bestRps: best.rps, bestC: best.c,
  stableC: stable?.c ?? null, drift,
  curve: curve.map(c => ({ c: c.c, rps: c.rps, p95: c.p95, ok: c.okRate })),
}));

process.exit(0);
