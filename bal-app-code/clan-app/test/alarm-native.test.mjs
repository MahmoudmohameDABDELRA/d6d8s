/**
 * ═══════════════════════════════════════════════════════════
 *  حارس المنبه الأصلي — السلسلة كاملة وبلا Firebase
 *
 *  ️ الحكاية اللي بيحرسها:
 *
 *  التقرير الأول قال «المنبه محتاج Firebase». ده كان **غلط**،
 *  والمستخدم هو اللي صحّحه. المشروع فيه محرّك منبه كامل مكتوب
 *  بـ Kotlin (٨ ملفات) بيستخدم `AlarmManager.setAlarmClock` —
 *  نفس اللي تطبيق الساعة المدمج بيستخدمه.
 *
 *  ليه ده **أحسن** من الـ push مش بديل عنه:
 *
 *    · مبيحتاجش نت — حد نايم والواي فاي فصل، المنبه بيرن.
 *      منبه بالـ push في الحالة دي = مفيش منبه.
 *    · بيخترق Doze وموفّر البطارية دايماً.
 *    · شاومي وهواوي مبيقتلوهوش.
 *    · مبيحتاجش حساب سحابي ولا مفتاح.
 *
 *  الاختبار ده بيمنع حاجتين:
 *    ١. رجوع أي اعتماد على Firebase في مسار المنبه
 *    ٢. انقطاع أي حلقة في السلسلة (الجدولة → الرنين → المهمة
 *       → تسجيل الاستيقاظ)
 *
 *  التشغيل:  node --test test/alarm-native.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');
const ANDROID = join(APP, 'android/app/src/main');
const KOTLIN = join(ANDROID, 'kotlin/com/bal/bal_app');
const ALARM_KT = join(KOTLIN, 'alarm');

const read = (p) => readFileSync(p, 'utf8');

/**
 * الكود بلا تعليقات.
 *
 * ️ لازم: الملفات دي **بتشرح** ليه مفيش Firebase وليه اتنقلت
 *    من React Native، فالتعليقات فيها الكلمات اللي بندوّر عليها.
 *    فحص الملف كله بيخلي الحارس يقع على شرح الحارس نفسه.
 */
const codeOf = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

// ════════════════════════════════════════════════
//  ١. المحرّك موجود ومنقول للحزمة الصح
// ════════════════════════════════════════════════

test('كل ملفات محرّك المنبه موجودة', () => {
  const required = [
    'AlarmContract.kt',
    'AlarmStore.kt',
    'AlarmScheduler.kt',
    'AlarmReceiver.kt',
    'AlarmRingService.kt',
    'AlarmActivity.kt',
    'AlarmPlugin.kt',
  ];

  const present = readdirSync(ALARM_KT);
  const missing = required.filter((f) => !present.includes(f));

  assert.deepEqual(missing, [], 'ملفات ناقصة من المحرّك');
});

test('الحزمة اتغيّرت لـ com.bal.bal_app — مفيش بقايا clanapp', () => {
  const leftovers = [];

  for (const file of readdirSync(ALARM_KT)) {
    const src = read(join(ALARM_KT, file));
    if (/com\.clanapp/.test(src)) leftovers.push(file);
  }

  assert.deepEqual(leftovers, [], 'اسم الحزمة القديم لسه موجود');
});

test('مفيش أثر لـ React Native في الكود المنقول', () => {
  /**
   * ️ المحرّك كان مكتوب لـ React Native. المنطق (الجدولة،
   *    الرنين، إعادة الجدولة) أندرويد خالص ومالوش علاقة بإطار
   *    الواجهة — فاتنقل زي ما هو. الجسر بس هو اللي اتغيّر.
   *
   *    أي `ReactMethod` أو `Promise` باقي = ملف مش هيتكومبايل.
   */
  const rn = [];

  for (const file of readdirSync(ALARM_KT)) {
    const src = codeOf(read(join(ALARM_KT, file)));
    if (/com\.facebook\.react|ReactMethod|ReactContextBaseJavaModule/.test(src)) {
      rn.push(file);
    }
  }

  assert.deepEqual(rn, [], 'بقايا React Native');
});

