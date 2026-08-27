/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار توصيل المنبه
 *
 *  ⚠️ المنبه كان أكبر فيتشر بلا واجهة: 14 نقطة في السيرفر ومفيش
 *     أي شاشة. وكان فيه زرار «منبه» في قايمة الإنشاء بـ TODO
 *     بيقفل القائمة ومش بيعمل حاجة.
 *
 *  الفكرة المميزة: المنبه مش بيقفل بضغطة — لازم تحل مسألة.
 *  الاختبارات دي بتحرس الفكرة دي بالذات، لأن أي ثغرة فيها بتلغي
 *  الفيتشر كله (المستخدم يقفل المنبه وهو نايم ويكمل نوم).
 *
 *  التشغيل:  node --test test/alarm-wiring.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../bal_app/lib');
const SRV = resolve(HERE, '../src');

const read = (p) => readFileSync(join(LIB, p), 'utf8');

// ════════════════════════════════════════════════
test('شاشات المنبه موجودة', () => {
  for (const f of [
    'screens/alarm/alarms_screen.dart',
    'screens/alarm/wake_task_screen.dart',
  ]) {
    assert.ok(existsSync(join(LIB, f)), `${f} مفقودة`);
  }
});

test('المنبه موصول بنقاط السيرفر الحقيقية', () => {
  const screen = read('screens/alarm/alarms_screen.dart');
  const endpoints = read('core/network/api_endpoints.dart');

  for (const ep of ['alarms', 'wakeTask', 'wakeTaskSolve']) {
    assert.match(endpoints, new RegExp(`\\b${ep}\\b`), `${ep} مش معرّفة`);
  }
  assert.match(screen, /ApiEndpoints\.alarms/, 'مش بيجيب المنبهات');
  assert.doesNotMatch(screen, /dummy|mock|fake|منبه تجريبي/i, 'فيه بيانات وهمية');
});

test('الإجابة بتتراجع في السيرفر مش في التطبيق', () => {
  /**
   * ️ أخطر ثغرة ممكنة هنا: لو التطبيق عرف الإجابة الصح، أي حد
   *    يقدر يقرا الكود ويقفل المنبه. السيرفر بيبعت السؤال + token
   *    موقّع، والإجابة بتتفحص عنده.
   */
  const task = read('screens/alarm/wake_task_screen.dart');

  assert.match(task, /token/, 'الـ token مش مستخدم');
  assert.match(
    task,
    /ApiEndpoints\.wakeTaskSolve/,
    'الإجابة مش بتتبعت للسيرفر',
  );

  /** ️ ممنوع التطبيق يقارن الإجابة محلياً */
  assert.doesNotMatch(
    task,
    /correctAnswer|_answer\.text\s*==\s*['"]?\d/,
    'التطبيق بيعرف الإجابة — ثغرة',
  );

  /** السيرفر لازم يفضل هو اللي بيوقّع ويراجع */
  const ctrl = readFileSync(join(SRV, 'modules/alarm/alarm.controller.js'), 'utf8');
  assert.match(ctrl, /signTask\(answer\)/, 'السيرفر بطّل يوقّع المسألة');
  assert.match(ctrl, /verifyTask\(token\)/, 'السيرفر بطّل يراجع الـ token');
});

test('مفيش باب خلفي يقفل المنبه من غير حل', () => {
  const task = read('screens/alarm/wake_task_screen.dart');

  /**
   * ️ زرار الرجوع في الصحيان الحقيقي = المنبه اتقفل بلا حل.
   *    PopScope بـ canPop: isPreview بيسمح بالخروج في التجربة بس.
   */
  assert.match(task, /PopScope/, 'مفيش حماية من زرار الرجوع');
  assert.match(
    task,
    /canPop:\s*widget\.isPreview/,
    'الخروج مسموح في الصحيان الحقيقي — باب خلفي',
  );
});

test('انتهاء مهلة المسألة بيتعالج تلقائياً', () => {
  /**
   * ️ الـ token صالح 5 دقايق. لو خلص، عرض رسالة خطأ لحد نصه نايم
   *    ومطالبته يضغط زرار = إحباط. المفروض مسألة جديدة تلقائياً.
   */
  const task = read('screens/alarm/wake_task_screen.dart');
  assert.match(task, /TASK_EXPIRED/, 'انتهاء المهلة مش متعالج');
  assert.match(
    task,
    /TASK_EXPIRED[\s\S]{0,300}_fetchTask\(\)/,
    'المهلة بتخلص بلا مسألة جديدة',
  );

  const ctrl = readFileSync(join(SRV, 'modules/alarm/alarm.controller.js'), 'utf8');
  assert.match(ctrl, /TASK_EXPIRED/, 'السيرفر بطّل يرجّع الكود ده');
});

test('الغلط بلا لوم', () => {
  /**
   * ️ نفس قاعدة الرفيق: «ممنوع اللوم». الغلط في مسألة وانت نايم
   *    طبيعي تماماً.
   */
  const task = read('screens/alarm/wake_task_screen.dart');
  assert.doesNotMatch(
    task,
    /غبي|فاشل|ركز بقى|حاول تفوق/,
    'فيه لوم للمستخدم',
  );
  assert.match(task, /_attempts/, 'مفيش تتبع للمحاولات');
});

test('زرار المنبه في قائمة الإنشاء شغال', () => {
  const menu = read('widgets/create_menu.dart');

  assert.match(menu, /AlarmsScreen/, 'الزرار مش بيفتح شاشة المنبهات');

  /**
   * ️ بنفحص الكود بس — التعليقات ممكن تذكر كلمة TODO وهي بتشرح
   *    باج قديم اتصلح، وده مش عيب.
   */
  const code = menu
    .replace(/\/\/\/[^\n]*/g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /TODO|FIXME/, 'لسه فيه زرار ناقص');

  const empty = [...menu.matchAll(/onTap:\s*\(\)\s*\{\s*\}/g)];
  assert.equal(empty.length, 0, 'فيه زرار بمعالج فاضي');
});

test('أيام الأسبوع بتتعرض بالعربي', () => {
  const models = read('models/models.dart');

  assert.match(models, /daysLabel/, 'مفيش وصف للأيام');
  assert.match(models, /أيام الشغل/, 'مفيش اختصار لأيام الشغل');
  assert.match(models, /كل يوم/, 'مفيش اختصار لكل يوم');

  /** ️ الأحد = 0 حسب السيرفر — لو اتقلبت الأيام هتبقى غلط */
  const ctrl = readFileSync(join(SRV, 'modules/alarm/alarm.controller.js'), 'utf8');
  assert.match(ctrl, /الأحد = 0/, 'ترتيب الأيام في السيرفر اتغير');
});
