/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار حلقة الاطمئنان — أهم فيتشر في التطبيق
 *
 *  بيغطي المنطق الخالص بلا قاعدة بيانات ولا Redis ولا Gemini:
 *    1. persona.build يطبّق قواعد TASK_FOLLOWUP فعلاً (كان باج)
 *    2. gemini يحترم opts.temperature (كان باج)
 *    3. resolveTaskEnd بيحسب نهاية المهمة صح من كل المصادر
 *    4. بنك الصيغ: تنوّع حقيقي وبلا تكرار + استبدال اسم المهمة
 *    5. checkinThread: عدّ الأدوار + تحويل history لصيغة Gemini
 *
 *  التشغيل:  node test/checkin-loop.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-1234';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-56';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test from 'node:test';

const root = new URL('../src/', import.meta.url);
const load = (p) => import(new URL(p, root).href);

// ════════════════════════════════════════════════
test('persona.build يطبّق قواعد TASK_FOLLOWUP (الباج القديم)', async () => {
  const persona = await load('services/aiPersona.service.js');

  const followup = persona.build('TASK_FOLLOWUP');
  const plain = persona.build('COMPANION');

  // القاعدة الحاسمة: ممنوع اللوم
  assert.match(
    followup,
    /الاحتواء وإعادة التوجيه/,
    'قواعد TASK_FOLLOWUP لازم تكون داخل التعليمة',
  );
  assert.notEqual(
    followup,
    plain,
    'TASK_FOLLOWUP كان بيرجع نفس نص COMPANION — القواعد كانت بتسقط صامتة',
  );

  // ما يكسرش الأوضاع العادية
  assert.match(persona.build('ASSISTANT'), /وضع المساعد/);
  assert.match(persona.build('COMPANION', null, 'STUCK'), /متعثّر/);
});

// ════════════════════════════════════════════════
test('gemini بيحترم opts.temperature', async () => {
  const src = await import('node:fs').then((fs) =>
    fs.promises.readFile(new URL('services/gemini.service.js', root), 'utf8'),
  );

  assert.match(
    src,
    /temperature:\s*typeof opts\.temperature === 'number'/,
    'temperature لازم تيجي من opts مش مثبّتة',
  );
});

// ════════════════════════════════════════════════
test('resolveTaskEnd بيحسب نهاية المهمة من كل المصادر', async () => {
  const { resolveTaskEnd } = await load('utils/taskTiming.js');

  // 1) scheduledEnd صريح — الأولوية القصوى
  const explicit = new Date('2026-08-14T17:00:00.000Z');
  assert.equal(
    resolveTaskEnd({ scheduledEnd: explicit }).toISOString(),
    explicit.toISOString(),
  );

  // 2) بلوك زمني: slotDate + endTime  ("من 3 لـ 5")
  const block = resolveTaskEnd({
    slotDate: new Date('2026-08-14T00:00:00.000Z'),
    startTime: '15:00',
    endTime: '17:00',
  });
  assert.equal(block.toISOString(), '2026-08-14T17:00:00.000Z');

  // 3) بداية + مدة مقدّرة
  const est = resolveTaskEnd({
    scheduledStart: new Date('2026-08-14T15:00:00.000Z'),
    estimatedMin: 90,
  });
  assert.equal(est.toISOString(), '2026-08-14T16:30:00.000Z');

  // 4) آخر حل: dueDate
  const due = new Date('2026-08-14T12:00:00.000Z');
  assert.equal(resolveTaskEnd({ dueDate: due }).toISOString(), due.toISOString());

  // 5) مفيش أي وقت → null (ما نجدولش على الفاضي)
  assert.equal(resolveTaskEnd({ title: 'مهمة بلا وقت' }), null);
  assert.equal(resolveTaskEnd(null), null);
});

// ════════════════════════════════════════════════
test('localHourToUtc: سؤال الجبل بتوقيت المستخدم مش UTC', async () => {
  const { localHourToUtc } = await load('utils/taskTiming.js');

  // القاهرة صيفاً = UTC+3 → 21:00 محلي = 18:00 UTC
  const cairo = localHourToUtc('2026-08-14', 'Africa/Cairo', 21);
  assert.equal(cairo.toISOString(), '2026-08-14T18:00:00.000Z');

  // طوكيو = UTC+9 → 21:00 محلي = 12:00 UTC
  const tokyo = localHourToUtc('2026-08-14', 'Asia/Tokyo', 21);
  assert.equal(tokyo.toISOString(), '2026-08-14T12:00:00.000Z');

  // نيويورك صيفاً = UTC-4 → 21:00 محلي = 01:00 UTC اليوم اللي بعده
  const ny = localHourToUtc('2026-08-14', 'America/New_York', 21);
  assert.equal(ny.toISOString(), '2026-08-15T01:00:00.000Z');

  // مستخدمين في مناطق مختلفة ما يتسألوش في نفس اللحظة
  assert.notEqual(cairo.getTime(), tokyo.getTime());
});