// ════════════════════════════════════════════════
//  ٢. مفيش Firebase — الحارس الأساسي
// ════════════════════════════════════════════════

test('مفيش Firebase ولا FCM في أي ملف من مسار المنبه', () => {
  const offenders = [];

  const scan = (dir, files) => {
    for (const file of files) {
      const src = codeOf(read(join(dir, file)));
      if (/firebase|FirebaseMessaging|FCM|google-services/i.test(src)) {
        offenders.push(file);
      }
    }
  };

  scan(ALARM_KT, readdirSync(ALARM_KT));
  scan(join(LIB, 'core/alarm'), readdirSync(join(LIB, 'core/alarm')));

  assert.deepEqual(
    offenders,
    [],
    'المنبه لازم يفضل محلي — الـ push بيحتاج نت والمستخدم نايم',
  );
});

test('مفيش google-services في إعدادات البناء', () => {
  const raw = read(join(APP, 'android/app/build.gradle.kts'));
  const gradle = codeOf(raw);

  assert.doesNotMatch(gradle, /google-services/);
  assert.doesNotMatch(gradle, /firebase/i);

  //  الاعتماديتين المطلوبتين فعلاً
  assert.match(raw, /localbroadcastmanager/, 'اعتمادية ناقصة');
  assert.match(raw, /androidx\.core:core-ktx/, 'اعتمادية ناقصة');
});

test('pubspec مافيهوش حزمة إشعارات سحابية', () => {
  const pubspec = read(join(APP, 'pubspec.yaml'));

  /**
   * ️ الفحص ده اتعمل غلط مرة قبل كده: بحث عن «notification»
   *    فطابق `flutter_localizations` وقال إن فيه حزمة موجودة.
   *    دلوقتي بندوّر على أسماء الحزم بالظبط.
   */
  for (const pkg of [
    'firebase_messaging',
    'firebase_core',
    'flutter_local_notifications',
  ]) {
    assert.doesNotMatch(
      pubspec,
      new RegExp(`^\\s*${pkg}\\s*:`, 'm'),
      `${pkg} مش مطلوبة — المنبه محلي`,
    );
  }
});

// ════════════════════════════════════════════════
//  ٣. الجدولة بـ setAlarmClock مش بحاجة أضعف
// ════════════════════════════════════════════════

test('الجدولة بـ setAlarmClock — أقوى مسار في أندرويد', () => {
  const src = read(join(ALARM_KT, 'AlarmScheduler.kt'));

  assert.match(src, /setAlarmClock/, 'المسار الأقوى مش مستخدم');

  /**
   * ️ `setRepeating` مش دقيق من أندرويد 4.4 — النظام بيجمّع
   *    المنبهات ويأخّرها. استخدامه معناه منبه بيرن بعد الميعاد
   *    بدقايق عشوائية.
   */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /setRepeating/, 'setRepeating مش دقيق — ممنوع');

  //  مسار احتياطي لما المستخدم يمنع المنبهات الدقيقة
  assert.match(code, /setAndAllowWhileIdle/, 'مفيش مسار احتياطي');

  //  إعادة الجدولة بعد الإقلاع وتغيير المنطقة الزمنية
  assert.match(src, /rescheduleAll/);
});

test('المستقبِل بيصحى مع الإقلاع وتغيير الوقت', () => {
  const src = read(join(ALARM_KT, 'AlarmReceiver.kt'));

  //  النظام بيمسح كل المنبهات المجدولة عند الإقلاع
  assert.match(src, /BOOT_COMPLETED/);
  //  مسافر من القاهرة للرياض = المواعيد المحسوبة بقت غلط
  assert.match(src, /TIMEZONE_CHANGED/);
});

// ════════════════════════════════════════════════
//  ٤. المانيفست — الصلاحيات والمكوّنات
// ════════════════════════════════════════════════

