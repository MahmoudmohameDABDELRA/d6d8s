/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار توصيل التنقل والشاشات
 *
 *  ⚠️ الباج اللي بيحرسه:
 *
 *   `FloatingNavBar` بيبعت الفهرس لـ `IndexedStack`. لو القايمتين
 *   مش نفس الطول، الضغط على آخر تبويب بيرمي RangeError ويكسر
 *   الشاشة — وده كان موجود فعلاً: الناف بار فيه 5 عناصر و`_screens`
 *   فيها 4، فالضغط على «أنا» كان بيكسر التطبيق.
 *
 *   الفحص ده رخيص وبيمسك أي اختلال في الترتيب قبل ما يوصل للمستخدم.
 *
 *  التشغيل:  node --test test/nav-wiring.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../bal_app/lib');

const read = (p) => readFileSync(join(LIB, p), 'utf8');

// ════════════════════════════════════════════════
test('الناف بار والشاشات نفس العدد', () => {
  const nav = read('widgets/floating_nav_bar.dart');
  const shell = read('shell/main_shell.dart');

  const navBlock = nav.slice(
    nav.indexOf('static const items = ['),
    nav.indexOf('];', nav.indexOf('static const items = [')),
  );
  const navCount = [...navBlock.matchAll(/NavItem\(/g)].length;

  const screensBlock = shell.slice(
    shell.indexOf('static const _screens = ['),
    shell.indexOf('];', shell.indexOf('static const _screens = [')),
  );
  const screenCount = [...screensBlock.matchAll(/\w+\(\),/g)].length;

  assert.equal(
    navCount,
    screenCount,
    `الناف بار ${navCount} تبويب و_screens ${screenCount} شاشة — ` +
      'الضغط على الزيادة هيرمي RangeError',
  );
  assert.ok(navCount >= 4, 'التبويبات قليلة بشكل مريب');
});

test('الفهرس 2 محجوز للـ FAB ومحمي', () => {
  const shell = read('shell/main_shell.dart');

  /** ️ من غير الحارس ده، الضغط على مكان الـ FAB بيعرض شاشة فاضية */
  assert.match(
    shell,
    /if \(i == 2\) return;/,
    'حارس الفهرس 2 اتشال — مكان الـ FAB هيعرض شاشة فاضية',
  );

  const screensBlock = shell.slice(
    shell.indexOf('static const _screens = ['),
    shell.indexOf('];', shell.indexOf('static const _screens = [')),
  );
  assert.match(
    screensBlock,
    /SizedBox\.shrink\(\)/,
    'مكان الـ FAB لازم يبقى فيه عنصر عشان الفهارس تفضل مظبوطة',
  );
});

test('كل شاشة في _screens ملفها موجود ومستورد', () => {
  const shell = read('shell/main_shell.dart');

  const screensBlock = shell.slice(
    shell.indexOf('static const _screens = ['),
    shell.indexOf('];', shell.indexOf('static const _screens = [')),
  );

  const widgets = [...screensBlock.matchAll(/(\w+Screen)\(\)/g)].map((m) => m[1]);
  assert.ok(widgets.length >= 3, 'الشاشات قليلة بشكل مريب');

  for (const w of widgets) {
    // الويدجت معرّفة في ملف ما تحت lib/
    const found = [...walk(LIB)].some((f) =>
      new RegExp(`class ${w}\\b`).test(readFileSync(f, 'utf8')),
    );
    assert.ok(found, `${w} مستخدمة في _screens بس مش معرّفة في أي ملف`);

    // ومستوردة في الشل — الملف اللي فيها لازم يكون من ضمن الاستيرادات
    const owner = [...walk(LIB)].find((f) =>
      new RegExp(`class ${w}\\b`).test(readFileSync(f, 'utf8')),
    );
    const rel = owner.replace(LIB, '').replace(/\\/g, '/').replace(/^\//, '');
    const fileName = rel.split('/').pop();
    assert.match(
      shell,
      new RegExp(`import[^;]*${fileName.replace('.', '\\.')}`),
      `${w} مستخدمة في _screens بس ملفها (${fileName}) مش مستورد`,
    );
  }
});

test('شاشة العشائر موصولة بالسيرفر', () => {
  const clans = read('screens/clans/clans_screen.dart');
  const endpoints = read('core/network/api_endpoints.dart');

  /** لازم تستخدم نقاط حقيقية — مش بيانات وهمية */
  for (const ep of ['myClans', 'clansAutoAssign', 'clansPrivateCreate', 'clansPrivateJoin']) {
    assert.match(clans, new RegExp(`ApiEndpoints\\.${ep}`), `${ep} مش مستخدمة`);
    assert.match(endpoints, new RegExp(`\\b${ep}\\b`), `${ep} مش معرّفة`);
  }

  /** ️ مفيش بيانات مخترعة في الواجهة */
  assert.doesNotMatch(clans, /عشيرة تجريبية|dummy|mock|fake/i, 'فيه بيانات وهمية');

  /** حالات الفشل متعالجة — مش شاشة بيضا */
  assert.match(clans, /_error/, 'مفيش تعامل مع الخطأ');
  assert.match(clans, /_emptyView|لسه مانضمتش/, 'مفيش حالة فاضية');
});

test('شاشة الأعضاء بتعرض الحضور من lastSeen', () => {
  const members = read('screens/clans/clan_members_screen.dart');
  const models = read('models/models.dart');

  assert.match(members, /isOnline/, 'مفيش مؤشر حضور');
  assert.match(
    models,
    /inMinutes < 5/,
    'تعريف «موجود دلوقتي» اتغير — 5 دقايق هي المتفق عليها',
  );
});

test('مفيش زر ميت في قائمة الإنشاء', () => {
  const menu = read('widgets/create_menu.dart');

  /**
   * ️ كان فيه زر «منبه» بـ TODO — بيقفل القائمة ومش بيعمل حاجة.
   *    الزر اللي مبيعملش حاجة أسوأ من زر مش موجود.
   */
  assert.doesNotMatch(menu, /TODO|FIXME/, 'فيه زر ناقص تنفيذه');

  const emptyHandlers = [...menu.matchAll(/onTap:\s*\(\)\s*\{\s*\}/g)];
  assert.equal(emptyHandlers.length, 0, 'فيه زر بمعالج فاضي');
});

test('الرسائل لسه متاحة بعد ما خرجت من الناف بار', () => {
  /**
   * ️ العشائر أخدت مكان الرسائل في الناف بار. لو ماحطناهاش في
   *    مكان تاني، الشات بيبقى كود ميت مالوش أي مدخل.
   */
  const menu = read('widgets/create_menu.dart');
  assert.match(menu, /ChatScreen/, 'الشات مالوش أي مدخل في التطبيق');
});

// ── أداة مساعدة ──
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (e.endsWith('.dart')) yield full;
  }
}
