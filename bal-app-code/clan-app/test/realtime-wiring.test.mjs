/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار الوصول المستمر (Socket.io)
 *
 *  السيرفر كان عنده قناتين جاهزتين (/notifications و /chat)
 *  والتطبيق كان بيستطلع كل 3-5 ثواني بدل ما يستخدمهم:
 *    · الرسالة بتتأخر لحد 5 ثواني
 *    · طلب شبكة كل 5 ثواني حتى لو مفيش جديد
 *
 *  ⚠️ الاختبارات دي بتحرس حاجتين متضادين:
 *     1. السوكيت موصول فعلاً (مش مجرد حزمة مضافة)
 *     2. الاستطلاع **ما اتشالش** — لو السوكيت فشل، الشاشة
 *        لازم تفضل شغالة بدل ما تبقى ميتة
 *
 *  التشغيل:  node --test test/realtime-wiring.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');
const SRV = resolve(HERE, '../src');

const read = (p) => readFileSync(join(LIB, p), 'utf8');

// ════════════════════════════════════════════════
test('حزمة السوكيت مثبّتة', () => {
  const pubspec = readFileSync(join(APP, 'pubspec.yaml'), 'utf8');
  assert.match(pubspec, /socket_io_client:/, 'الحزمة مش في pubspec');
});

test('خدمة البث موجودة وموصولة بالقناتين', () => {
  const p = join(LIB, 'core/realtime/realtime_service.dart');
  assert.ok(existsSync(p), 'خدمة البث مفقودة');

  const src = readFileSync(p, 'utf8');

  /** لازم القناتين — الإشعارات والشات */
  assert.match(src, /\/notifications/, 'قناة الإشعارات مش موصولة');
  assert.match(src, /\/chat/, 'قناة الشات مش موصولة');

  /** الأحداث اللي السيرفر بيبعتها */
  for (const evt of [
    'notification:new',
    'notification:pending',
    'checkin:reply',
    'tasks:generated',
  ]) {
    assert.match(src, new RegExp(evt.replace(':', ':')), `الحدث ${evt} مش متعالج`);
  }
});

test('أسماء الأحداث مطابقة للسيرفر', () => {
  /**
   * ️ لو السيرفر غيّر اسم حدث، السوكيت هيفضل موصول والرسايل
   *    مش هتوصل — أسوأ من خطأ صريح لأنه بيفشل في صمت.
   */
  const socket = readFileSync(join(SRV, 'sockets/notification.socket.js'), 'utf8');
  const service = read('core/realtime/realtime_service.dart');

  for (const evt of ['notification:new', 'notification:pending', 'notification:seen']) {
    assert.match(socket, new RegExp(evt), `السيرفر بطّل يبعت ${evt}`);
  }

  const realtimeSrv = readFileSync(join(SRV, 'services/realtime.service.js'), 'utf8');
  assert.match(realtimeSrv, /userRoom/, 'غرفة المستخدم اتشالت من السيرفر');

  assert.match(service, /notification:seen/, 'التطبيق مش بيعلّم المقروء');
});

test('المصادقة بالتوكن على السوكيت', () => {
  const service = read('core/realtime/realtime_service.dart');
  assert.match(service, /setAuth\(\{'token'/, 'مفيش توكن في الاتصال');

  /** السيرفر لازم يفضل يرفض بلا توكن */
  const socket = readFileSync(join(SRV, 'sockets/notification.socket.js'), 'utf8');
  assert.match(socket, /UNAUTHORIZED/, 'السيرفر بطّل يرفض غير المصرّح');
});

test('الاستطلاع فضل احتياطي — مش اتشال', () => {
  /**
   * ️ ده الاختبار الأهم هنا. شبكات كتير بتمنع WebSocket
   *    (بروكسي شركة، نت محدود). لو شيلنا الاستطلاع، فشل
   *    السوكيت = شات ميت بلا أي رسالة للمستخدم.
   */
  const conv = read('screens/chat/conversation_screen.dart');
  assert.match(conv, /Timer\.periodic/, 'الاستطلاع الاحتياطي اتشال');
  assert.match(conv, /onMessage\.listen/, 'مش بيسمع الرسايل اللحظية');

  /** الفاصل اتوسّع لأن السوكيت بقى الأساس */
  assert.match(
    conv,
    /Duration\(seconds: 15\)/,
    'فاصل الاستطلاع الاحتياطي المفروض يبقى أطول',
  );

  const watcher = read('core/checkin/checkin_watcher.dart');
  assert.match(watcher, /Timer\.periodic/, 'المسح المحلي للمواعيد اتشال');
});

test('الرسالة بتتفلتر على محادثتها', () => {
  /**
   * ️ قناة الشات بتوصّل كل محادثات المستخدم. من غير الفلتر،
   *    رسالة من محادثة تانية هتظهر في الشاشة المفتوحة.
   */
  const conv = read('screens/chat/conversation_screen.dart');

  /**
   * ️ الفلتر اتنقل لدالة `_isMine` بدل ما يكون مكتوب جوه
   *    المستمع — عشان بقى بيتستخدم في أكتر من مكان. الفحص
   *    بيدوّر على المقارنة نفسها في أي مكان في الملف.
   */
  assert.match(
    conv,
    /cid\s*(!==?|==)\s*widget\.conversationId/,
    'الرسايل مش متفلترة على المحادثة',
  );
  assert.match(
    conv,
    /onMessage\.listen/,
    'مفيش استماع لرسايل السوكيت',
  );
});

test('إعادة الاتصال بعد الرجوع من الخلفية', () => {
  /**
   * ️ نظام التشغيل بيقفل السوكيت لما التطبيق يروح للخلفية.
   *    من غير إعادة الاتصال، الرسايل بتبطل توصل بصمت.
   */
  const shell = read('shell/main_shell.dart');
  assert.match(shell, /AppLifecycleState\.resumed/, 'مفيش مراقبة للرجوع');
  assert.match(
    shell,
    /if \(!_realtime\.isConnected\) _realtime\.connect\(\)/,
    'مفيش إعادة اتصال بعد الرجوع',
  );

  const service = read('core/realtime/realtime_service.dart');
  assert.match(service, /enableReconnection/, 'إعادة المحاولة التلقائية مطفية');
});

test('مفيش اتصال مزدوج', () => {
  /**
   * ️ لو `connect()` اتنادت مرتين بلا قفل القديم، كل حدث
   *    هيوصل مرتين — والمستخدم هيشوف الرسالة مكررة.
   */
  const service = read('core/realtime/realtime_service.dart');
  assert.match(
    service,
    /disconnect\(\);[\s\S]{0,200}final origin/,
    'connect() مش بيقفل الاتصال القديم',
  );
});

test('المراقب بيستقبل من السوكيت والمسح المحلي', () => {
  const watcher = read('core/checkin/checkin_watcher.dart');
  const shell = read('shell/main_shell.dart');

  assert.match(watcher, /bindRealtime/, 'المراقب مش موصول بالبث');
  assert.match(watcher, /_ingestNotification/, 'مفيش معالجة للإشعار اللحظي');
  assert.match(shell, /_watcher\.bindRealtime\(_realtime\)/, 'الشل مش بيربطهم');

  /** الدعوة والاطمئنان لازم يفضلوا منفصلين */
  assert.match(watcher, /FOCUS_CHALLENGE/, 'الدعوات مش متعالجة في البث');
});