test('المانيفست فيه كل صلاحيات المنبه', () => {
  const manifest = read(join(ANDROID, 'AndroidManifest.xml'));

  const required = [
    'USE_EXACT_ALARM',
    'SCHEDULE_EXACT_ALARM',
    'USE_FULL_SCREEN_INTENT',
    'POST_NOTIFICATIONS',
    'RECEIVE_BOOT_COMPLETED',
    'WAKE_LOCK',
    'FOREGROUND_SERVICE',
    'FOREGROUND_SERVICE_SPECIAL_USE',
  ];

  const missing = required.filter((p) => !manifest.includes(p));
  assert.deepEqual(missing, [], 'صلاحيات ناقصة — المنبه مش هيشتغل');
});

test('المكوّنات الثلاثة مسجّلة', () => {
  const manifest = read(join(ANDROID, 'AndroidManifest.xml'));

  assert.match(manifest, /com\.bal\.bal_app\.alarm\.AlarmActivity/);
  assert.match(manifest, /com\.bal\.bal_app\.alarm\.AlarmRingService/);
  assert.match(manifest, /com\.bal\.bal_app\.alarm\.AlarmReceiver/);

  /**
   * ️ `foregroundServiceType="specialUse"` إجباري من أندرويد 14.
   *    من غيره: MissingForegroundServiceTypeException وانهيار
   *    فوري لحظة الرنين — أسوأ وقت ممكن.
   */
  assert.match(manifest, /foregroundServiceType="specialUse"/);

  //  الشاشة لازم تظهر فوق القفل وتولّع الشاشة
  assert.match(manifest, /android:showWhenLocked="true"/);
  assert.match(manifest, /android:turnScreenOn="true"/);

  //  المستقبِل لازم exported عشان نيّات النظام توصله
  assert.match(manifest, /android:directBootAware="true"/);
});

// ════════════════════════════════════════════════
//  ٥. الجسر موصّل من الطرفين
// ════════════════════════════════════════════════

test('MainActivity بيسجّل القناتين', () => {
  const src = read(join(KOTLIN, 'MainActivity.kt'));

  assert.match(src, /MethodChannel/, 'قناة الأوامر مش مسجّلة');
  assert.match(src, /EventChannel/, 'قناة الأحداث مش مسجّلة');
  assert.match(src, /AlarmPlugin/);
});

test('أسماء القنوات متطابقة بين Kotlin و Dart', () => {
  /**
   * ️ اختلاف حرف واحد في اسم القناة = كل النداءات بترجع
   *    `MissingPluginException`، والمنبه بيتجدول في اللاشيء.
   *    الخطأ ده مبيظهرش وقت البناء.
   */
  const kotlin = read(join(ALARM_KT, 'AlarmPlugin.kt'));
  const dart = read(join(LIB, 'core/alarm/native_alarm.dart'));

  const ktMethod = /METHOD_CHANNEL = "([^"]+)"/.exec(kotlin)?.[1];
  const ktEvent = /EVENT_CHANNEL = "([^"]+)"/.exec(kotlin)?.[1];

  const dartMethod = /MethodChannel\('([^']+)'\)/.exec(dart)?.[1];
  const dartEvent = /EventChannel\('([^']+)'\)/.exec(dart)?.[1];

  assert.equal(ktMethod, dartMethod, 'اسم قناة الأوامر مختلف');
  assert.equal(ktEvent, dartEvent, 'اسم قناة الأحداث مختلف');
});

