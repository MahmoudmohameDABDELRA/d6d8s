/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار اختيار عنوان السيرفر في التطبيق
 *
 *  ⚠️ الباج اللي بيحرسه:
 *
 *   `flutter run -d chrome` بيشغّل التطبيق على بورت عشوائي (57960
 *   مثلاً) بلا أي proxy. النسخة القديمة كانت بتستخدم **نفس الأصل**،
 *   فالتطبيق كان بيبعت `POST /api/auth/register` لنفسه بدل الباك إند.
 *   النتيجة: التسجيل والدخول مش شغالين خالص، من غير أي رسالة خطأ
 *   مفهومة — الطلب بيروح لسيرفر مفيهوش الـ endpoint أصلاً.
 *
 *   المنطق هنا نسخة JS من `ApiEndpoints.origin` عشان نقدر نختبره
 *   بلا Flutter SDK. وفيه فحص في الآخر بيتأكد إن كود الـ Dart لسه
 *   فيه نفس القواعد، فالنسختين ما ينحرفوش عن بعض.
 *
 *  التشغيل:  node --test test/api-origin.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../bal_app/lib/core/network/api_endpoints.dart');

const stripSlash = (u) => (u.endsWith('/') ? u.slice(0, -1) : u);

/** نسخة JS من ApiEndpoints.origin */
const origin = ({ override = '', isWeb = false, pageUrl = null } = {}) => {
  if (override) return stripSlash(override);

  if (isWeb) {
    const base = new URL(pageUrl);
    const port = base.port ? Number(base.port) : base.protocol === 'https:' ? 443 : 80;
    const isDevServer =
      (base.hostname === 'localhost' || base.hostname === '127.0.0.1') && port !== 3000;

    if (isDevServer) return 'http://localhost:3000';
    return `${base.protocol}//${base.hostname}${base.port ? ':' + base.port : ''}`;
  }

  return 'http://10.0.2.2:3000';
};

// ════════════════════════════════════════════════
test('حالة المستخدم: flutter run -d chrome على بورت عشوائي', () => {
  /**
   * ️ ده بالظبط اللي حصل: الطلبات راحت على
   *    http://localhost:57960/api/auth/register — سيرفر Flutter نفسه.
   */
  const got = origin({ isWeb: true, pageUrl: 'http://localhost:57960/' });

  assert.equal(got, 'http://localhost:3000', 'لازم يروح للباك إند مش لنفسه');
  assert.notEqual(got, 'http://localhost:57960', 'الباج القديم');
});

test('أي بورت عشوائي تاني', () => {
  for (const port of [1234, 8080, 49152, 57960, 60001]) {
    assert.equal(
      origin({ isWeb: true, pageUrl: `http://localhost:${port}/` }),
      'http://localhost:3000',
      `بورت ${port} لازم يتحوّل`,
    );
  }
});

test('127.0.0.1 زي localhost', () => {
  assert.equal(
    origin({ isWeb: true, pageUrl: 'http://127.0.0.1:57960/' }),
    'http://localhost:3000',
  );
});

test('التطبيق متسيرڤ من الباك نفسه → نفس الأصل', () => {
  /**
   * ️ لما الباك إند يسيرڤ نسخة الويب على 3000، نفس الأصل هو الصح.
   *    لو حوّلناه بردو هنكسر النشر الحقيقي.
   */
  assert.equal(
    origin({ isWeb: true, pageUrl: 'http://localhost:3000/' }),
    'http://localhost:3000',
  );
});

test('نشر حقيقي على دومين → نفس الأصل', () => {
  assert.equal(
    origin({ isWeb: true, pageUrl: 'https://bal.app/mountain' }),
    'https://bal.app',
  );
  assert.equal(
    origin({ isWeb: true, pageUrl: 'https://3000-abc.e2b.app/' }),
    'https://3000-abc.e2b.app',
  );
});

test('أندرويد بلا override → 10.0.2.2', () => {
  assert.equal(origin({ isWeb: false }), 'http://10.0.2.2:3000');
});

test('override بيتقدّم على كل حاجة', () => {
  /** موبايل حقيقي على نفس الشبكة */
  assert.equal(
    origin({ override: 'http://192.168.1.5:3000', isWeb: false }),
    'http://192.168.1.5:3000',
  );
  /** حتى في الويب */
  assert.equal(
    origin({
      override: 'http://192.168.1.5:3000',
      isWeb: true,
      pageUrl: 'http://localhost:57960/',
    }),
    'http://192.168.1.5:3000',
  );
  /** السلاش الزيادة بتتشال — عشان ما يبقاش //api */
  assert.equal(
    origin({ override: 'http://192.168.1.5:3000/' }),
    'http://192.168.1.5:3000',
  );
});

test('المسار النهائي فيه /api مرة واحدة', () => {
  const full = (o, path) => `${o}/api${path}`;
  assert.equal(
    full(origin({ isWeb: true, pageUrl: 'http://localhost:57960/' }), '/auth/register'),
    'http://localhost:3000/api/auth/register',
  );
  assert.equal(
    full(origin({ override: 'http://192.168.1.5:3000/' }), '/auth/login'),
    'http://192.168.1.5:3000/api/auth/login',
  );
});

// ════════════════════════════════════════════════
test('كود الـ Dart لسه فيه نفس القواعد', () => {
  /**
   * ️ حارس ضد انحراف النسخة: الاختبارات فوق على نسخة JS. لو حد
   *    غيّر الـ Dart وما غيّرش هنا، الاختبارات هتفضل خضرا وهي
   *    بتختبر حاجة مش موجودة.
   */
  const src = readFileSync(SRC, 'utf8');

  assert.match(src, /API_BASE_URL/, 'دعم --dart-define اتشال');
  assert.match(src, /base\.port != 3000/, 'كشف الـ dev server اتشال');
  assert.match(src, /10\.0\.2\.2:3000/, 'عنوان محاكي أندرويد اتشال');
  assert.match(src, /_stripSlash/, 'تنظيف السلاش اتشال');

  /** ️ ممنوع يرجع '' في الويب — ده كان أصل الباج */
  assert.doesNotMatch(
    src,
    /if \(kIsWeb\)\s*\{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*return '';/,
    'الرجوع لأصل فاضي في الويب رجع تاني',
  );
});
