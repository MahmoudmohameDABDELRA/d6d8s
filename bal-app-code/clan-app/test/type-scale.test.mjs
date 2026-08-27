/**
 * ═══════════════════════════════════════════════════════════
 *  حارس سلّم الخطوط
 *
 *  ️ الحالة اللي بيمنع رجوعها:
 *
 *  كان في **٢٥ حجم خط** مكتوبين بالإيد في ١٦٨ مكان، فيهم كسور
 *  زي 13.5 و17.5 و20.5. الكسور دي مالهاش أي معنى تصميمي — دي
 *  ناتج سكربت تكبير ١٥٪ اشتغل على أرقام ثابتة عشوائية
 *  (12 × 1.15 = 13.8 → 13.5).
 *
 *  الأثر إن نصوص بنفس الأهمية بتطلع بفرق نص نقطة: مش كفاية
 *  يفرّق في المعنى، بس كفاية يخلي الشاشة تبان مش مظبوطة.
 *
 *  الحارس ده بيمنع أي `fontSize:` برقم صريح. الأرقام لازم تيجي
 *  من `BalType` أو من `Theme.of(context).textTheme`.
 *
 *  التشغيل:  node --test test/type-scale.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../bal_app/lib');
const THEME = join(LIB, 'core/theme/app_theme.dart');

/**
 * كتلة `BalType` لوحدها.
 * ️ لازم نقصّها: `AppTheme` في نفس الملف وفيه ثوابت المسافات
 *    والزوايا بنفس الشكل (`static const double spaceMd = 14;`).
 *    الريجيكس على الملف كله بيعدّهم كدرجات خط ويطلع ٢٤ بدل ١١.
 */
const typeBlock = () => {
  const src = readFileSync(THEME, 'utf8');
  const start = src.indexOf('abstract final class BalType');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i);
    }
  }
  return '';
};

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.dart')) out.push(full);
  }
  return out;
};

const files = walk(LIB);

test('السلّم معرَّف في مكان واحد', () => {
  const src = readFileSync(THEME, 'utf8');
  assert.match(src, /abstract final class BalType/);

  const steps = [...typeBlock().matchAll(/static const double (\w+) = ([0-9.]+);/g)];
  assert.ok(steps.length >= 8, `${steps.length} درجة بس`);

  //  الدرجات لازم تكون متصاعدة وبلا تكرار
  const values = steps.map((m) => Number(m[2]));
  const sorted = [...values].sort((a, b) => a - b);
  assert.deepEqual(values, sorted, 'الدرجات مش مرتّبة تصاعدياً');
  assert.equal(
    new Set(values).size,
    values.length,
    'فيه درجتين بنفس القيمة',
  );
});

test('مفيش أي fontSize برقم مكتوب بالإيد', () => {
  const offenders = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      /** ️ نتجاهل التعليقات — بتشرح المشكلة القديمة بأرقامها */
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      /**
       * ️ `BalEmoji.*` مقبول زي `BalType.*` — الإيموجي مش نص،
       *    وحجمه بيتحدد بإنه أيقونة مش بمقروئية. الاتنين ثوابت
       *    مسمّاة، وده اللي الحارس بيطلبه.
       */
      const m = /fontSize:\s*([0-9]+(?:\.[0-9]+)?)\b/.exec(code);
      if (m) {
        offenders.push(`${file.slice(LIB.length + 1)}:${i + 1} → ${m[1]}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'استخدم BalType.* أو Theme.of(context).textTheme',
  );
});

test('عدد الأحجام الفعلية ≤ ١٢', () => {
  /**
   * ️ الحارس الحقيقي: حتى لو كلهم من BalType، لو حد ضاف ٣٠
   *    درجة للسلّم نبقى رجعنا لنفس المشكلة باسم مختلف.
   */
  const steps = [...typeBlock().matchAll(/static const double \w+ = [0-9.]+;/g)];
  assert.ok(
    steps.length <= 12,
    `${steps.length} درجة — السلّم بيتوسّع من غير سبب`,
  );
});

test('كل ملف بيستخدم BalType مستورد الثيم', () => {
  const missing = [];

  for (const file of files) {
    if (file === THEME) continue;
    const src = readFileSync(file, 'utf8');
    if (!src.includes('BalType.')) continue;
    if (!/import\s+'[^']*app_theme\.dart'/.test(src)) {
      missing.push(file.slice(LIB.length + 1));
    }
  }

  assert.deepEqual(missing, [], 'استيراد ناقص — الكود مش هيتكومبايل');
});

test('الثيم نفسه بياخد من السلّم', () => {
  const src = readFileSync(THEME, 'utf8');

  /**
   * ️ لو `textTheme` فيه أرقام مكتوبة والباقي على BalType،
   *    يبقى عندنا مصدرين للحقيقة — نفس المشكلة من باب تاني.
   */
  const themeBlock = src.slice(
    src.indexOf('textTheme:'),
    src.indexOf('appBarTheme:'),
  );

  const hardcoded = [...themeBlock.matchAll(/fontSize:\s*([0-9.]+)/g)];
  assert.deepEqual(
    hardcoded.map((m) => m[1]),
    [],
    'textTheme لازم ياخد من BalType',
  );
  assert.match(themeBlock, /BalType\./);
});
