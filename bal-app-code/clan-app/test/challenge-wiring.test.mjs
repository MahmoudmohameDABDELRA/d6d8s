/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار جلسات التركيز الجماعية والدعوات
 *
 *  ⚠️ السيرفر كان فيه 6 نقاط للتحديات وماكانش ليها أي واجهة —
 *     ولا طريقة تعمل بيها تحدي، ولا تشوف دعوة، ولا تدخل غرفة.
 *
 *  الفلو الكامل اللي بيحرسه الاختبار:
 *     عضو العشيرة يعمل تحدي → إشعار للأعضاء → بوب-أب دعوة →
 *     قبول → غرفة انتظار → صاحب التحدي يبدأ → الكل يدخل الجلسة سوا
 *
 *  التشغيل:  node --test test/challenge-wiring.test.mjs
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
test('شاشة غرفة التحدي موجودة وموصولة', () => {
  const p = join(LIB, 'screens/focus/challenge_room_screen.dart');
  assert.ok(existsSync(p), 'غرفة التحدي مفقودة');

  const src = readFileSync(p, 'utf8');
  for (const ep of [
    'focusChallengeGet',
    'focusChallengeStart',
    'focusChallengeLeave',
  ]) {
    assert.match(src, new RegExp(`ApiEndpoints\\.${ep}`), `${ep} مش مستخدمة`);
  }
});

test('فيه طريقة تعمل بيها تحدي', () => {
  /**
   * ️ من غير مدخل، الفيتشر كله كود ميت. الزرار في شاشة أعضاء
   *    العشيرة لأن التحدي بيتعمل من عشيرة أصلاً.
   */
  const members = read('screens/clans/clan_members_screen.dart');

  assert.match(members, /ApiEndpoints\.focusChallenge\b/, 'مفيش إنشاء تحدي');
  assert.match(members, /ChallengeRoomScreen/, 'مش بيوديك للغرفة');
  assert.match(members, /clanId/, 'مش بيبعت العشيرة');
});

test('حدود السيرفر محترمة في الواجهة', () => {
  /**
   * ️ السيرفر بيرفض راحة > 10 دقايق. لو الواجهة سمحت بـ 15،
   *    المستخدم يظبط ويترفض — إحباط كان ممكن نمنعه.
   */
  const members = read('screens/clans/clan_members_screen.dart');
  assert.match(members, /_restMin < 10/, 'الواجهة بتسمح براحة أكتر من الحد');
  assert.match(members, /_cycles < 8/, 'الواجهة بتسمح بدورات أكتر من الحد');
  assert.match(members, /_focusMin < 120/, 'الواجهة بتسمح بتركيز أطول من الحد');

  /** الحدود لسه هي هي في السيرفر */
  const ctrl = readFileSync(
    join(SRV, 'modules/focus/challenge.controller.js'),
    'utf8',
  );
  assert.match(ctrl, /rMin < 1 \|\| rMin > 10/, 'حد الراحة في السيرفر اتغير');
  assert.match(ctrl, /cNum < 1 \|\| cNum > 8/, 'حد الدورات في السيرفر اتغير');
});

test('الدعوة بتطلع لوحدها', () => {
  const watcher = read('core/checkin/checkin_watcher.dart');
  const shell = read('shell/main_shell.dart');

  assert.match(watcher, /FOCUS_CHALLENGE/, 'المراقب مش بيمسك الدعوات');
  assert.match(watcher, /ChallengeInvite/, 'مفيش نموذج للدعوة');
  assert.match(shell, /showChallengeInvite/, 'الشل مش بيعرض الدعوة');
});

test('الدعوة ليها أولوية على سؤال الاطمئنان', () => {
  /**
   * ️ التحدي بيبدأ في وقت محدد. لو الدعوة استنت ورا سؤال اطمئنان
   *    (اللي ممكن يفضل مأجّل)، التحدي هيبدأ من غير المستخدم.
   */
  const shell = read('shell/main_shell.dart');

  const inviteAt = shell.indexOf('currentInvite');
  const promptAt = shell.indexOf('_watcher.current;');

  assert.ok(inviteAt > 0, 'الشل مش بيفحص الدعوات');
  assert.ok(promptAt > 0, 'الشل مش بيفحص الاطمئنان');
  assert.ok(
    inviteAt < promptAt,
    'الاطمئنان بيتفحص قبل الدعوة — الدعوة ممكن تفوت',
  );
});

test('الطابورين منفصلين', () => {
  /**
   * ️ خلط الدعوات مع أسئلة الاطمئنان في طابور واحد معناه إن دعوة
   *    ممكن تستنى ورا سؤال المستخدم مأجّله.
   */
  const watcher = read('core/checkin/checkin_watcher.dart');
  assert.match(watcher, /_invites\s*=\s*\[\]/, 'مفيش طابور منفصل للدعوات');
  assert.match(watcher, /dismissInvite/, 'مفيش طريقة تتخلص من الدعوة');
});

test('التحدي لما يبدأ الكل يدخل تلقائياً', () => {
  /**
   * ️ ده معنى «نبدأ سوا». لو استنينا كل واحد يضغط زرار، مش سوا.
   */
  const room = read('screens/focus/challenge_room_screen.dart');

  assert.match(room, /ch\.isActive/, 'مش بيكتشف بداية التحدي');
  assert.match(room, /pushReplacement/, 'مش بيدخل الجلسة تلقائياً');
  assert.match(room, /FocusSessionScreen/, 'مش بيفتح شاشة الجلسة');

  /** الاستطلاع لازم يقف قبل الانتقال — غير كده هيفضل شغال في الخلفية */
  assert.match(room, /_poll\?\.cancel\(\)/, 'الاستطلاع مش بيتوقف');
});

test('الاعتذار ما يحبسش المستخدم', () => {
  /**
   * ️ لو فشل تسجيل الاعتذار ورمينا خطأ، المستخدم يفضل قدام نافذة
   *    مش قادر يقفلها. الأسوأ من اعتذار مش متسجّل إنه يتحبس.
   */
  const dialog = read('widgets/challenge_invite_dialog.dart');
  assert.match(
    dialog,
    /catch \(_\)[\s\S]{0,300}navigator\.pop\(\)/,
    'فشل الاعتذار بيحبس المستخدم في البوب-أب',
  );
});

test('نموذج التحدي بيحسب الوقت صح', () => {
  const models = read('models/models.dart');

  /** آخر دورة بلا راحة بعدها — نفس معادلة السيرفر */
  assert.match(
    models,
    /focusMin \* cycles \+ restMin \* \(cycles - 1\)/,
    'حساب الوقت الإجمالي غلط',
  );

  const ctrl = readFileSync(
    join(SRV, 'modules/focus/challenge.controller.js'),
    'utf8',
  );
  assert.match(
    ctrl,
    /fMin \* cNum \+ rMin \* \(cNum - 1\)/,
    'معادلة السيرفر اتغيرت — لازم نطابقها',
  );
});