// ════════════════════════════════════════════════
test('بنك الصيغ: تنوّع حقيقي والمهمة باسمها', async () => {
  const phrases = await load('services/checkinPhrases.service.js');

  // البنك كبير كفاية إن التكرار ما يبقاش ملحوظ
  assert.ok(
    phrases.FALLBACK_TEMPLATES.length >= 10,
    'بنك الصيغ الاحتياطية لازم يكون 10 على الأقل',
  );
  assert.ok(
    phrases.AI_VARIANT_HINTS.length >= 8,
    'توجيهات الأسلوب لازم تكون 8 على الأقل',
  );

  // مفيش صيغتين متطابقتين
  const unique = new Set(phrases.FALLBACK_TEMPLATES);
  assert.equal(
    unique.size,
    phrases.FALLBACK_TEMPLATES.length,
    'فيه صيغ مكررة في البنك',
  );

  // كل صيغة بتذكر المهمة بالاسم وبتنتهي بسؤال أو دعوة للحكي
  for (const t of phrases.FALLBACK_TEMPLATES) {
    assert.ok(t.includes('{task}'), `الصيغة مش بتذكر اسم المهمة: ${t}`);
  }

  // Redis مش شغال هنا → لازم يشتغل fail-open مش يرمي
  const text = await phrases.nextFallbackText('user-1', 'مذاكرة Dart');
  assert.ok(text.includes('مذاكرة Dart'), 'اسم المهمة مادخلش في النص');
  assert.ok(!text.includes('{task}'), 'الـ placeholder فضل زي ما هو');

  const hint = await phrases.nextAiVariantHint('user-1');
  assert.ok(typeof hint === 'string' && hint.length > 0);

  // تنوّع فعلي على مدى 30 نداء
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    seen.add(await phrases.nextFallbackText('user-1', 'مهمة'));
  }
  assert.ok(seen.size >= 5, `التنوّع ضعيف جداً: ${seen.size} صيغة بس`);
});

// ════════════════════════════════════════════════
test('checkinThread: عدّ الأدوار وتحويل الـ history', async () => {
  const thread = await load('services/checkinThread.service.js');

  const sample = [
    { sender: 'user', text: 'خلصت نصها', at: 'x' },
    { sender: 'companion', text: 'جامد! إيه اللي وقف؟', at: 'x' },
    { sender: 'user', text: 'تعبت', at: 'x' },
  ];

  assert.equal(thread.countUserTurns(sample), 2);
  assert.equal(thread.countUserTurns([]), 0);

  const history = thread.toGeminiHistory(sample);
  assert.equal(history.length, 3);
  assert.equal(history[0].role, 'user');
  assert.equal(history[1].role, 'model', 'رد الرفيق لازم يبقى role=model');
  assert.equal(history[1].parts[0].text, 'جامد! إيه اللي وقف؟');

  // سقف معقول يمنع تحويل البوب-أب لشات مفتوح
  assert.ok(thread.MAX_USER_TURNS > 0 && thread.MAX_USER_TURNS <= 20);

  // Redis واقع → fail-open
  assert.deepEqual(await thread.getThread('no-such-id'), []);
});

// ════════════════════════════════════════════════
test('realtime: emitToUser فايل-أوبن من غير io ولا Redis', async () => {
  const realtime = await load('services/realtime.service.js');

  assert.equal(realtime.userRoom('abc'), 'user:abc');

  // ما يرميش — الإشعار محفوظ في القاعدة والتطبيق هيلاقيه بالـ fetch
  const ok = await realtime.emitToUser('u1', 'notification:new', { a: 1 });
  assert.equal(ok, false);

  // مدخلات ناقصة
  assert.equal(await realtime.emitToUser(null, 'e', {}), false);
  assert.equal(await realtime.emitToUser('u1', null, {}), false);
});

// ════════════════════════════════════════════════
test('journeyPlanner: ترتيب الأيام قبل إعادة الترقيم', async () => {
  /**
   * ️ باج حقيقي: النماذج بترجع الأيام مش مرتبة أحياناً، والنسخة
   *    القديمة كانت بتعيد الترقيم بالـ index على طول — فالمستخدم
   *    كان ممكن يبدأ رحلته باليوم التالت.
   */
  const src = await import('node:fs').then((fs) =>
    fs.promises.readFile(
      new URL('services/journeyPlanner.service.js', root),
      'utf8',
    ),
  );

  const normalizeBlock = src.slice(
    src.indexOf('const days = data.days'),
    src.indexOf('if (days.length === 0)'),
  );

  assert.match(
    normalizeBlock,
    /\.sort\(\(a, b\) => a\.day - b\.day\)/,
    'لازم ترتيب بالـ day قبل إعادة الترقيم',
  );
  assert.ok(
    normalizeBlock.indexOf('.sort(') < normalizeBlock.lastIndexOf('day: i + 1'),
    'الترتيب لازم يسبق إعادة الترقيم',
  );
});
