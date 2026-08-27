/**
 * ═══════════════════════════════════════════════════════════
 *  عقد الربط: كل مسار بيناديه التطبيق لازم يكون موجود في السيرفر
 *
 *  ️ ليه الاختبار ده موجود:
 *     التطبيق والسيرفر بيتكتبوا في ملفات منفصلة، ومفيش حاجة
 *     بتمنع حد يكتب `/focus/actve` أو ينادي `PATCH` على مسار
 *     مسجّل `POST`. الخطأ ده مبيظهرش وقت الكومبايل — بيظهر
 *     للمستخدم كـ 404 وشاشة فاضية.
 *
 *     الاختبار ده بيقفل الفجوة: بيقرا كل نداء API في كود Dart،
 *     ياخد اسم المسار + الفعل (get/post/patch/delete) من نفس
 *     السطر، ويطابقه على قائمة المسارات المستخرَجة من راوترات
 *     Express الحقيقية.
 *
 *  تحديث القائمة:  node --import ./test/harness/setup.mjs \
 *                    test/harness/routes-dump.mjs
 *  التشغيل:        node --test test/api-contract.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../bal_app/lib');
const ENDPOINTS_FILE = join(LIB, 'core/network/api_endpoints.dart');
const SNAPSHOT = resolve(HERE, 'harness/routes.snapshot.json');

/** @type {string[]} كل "METHOD /api/path" من راوترات Express */
const serverRoutes = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

/** المسارات المُثبَّتة بالكامل (بلا :params) للمطابقة السريعة */
const serverSet = new Set(serverRoutes);

/** أنماط المسارات المتغيّرة → RegExp */
const serverPatterns = serverRoutes.map((r) => {
  const [method, path] = r.split(' ');
  return {
    raw: r,
    method,
    re: new RegExp(`^${path.replace(/:[A-Za-z]+/g, '[^/]+')}$`),
  };
});

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.dart')) out.push(full);
  }
  return out;
};

// ════════════════════════════════════════════════
//  ١. قراءة تعريفات ApiEndpoints
// ════════════════════════════════════════════════

const endpointsSrc = readFileSync(ENDPOINTS_FILE, 'utf8');

/** اسم الثابت → قالب المسار، مع تحويل ‎$id‎ إلى عيّنة */
const endpointPath = new Map();

// static const login = '/auth/login';
for (const m of endpointsSrc.matchAll(
  /static\s+const\s+(\w+)\s*=\s*'([^']+)'/g,
)) {
  if (m[2].startsWith('/')) endpointPath.set(m[1], m[2]);
}

// static String alarm(String id) => '/alarms/$id';
for (const m of endpointsSrc.matchAll(
  /static\s+String\s+(\w+)\([^)]*\)\s*=>\s*\n?\s*'([^']+)'/g,
)) {
  if (m[2].startsWith('/')) endpointPath.set(m[1], m[2]);
}

const sample = (template) =>
  template.replace(/\$\{[^}]+\}|\$\w+/g, 'SAMPLE');

test('ApiEndpoints فيه تعريفات فعلاً (حارس ضد ريجيكس مكسور)', () => {
  assert.ok(
    endpointPath.size >= 40,
    `اتقرا ${endpointPath.size} تعريف بس — الريجيكس اتكسر`,
  );
});

test('قائمة مسارات السيرفر محمّلة', () => {
  assert.ok(
    serverRoutes.length >= 200,
    `${serverRoutes.length} مسار بس — شغّل routes-dump.mjs`,
  );
});

// ════════════════════════════════════════════════
//  ٢. كل نداء في الشاشات: المسار + الفعل
// ════════════════════════════════════════════════

/** @type {{file:string, line:number, name:string, method:string}[]} */
const calls = [];

for (const file of walk(LIB)) {
  if (file === ENDPOINTS_FILE) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    // ‎.post(ApiEndpoints.focusStart‎  /  ‎.get(ApiEndpoints.alarm(a.id)‎
    for (const m of line.matchAll(
      /\.(get|post|patch|delete)\s*\(\s*ApiEndpoints\.(\w+)/g,
    )) {
      calls.push({
        file: file.slice(LIB.length + 1),
        line: i + 1,
        name: m[2],
        method: m[1].toUpperCase(),
      });
    }
  });
}

test('لقينا نداءات API في الشاشات', () => {
  assert.ok(calls.length >= 30, `${calls.length} نداء بس — الريجيكس اتكسر`);
});

// ════════════════════════════════════════════════
//  ٣. المطابقة
// ════════════════════════════════════════════════

test('كل اسم بيتنادى معرَّف في ApiEndpoints', () => {
  const missing = calls.filter((c) => !endpointPath.has(c.name));
  assert.deepEqual(
    missing.map((c) => `${c.file}:${c.line} → ApiEndpoints.${c.name}`),
    [],
    'أسماء متنادية ومش معرَّفة',
  );
});

test('كل مسار + فعل بيناديه التطبيق موجود في السيرفر', () => {
  /** المسارات اللي بيتنادوا بـ resolve() مش من الثوابت — مستثناة */
  const problems = [];

  for (const call of calls) {
    const template = endpointPath.get(call.name);
    if (!template) continue; // اتمسك في الاختبار اللي فوق

    const full = `/api${sample(template)}`;
    const exact = `${call.method} ${full}`;

    if (serverSet.has(exact)) continue;

    const matched = serverPatterns.some(
      (p) => p.method === call.method && p.re.test(full),
    );
    if (matched) continue;

    // الفعل غلط ولا المسار نفسه غلط؟
    const pathExists = serverPatterns.some((p) => p.re.test(full));
    problems.push(
      `${call.file}:${call.line}  ${exact}  ← ` +
        (pathExists
          ? 'المسار موجود بس بفعل تاني'
          : 'المسار مش موجود في السيرفر'),
    );
  }

  assert.deepEqual(problems, [], 'نداءات هترجع 404/405');
});

// ════════════════════════════════════════════════
//  ٤. تعريفات ميتة — معرَّفة ومحدش بينادي عليها
// ════════════════════════════════════════════════

test('كل تعريف في ApiEndpoints موجود فعلاً في السيرفر', () => {
  /**
   * ️ التعريف الميت مش خطأ في ذاته (ممكن يكون محجوز لشاشة جاية)،
   *    لكن التعريف اللي **مش موجود في السيرفر** خطأ أكيد: يوم ما
   *    حد يستخدمه هيقع.
   */
  const ghosts = [];

  for (const [name, template] of endpointPath) {
    const full = `/api${sample(template)}`;
    const exists = serverPatterns.some((p) => p.re.test(full));
    if (!exists) ghosts.push(`ApiEndpoints.${name} → ${full}`);
  }

  assert.deepEqual(ghosts, [], 'تعريفات مالهاش مسار في السيرفر');
});