test('كل دالة بينداها Dart متعرّفة في Kotlin', () => {
  const kotlin = read(join(ALARM_KT, 'AlarmPlugin.kt'));
  const dart = read(join(LIB, 'core/alarm/native_alarm.dart'));

  /**
   * الأسماء اللي Dart بيبعتها.
   *
   * ️ الريجيكس لازم يستوعب تلات أشكال:
   *     invokeMethod('x')
   *     invokeMethod<int>('x')
   *     invokeMethod<Map<Object?, Object?>>('x')   ← أقواس متداخلة
   *   والنداء ممكن يكون متلفّ على سطرين.
   *
   *   النسخة الأولى كانت `[^>]*` فوقفت عند أول `>` في
   *   `Map<Object?` ومشافتش النداء. النتيجة إنها لقت ٥ من ١١
   *   والحارس كان هيعدّي على نص التغطية.
   */
  const called = new Set(
    [...dart.matchAll(/invokeMethod[\s\S]{0,60}?'(\w+)'/g)].map((m) => m[1]),
  );

  /**
   * ️ وكمان: `openSettingsFor` بيبني اسم الدالة من `switch`
   *    بدل ما يكتبه في النداء. الأسماء دي لازم تتحسب برضه.
   */
  for (const m of dart.matchAll(/=>\s*'(open\w+)'/g)) called.add(m[1]);

  //  الأسماء اللي جوه switch في Kotlin
  const handled = new Set(
    [...kotlin.matchAll(/^\s+"(\w+)"\s*->/gm)].map((m) => m[1]),
  );

  const missing = [...called].filter((m) => !handled.has(m));
  assert.deepEqual(missing, [], 'دوال بتترمي في اللاشيء');

  assert.ok(called.size >= 12, `${called.size} دالة بس — الريجيكس اتكسر`);
});

// ════════════════════════════════════════════════
//  ٦. السلسلة كاملة: جدولة → رنين → مهمة → تسجيل
// ════════════════════════════════════════════════

test('شاشة المنبهات بتجدول في النظام مش في السيرفر بس', () => {
  const src = read(join(LIB, 'screens/alarm/alarms_screen.dart'));

  /**
   * ️ من غير النداء ده المنبه موجود في قاعدة البيانات ومش
   *    موجود في الجهاز — يعني **مش هيرن**.
   */
  assert.match(src, /NativeAlarm\.sync/, 'مفيش مزامنة مع النظام');
  assert.match(src, /NativeAlarm\.diagnostics/, 'مفيش فحص للإعدادات');
});

test('الشل بيسمع رنين المنبه ويفتح المهمة', () => {
  const src = read(join(LIB, 'shell/main_shell.dart'));

  assert.match(src, /NativeAlarm\.onRinging/, 'مفيش استماع للرنين');
  assert.match(src, /WakeTaskScreen/, 'المهمة مش بتتفتح');

  /**
   * ️ المنبه ممكن يكون بيرن والتطبيق لسه بيفتح (النظام هو
   *    اللي فتحه)، فالحدث بيفوت. لازم نسأل كمان.
   */
  assert.match(src, /ringingAlarmId/, 'مفيش سؤال عن رنين جارٍ');

  //  الصوت بيقف بعد الحل بس
  assert.match(src, /NativeAlarm\.dismiss/);
});

test('الصوت مبيقفش غير بعد حل المهمة', () => {
  const src = read(join(LIB, 'shell/main_shell.dart'));

  /**
   * ️ جوهر الفكرة كلها. لو الصوت وقف بمجرد فتح الشاشة،
   *    المستخدم يقدر يرجع ينام والشاشة مفتوحة — والمنبه
   *    اتقفل من غير ما يصحى.
   */
  const dismissCall = /if \(solved == true\)\s*await NativeAlarm\.dismiss/;
  assert.match(src, dismissCall, 'الصوت بيقف من غير حل');
});

test('نصوص المنبه العربية موجودة كموارد', () => {
  /**
   * ️ النصوص في res/values مش جوه Kotlin عن قصد: ملفات .kt
   *    بتتقرا بترميز النظام على ويندوز، فالعربي بيتلف. ملفات
   *    الموارد بتحمل ترميزها في أول سطر.
   */
  const strings = join(ANDROID, 'res/values/strings_alarm.xml');
  assert.ok(existsSync(strings), 'ملف النصوص ناقص');

  const src = read(strings);
  for (const key of [
    'clan_alarm_default_label',
    'clan_alarm_channel_name',
    'clan_alarm_test_label',
  ]) {
    assert.match(src, new RegExp(`name="${key}"`), `النص ${key} ناقص`);
  }
});
