/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار توصيل الرسائل بالسيرفر
 *
 *  ⚠️ الاختناقات اللي بيحرسها (كلها كانت موجودة فعلاً):
 *
 *   1. **مفيش شاشة محادثة خالص.** السيرفر فيه 18 نقطة للشات
 *      والتطبيق كان بيستخدم اتنين. المستخدم يقدر يبدأ محادثة
 *      ومش يقدر يقراها ولا يرد عليها.
 *
 *   2. **كارت المحادثة مش قابل للضغط** — صندوق ميت بلا onTap.
 *
 *   3. **`conv['title']` مش موجود في رد السيرفر** — السيرفر بيرجّع
 *      `user.username`، فكل المحادثات كانت بتظهر باسم «محادثة».
 *
 *   4. **`catch (_)` بيبلع الأخطاء** — السيرفر واقع؟ المستخدم يشوف
 *      «مفيش محادثات» ويفتكرها الحقيقة.
 *
 *   5. **قايمة العشائر نص ثابت** مش بيانات، وزرار «دخول» فاضي.
 *
 *  التشغيل:  node --test test/chat-wiring.test.mjs
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
test('شاشة المحادثة موجودة وبتقرا وتبعت', () => {
  const p = join(LIB, 'screens/chat/conversation_screen.dart');
  assert.ok(existsSync(p), 'شاشة المحادثة مفقودة — الشات بلا معنى من غيرها');

  const src = readFileSync(p, 'utf8');
  assert.match(src, /ApiEndpoints\.chatMessages/, 'مش بتجيب الرسائل');
  assert.match(src, /\.post\(\s*ApiEndpoints\.chatMessages/s, 'مش بتبعت رسائل');
  assert.match(src, /isGroup/, 'مفيش دعم لشات العشيرة');
});

test('كارت المحادثة قابل للضغط', () => {
  const src = read('screens/chat/chat_screen.dart');

  /** ️ من غير onTap الكارت صندوق ميت */
  assert.match(
    src,
    /onTap:\s*\(\)\s*=>\s*_openConversation\(conv\)/,
    'كارت المحادثة مش قابل للضغط',
  );
  assert.match(src, /ConversationScreen\(/, 'مش بيفتح شاشة المحادثة');
});

test('اسم المحادثة بييجي من user.username مش title', () => {
  const models = read('models/models.dart');

  const block = models.slice(
    models.indexOf('factory Conversation.fromJson'),
    models.indexOf('}', models.indexOf('factory Conversation.fromJson') + 400),
  );

  /**
   * ️ السيرفر (listConversations) بيرجّع `user: {username, ...}`
   *    ومفيش `title` خالص. القراءة من title كانت بتدي «محادثة» دايماً.
   */
  assert.match(block, /u\['username'\]/, 'الاسم لازم ييجي من user.username');
  assert.match(block, /isOnline/, 'حالة الحضور مش بتتقرا');
  assert.match(block, /unread/, 'عداد غير المقروء مش بيتقرا');
});

test('السيرفر فعلاً بيرجّع user مش title', () => {
  /** حارس ضد تغيير عقد السيرفر من تحتنا */
  const ctrl = readFileSync(join(SRV, 'modules/chat/chat.controller.js'), 'utf8');
  const block = ctrl.slice(
    ctrl.indexOf('export const listConversations'),
    ctrl.indexOf('export const listClanChats'),
  );

  assert.match(block, /user:\s*other/, 'السيرفر غيّر شكل الرد');
  assert.match(block, /unread:/, 'عداد غير المقروء اتشال من السيرفر');
});

test('الأخطاء بتتعرض مش بتتبلع', () => {
  const chat = read('screens/chat/chat_screen.dart');

  assert.match(chat, /_error/, 'مفيش حالة خطأ');
  assert.match(chat, /_errorView/, 'مفيش عرض للخطأ');

  /**
   * ️ `catch (_)` مع setState فاضي = الخطأ بيختفي والمستخدم
   *    بيشوف قائمة فاضية ويفتكرها الحقيقة.
   */
  assert.doesNotMatch(
    chat,
    /catch \(_\) \{\s*setState\(\(\) => _loading = false\);\s*\}/,
    'لسه فيه catch بيبلع الخطأ',
  );
});

test('قايمة العشائر بيانات حقيقية مش نص ثابت', () => {
  const chat = read('screens/chat/chat_screen.dart');

  assert.match(chat, /ApiEndpoints\.clanChats/, 'مش بتجيب شاتات العشائر');
  assert.match(chat, /_openClanChat/, 'مش بتفتح شات العشيرة');

  /** النص الثابت القديم */
  assert.doesNotMatch(
    chat,
    /عشائر عامة \(حسب اهتمامك\)/,
    'لسه فيه نص ثابت بدل البيانات',
  );

  /** زرار فاضي */
  const emptyHandlers = [...chat.matchAll(/onPressed:\s*\(\)\s*\{\s*\}/g)];
  assert.equal(emptyHandlers.length, 0, 'فيه زرار بمعالج فاضي');
});

test('البحث بيوصّل للمحادثة بعد ما يبدأها', () => {
  const chat = read('screens/chat/chat_screen.dart');

  /**
   * ️ الكود القديم كان بيبعت الرسالة ويسيب المستخدم في شاشة
   *    البحث — المحادثة اتفتحت ومفيش طريق يوصلها.
   */
  assert.match(chat, /isFriendRequest'\] != true/, 'مش بيفرّق بين الطلب والمحادثة');
});

test('كل نقاط الشات المستخدمة معرّفة', () => {
  const endpoints = read('core/network/api_endpoints.dart');
  for (const ep of ['conversations', 'clanChats', 'chatMessages', 'openClanChat']) {
    assert.match(endpoints, new RegExp(`\\b${ep}\\b`), `${ep} مش معرّفة`);
  }
});

test('الاستطلاع ما يعملش إعادة بناء بلا داعي', () => {
  /**
   * ️ استطلاع كل 5 ثواني مع setState غير مشروط بيعيد بناء الشاشة
   *    باستمرار ويقطع اختيار المستخدم للنص.
   */
  const conv = readFileSync(
    join(LIB, 'screens/chat/conversation_screen.dart'),
    'utf8',
  );
  assert.match(conv, /silent/, 'مفيش وضع صامت للاستطلاع');

  /**
   * ️ الفحص بيدوّر على **السلوك** مش على نص بعينه.
   *
   *  النسخة القديمة كانت بتطابق السطر حرفياً:
   *    `if (silent && loaded.length == _messages.length) return;`
   *
   *  الشرط بقى أقوى دلوقتي (بيقارن معرّف آخر رسالة كمان، عشان
   *  التعديل والحذف بيغيّروا المحتوى من غير ما يغيّروا العدد)،
   *  فالمطابقة الحرفية فشلت رغم إن السلوك اتحسّن. الاختبار
   *  اللي بيتكسر من التحسين اختبار غلط.
   */
  const guard = /if \(\s*silent[\s\S]{0,220}?return;/.exec(conv);
  assert.ok(guard, 'مفيش حارس ضد إعادة البناء بلا داعي');
  assert.match(
    guard[0],
    /loaded\.length == _messages\.length/,
    'الحارس مش بيقارن عدد الرسايل',
  );
});
