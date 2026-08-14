/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار تكبير الواجهة 15%
 *
 *  ⚠️ ليه اختبار مش مجرد «شغّلنا السكربت وخلاص»:
 *
 *   التكبير الأعمى بيكسر حاجتين بسهولة:
 *     1. نسب ارتفاع السطر (height: 1.5) — لو اتكبّرت، الكلام
 *        بيتباعد بشكل بشع والتصميم بيتفرقع.
 *     2. القيم غير البُعدية (شفافية · مدد · maxLength) — لو
 *        اتغيرت، بتظهر أخطاء غريبة صعب تتبعها.
 *
 *   الاختبار ده بيتأكد إن الاتنين سليمين، وإن التكبير حصل فعلاً.
 *
 *  التشغيل:  node --test test/ui-scale.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');
const THEME = join(LIB, 'core/theme/app_theme.dart');

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith('.dart')) out.push(full);
  }
  return out;
};

const FILES = walk(LIB);

// ════════════════════════════════════════════════
test('نسب ارتفاع السطر ما اتكبّرتش', () => {
  /**
   * ️ القاعدة: أي `height` جوه TextStyle قيمتها نسبة (1.0–2.0)
   *    مش بكسل. تكبيرها = كلام متباعد بشكل بشع.
   *
   *    بندوّر على النمط `fontSize: X, height: Y` — لو Y أكبر من 2
   *    يبقى حد كبّر نسبة سطر بالغلط.
   */
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/fontSize:\s*[\d.]+\s*,\s*height:\s*([\d.]+)/g)) {
      const h = Number(m[1]);
      assert.ok(
        h < 2,
        `${relative(APP, file)}: نسبة سطر مكبّرة بالغلط (height: ${h}) — ` +
          'دي نسبة مش بكسل',
      );
    }
  }
});

test('الشفافية والمدد و maxLength ما اتغيروش', () => {
  const src = readFileSync(THEME, 'utf8');

  // المدد الزمنية — لو اتكبّرت الأنميشن هيبقى بطيء
  assert.match(src, /micro = Duration\(milliseconds: 150\)/);
  assert.match(src, /standard = Duration\(milliseconds: 250\)/);
  assert.match(src, /transition = Duration\(milliseconds: 350\)/);
  assert.match(src, /hero = Duration\(milliseconds: 500\)/);

  // الشفافية لازم تفضل بين 0 و 1
  for (const file of FILES) {
    const s = readFileSync(file, 'utf8');
    for (const m of s.matchAll(/alpha:\s*([\d.]+)/g)) {
      const a = Number(m[1]);
      assert.ok(
        a >= 0 && a <= 1,
        `${relative(APP, file)}: شفافية خارج المدى (${a}) — اتكبّرت بالغلط`,
      );
    }
  }

  // حد الكتابة في البوب-أب لازم يطابق حد السيرفر
  const dialog = readFileSync(join(LIB, 'widgets/checkin_dialog.dart'), 'utf8');
  assert.match(
    dialog,
    /maxLength:\s*1000/,
    'حد الكتابة اتغير — لازم يفضل 1000 زي السيرفر',
  );
});

test('التكبير حصل فعلاً في ثوابت الثيم', () => {
  const src = readFileSync(THEME, 'utf8');

  const readConst = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*([\\d.]+)`));
    return m ? Number(m[1]) : null;
  };

  // المسافات: 15% فوق الأصل
  const spacing = [
    ['spaceXs', 4], ['spaceSm', 8], ['spaceMd', 12],
    ['spaceLg', 16], ['spaceXl', 20], ['spaceXxl', 24], ['spaceXxxl', 32],
  ];
  for (const [name, original] of spacing) {
    const actual = readConst(name);
    const expected = Math.round(original * 1.15 * 2) / 2;
    assert.equal(actual, expected, `${name} المفروض ${expected}`);
  }

  // الزوايا: نص النسبة بس — عشان الشكل يفضل هو هو
  const radii = [
    ['radiusXs', 8], ['radiusSm', 12], ['radiusMd', 16],
    ['radiusLg', 20], ['radiusXl', 24],
  ];
  for (const [name, original] of radii) {
    const actual = readConst(name);
    const expected = Math.round(original * 1.075 * 2) / 2;
    assert.equal(actual, expected, `${name} المفروض ${expected} (نص النسبة)`);
  }

  // ️ الكبسولة الكاملة قيمة سحرية — ممنوع تتكبّر
  assert.equal(readConst('radiusPill'), 999, 'radiusPill لازم تفضل 999');
});

test('سلّم أحجام الخط في الثيم اتكبّر', () => {
  const src = readFileSync(THEME, 'utf8');
  const sizes = [...src.matchAll(/fontSize:\s*([\d.]+)/g)].map((m) => Number(m[1]));

  assert.ok(sizes.length >= 8, 'سلّم الخطوط ناقص');

  // أكبر عنوان: 34 → 39
  assert.ok(sizes.includes(39), 'headlineLarge لازم يبقى 39');
  // أصغر نص: 12 → 14
  assert.ok(sizes.includes(14), 'bodySmall لازم يبقى 14');

  /**
   * ️ ما فيش نص أصغر من 13 بعد التكبير — لو موجود يبقى فات
   *    على التكبير، والنص هيبان صغير وسط باقي الواجهة.
   */
  for (const s of sizes) {
    assert.ok(s >= 13, `حجم خط صغير في الثيم (${s}) — شكله فات على التكبير`);
  }
});

test('مفيش نص أصغر من 10 في كل التطبيق', () => {
  /**
   * ️ قبل التكبير كان فيه نصوص 8.5 و 9 — دي على حافة القراءة.
   *    بعد التكبير المفروض كلها بقت 10 فما فوق.
   */
  for (const file of FILES) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/fontSize:\s*([\d.]+)/g)) {
      const size = Number(m[1]);
      assert.ok(
        size >= 10,
        `${relative(APP, file)}: نص صغير جداً (${size}) — صعب يتقرا`,
      );
    }
  }
});

test('السكربت موجود وقابل لإعادة التشغيل', () => {
  const script = readFileSync(resolve(HERE, '../scripts/scale-ui.mjs'), 'utf8');

  // ️ لازم يفضل مستثني ملف الثيم — غير كده التكبير هيتضاعف
  assert.match(
    script,
    /THEME_CONSTANTS/,
    'السكربت لازم يستثني ثوابت الثيم عشان ما تتكبّرش مرتين',
  );
  assert.match(script, /height:\s*\{[^}]*min:\s*2/, 'حماية نسب السطر اتشالت');
  assert.match(script, /value === 999/, 'حماية radiusPill اتشالت');
});
