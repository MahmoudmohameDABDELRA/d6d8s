/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار جودة الواجهة
 *
 *  ⚠️ الأنماط اللي بيحرسها — كلها كانت موجودة فعلاً:
 *
 *   1. **أخطاء خام في وش المستخدم.** شاشة الجبل كانت بتعرض
 *      `e.toString()` مباشرةً، يعني المستخدم يشوف
 *      "DioException [connection error]: Failed host lookup".
 *
 *   2. **صور بلا معالجة فشل.** `CircleAvatar(backgroundImage:
 *      NetworkImage(url))` مالهاش errorBuilder — لو الرابط باظ،
 *      الأفاتار دايرة فاضية بلا حتى حرف بديل.
 *
 *   3. **أزرار ميتة** و **بيانات وهمية** في الواجهة.
 *
 *  التشغيل:  node --test test/ui-quality.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith('.dart')) out.push(full);
  }
  return out;
};

/** يشيل التعليقات — بندوّر على كود مش شرح */
const codeOf = (src) =>
  src
    .replace(/\/\/\/[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SCREENS = walk(join(LIB, 'screens'));
const ALL = walk(LIB);

// ════════════════════════════════════════════════
test('مفيش خطأ خام بيوصل للمستخدم', () => {
  for (const file of SCREENS) {
    const code = codeOf(readFileSync(file, 'utf8'));
    const rel = relative(APP, file);

    /**
     * ️ `_error = e.toString()` معناها المستخدم هيقرا كلام مبرمجين.
     *    المفروض `humanError(e, fallback: '...')`.
     */
    assert.doesNotMatch(
      code,
      /_error\s*=\s*e\.toString\(\)\s*;/,
      `${rel}: بيعرض الخطأ الخام — استخدم humanError`,
    );

    /** الخطأ الخام جوه نص معروض */
    assert.doesNotMatch(
      code,
      /Text\([^)]*\$\{?e\.toString\(\)\}?[^)]*\)/,
      `${rel}: الخطأ الخام معروض في Text`,
    );
  }
});

test('مترجم الأخطاء بيغطي الحالات المهمة', () => {
  const p = join(LIB, 'core/network/api_error.dart');
  assert.ok(existsSync(p), 'ملف ترجمة الأخطاء مفقود');

  const src = readFileSync(p, 'utf8');

  /** الشبكة — أكتر خطأ هيقابل المستخدم */
  assert.match(src, /SocketException/, 'انقطاع الشبكة مش متغطي');
  assert.match(src, /Failed host lookup/, 'فشل الاسم مش متغطي');

  /** أكواد HTTP الشائعة */
  for (const code of ['401', '403', '404', '429']) {
    assert.match(src, new RegExp(`'${code}'`), `الكود ${code} مش متغطي`);
  }

  /** أكواد المشروع */
  assert.match(src, /GEMINI_NOT_CONFIGURED/, 'غياب مفتاح الـ AI مش متغطي');
  assert.match(src, /GEMINI_QUOTA/, 'نفاد حصة الـ AI مش متغطي');

  /** ️ الرسالة العربية من السيرفر لازم تعدي زي ما هي */
  assert.match(src, /u0600-\\u06FF/, 'رسائل السيرفر العربية بتتبلع');
});

test('كل صور الشبكة ليها بديل لو فشلت', () => {
  for (const file of ALL) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(APP, file);

    /**
     * ️ backgroundImage مالهوش errorBuilder. لو الرابط باظ، الأفاتار
     *    بيفضل فاضي لأن `child` بيتجاهل لما backgroundImage مبعوت.
     *    الحل UserAvatar (ClipOval + Image.network + errorBuilder).
     */
    assert.doesNotMatch(
      codeOf(src),
      /backgroundImage:[^,]*NetworkImage/s,
      `${rel}: صورة بلا معالجة فشل — استخدم UserAvatar`,
    );

    /** Image.network المباشرة لازم يكون معاها errorBuilder */
    if (/Image\.network\(/.test(codeOf(src))) {
      assert.match(
        src,
        /errorBuilder/,
        `${rel}: Image.network بلا errorBuilder`,
      );
    }
  }
});

test('UserAvatar بيرجع للحرف البديل', () => {
  const src = readFileSync(join(LIB, 'widgets/user_avatar.dart'), 'utf8');

  assert.match(src, /errorBuilder/, 'مفيش تعامل مع فشل الصورة');
  assert.match(src, /loadingBuilder/, 'مفيش مؤشر تحميل');
  assert.match(src, /_initial/, 'مفيش حرف بديل');

  /** ️ الاسم الفاضي ما يكسرش — `name[0]` على نص فاضي = استثناء */
  assert.match(
    src,
    /trimmed\.isEmpty \? '؟'/,
    'الاسم الفاضي هيرمي استثناء',
  );
});

test('مفيش أزرار ميتة في أي شاشة', () => {
  for (const file of ALL) {
    const code = codeOf(readFileSync(file, 'utf8'));
    const rel = relative(APP, file);

    for (const pattern of [
      /onPressed:\s*\(\)\s*\{\s*\}/g,
      /onTap:\s*\(\)\s*\{\s*\}/g,
    ]) {
      const hits = [...code.matchAll(pattern)];
      assert.equal(hits.length, 0, `${rel}: فيه زرار بمعالج فاضي`);
    }

    assert.doesNotMatch(code, /TODO|FIXME/, `${rel}: فيه شغل ناقص`);
  }
});

test('مفيش بيانات وهمية في الواجهة', () => {
  for (const file of SCREENS) {
    const code = codeOf(readFileSync(file, 'utf8'));
    const rel = relative(APP, file);

    assert.doesNotMatch(
      code,
      /\b(lorem ipsum|dummyData|mockData|fakeData)\b/i,
      `${rel}: فيه بيانات وهمية`,
    );
  }
});

test('الشاشات اللي بتجيب بيانات بتتعامل مع الفشل', () => {
  for (const file of SCREENS) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(APP, file);

    if (!/ApiClient\.instance/.test(src)) continue;

    /**
     * ️ من غير catch، فشل الشبكة بيسيب الشاشة معلقة على مؤشر
     *    تحميل للأبد — أسوأ من رسالة خطأ.
     */
    assert.match(src, /catch\s*\(/, `${rel}: مفيش تعامل مع فشل الطلب`);
  }
});

test('كل الشاشات بتحترم حواف الشاشة', () => {
  for (const file of SCREENS) {
    const src = readFileSync(file, 'utf8');
    const rel = relative(APP, file);

    /** الشاشة اللي فيها Scaffold من غير AppBar محتاجة SafeArea */
    if (/Scaffold\(/.test(src) && !/appBar:/.test(src)) {
      assert.match(
        src,
        /SafeArea/,
        `${rel}: المحتوى ممكن يتغطى بنوتش الشاشة`,
      );
    }
  }
});
