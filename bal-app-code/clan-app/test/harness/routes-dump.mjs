/**
 * ═══════════════════════════════════════════════════════════
 *  استخراج كل مسارات الـ API الحقيقية من الراوترات نفسها
 *
 *  ️ ليه من الراوترات مش من `app._router`:
 *     Express 5 بيلفّ الميدلوير في matchers مقفولة، فمفيش طريقة
 *     موثوقة تقرأ البادئة من الـ stack. هنا بنقرا `app.js` عشان
 *     نعرف كل `app.use('/api/x', xRoutes)` بيتربط بأنهي ملف،
 *     وبعدين نستورد الراوتر نفسه ونقرا مساراته. النتيجة دقيقة
 *     ١٠٠٪ لأنها من نفس الكائن اللي Express بيستخدمه.
 *
 *  المخرج: test/harness/routes.snapshot.json
 *  بيستهلكه: test/api-contract.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import { writeFileSync, readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/t';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'harness-access-secret-long-enough-0000';
process.env.JWT_REFRESH_SECRET ??= 'harness-refresh-secret-long-enough-11';
process.env.ENABLE_EMAIL_AUTH = 'true';
process.env.NODE_ENV = 'development';
process.env.LOG_LEVEL ??= 'silent';

const appSrc = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');

/** اسم المتغيّر → مسار الملف */
const imports = Object.fromEntries(
  [...appSrc.matchAll(/import\s+(\w+)\s+from\s+'(\.\/modules\/[^']+)'/g)].map((m) => [
    m[1],
    m[2],
  ]),
);

/** كل app.use('/api/...', router) */
const mounts = [...appSrc.matchAll(/app\.use\('(\/api[^']*)',\s*(\w+)\)/g)]
  .filter((m) => imports[m[2]])
  .map((m) => ({ prefix: m[1], mod: imports[m[2]] }));

const out = [];
for (const { prefix, mod } of mounts) {
  const router = (await import(new URL('../../src/' + mod.slice(2), import.meta.url)))
    .default;
  for (const layer of router.stack ?? []) {
    if (!layer.route) continue;
    const p = prefix + (layer.route.path === '/' ? '' : layer.route.path);
    for (const m of Object.keys(layer.route.methods ?? {})) {
      out.push(`${m.toUpperCase()} ${p || '/'}`);
    }
  }
}

out.sort();
writeFileSync(
  new URL('./routes.snapshot.json', import.meta.url),
  `${JSON.stringify(out, null, 1)}\n`,
);
console.log(`✅ ${out.length} مسار اتسجّل في routes.snapshot.json`);
process.exit(0);
