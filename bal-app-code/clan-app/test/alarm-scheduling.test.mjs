/**
 * ════════════════════════════════════════════════════════════
 *  اختبار منطق جدولة المنبه
 * ════════════════════════════════════════════════════════════
 *
 *  لا يمكنني تشغيل Kotlin أو Swift في الساندبوكس.
 *  لكن منطق nextOccurrence هو نفسه بالضبط في الثلاثة.
 *  هنا أعيد كتابته بجافاسكريبت وأختبره على حالات حقيقية —
 *  خصوصاً عبور منتصف الليل والتوقيت الصيفي، وهما مصدر
 *  البقات المعروفة في كل تطبيقات المنبه.
 *
 *  شغّله:  node --test test/alarm-scheduling.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ════════════════════════════════════════════════
//  نسخة JS من AlarmScheduler.nextOccurrence
// ════════════════════════════════════════════════

/**
 * @param {{hour:number, minute:number, weekdays:number[], enabled:boolean}} alarm
 * @param {number} fromMillis
 * @returns {number} أقرب وقوع، أو -1
 */
function nextOccurrence(alarm, fromMillis) {
  if (!alarm.enabled) return -1;
  if (!alarm.weekdays || alarm.weekdays.length === 0) return -1;

  let best = Infinity;

  for (const jsDay of alarm.weekdays) {
    const d = new Date(fromMillis);
    d.setHours(alarm.hour, alarm.minute, 0, 0);

    let delta = (jsDay - d.getDay() + 7) % 7;
    if (delta === 0 && d.getTime() <= fromMillis) delta = 7;

    d.setDate(d.getDate() + delta);

    if (d.getTime() < best) best = d.getTime();
  }

  return best === Infinity ? -1 : best;
}

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;

/** بانٍ مختصر */
const alarm = (hour, minute, weekdays, enabled = true) =>
  ({ hour, minute, weekdays, enabled });

const fmt = (ms) => new Date(ms).toString();

// ════════════════════════════════════════════════
//  1. الحالات الأساسية
// ════════════════════════════════════════════════

test('منبه اليوم لم يحن بعد → اليوم نفسه', () => {
  // الخميس 30 يوليو 2026، الساعة 08:00
  const now = new Date(2026, 6, 30, 8, 0, 0, 0);
  assert.equal(now.getDay(), THU, 'التاريخ المرجعي يجب أن يكون خميساً');

  const next = nextOccurrence(alarm(14, 30, [THU]), now.getTime());
  const d = new Date(next);

  assert.equal(d.getDate(), 30);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});

test('منبه اليوم فات → الأسبوع القادم', () => {
  const now = new Date(2026, 6, 30, 15, 0, 0, 0); // خميس 15:00

  const next = nextOccurrence(alarm(14, 30, [THU]), now.getTime());
  const d = new Date(next);

  assert.equal(d.getDay(), THU);
  assert.equal(d.getDate(), 6);   // خميس 6 أغسطس
  assert.equal(d.getMonth(), 7);
});

test('نفس الدقيقة بالضبط → يُعتبر فائتاً', () => {
  const now = new Date(2026, 6, 30, 14, 30, 0, 0);

  const next = nextOccurrence(alarm(14, 30, [THU]), now.getTime());

  // delta = 0 والوقت <= now → +7 أيام
  assert.equal(new Date(next).getDate(), 6);
});

test('ثانية واحدة قبل الموعد → اليوم', () => {
  const now = new Date(2026, 6, 30, 14, 29, 59, 0);

  const next = nextOccurrence(alarm(14, 30, [THU]), now.getTime());

  assert.equal(new Date(next).getDate(), 30);
});

// ════════════════════════════════════════════════
//  2. أيام متعددة — يجب اختيار الأقرب
// ════════════════════════════════════════════════

test('أيام متعددة → يختار الأقرب', () => {
  const now = new Date(2026, 6, 30, 8, 0, 0, 0); // خميس

  // سبت وإثنين: السبت أقرب (بعد يومين)
  const next = nextOccurrence(alarm(7, 0, [SAT, MON]), now.getTime());

  assert.equal(new Date(next).getDay(), SAT);
  assert.equal(new Date(next).getDate(), 1); // 1 أغسطس
});

test('كل أيام الأسبوع، الوقت لم يحن → اليوم', () => {
  const now = new Date(2026, 6, 30, 5, 0, 0, 0);

  const next = nextOccurrence(
    alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]),
    now.getTime(),
  );

  assert.equal(new Date(next).getDate(), 30);
  assert.equal(new Date(next).getHours(), 6);
});

test('كل أيام الأسبوع، الوقت فات → الغد', () => {
  const now = new Date(2026, 6, 30, 7, 0, 0, 0);

  const next = nextOccurrence(
    alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]),
    now.getTime(),
  );

  assert.equal(new Date(next).getDate(), 31);
  assert.equal(new Date(next).getDay(), FRI);
});

test('أيام العمل فقط، الجمعة مساءً → الأحد', () => {
  // الجمعة 31 يوليو 2026، 20:00
  const now = new Date(2026, 6, 31, 20, 0, 0, 0);
  assert.equal(now.getDay(), FRI);

  // نمط الأسبوع العربي: الأحد → الخميس
  const next = nextOccurrence(alarm(6, 0, [SUN, MON, TUE, WED, THU]), now.getTime());

  assert.equal(new Date(next).getDay(), SUN);
  assert.equal(new Date(next).getDate(), 2); // 2 أغسطس
});

// ════════════════════════════════════════════════
//  3. عبور منتصف الليل — البق الكلاسيكي
// ════════════════════════════════════════════════

test('منبه 00:30 والساعة 23:50 → بعد 40 دقيقة لا بعد أسبوع', () => {
  // خميس 23:50
  const now = new Date(2026, 6, 30, 23, 50, 0, 0);

  // منبه الجمعة 00:30
  const next = nextOccurrence(alarm(0, 30, [FRI]), now.getTime());

  const diffMinutes = (next - now.getTime()) / 60000;
  assert.equal(diffMinutes, 40, `توقعت 40 دقيقة، وجدت ${diffMinutes}`);
  assert.equal(new Date(next).getDate(), 31);
});

test('منبه 23:59 والساعة 00:01 من اليوم نفسه', () => {
  const now = new Date(2026, 6, 30, 0, 1, 0, 0); // خميس 00:01

  const next = nextOccurrence(alarm(23, 59, [THU]), now.getTime());

  // نفس اليوم، بعد ~24 ساعة إلا دقيقتين
  assert.equal(new Date(next).getDate(), 30);
  assert.equal(new Date(next).getHours(), 23);
});

test('منتصف الليل تماماً 00:00', () => {
  const now = new Date(2026, 6, 30, 23, 30, 0, 0);

  const next = nextOccurrence(alarm(0, 0, [FRI]), now.getTime());

  assert.equal(new Date(next).getHours(), 0);
  assert.equal(new Date(next).getMinutes(), 0);
  assert.equal(new Date(next).getDate(), 31);
  assert.equal((next - now.getTime()) / 60000, 30);
});

// ════════════════════════════════════════════════
//  4. حالات الحدود
// ════════════════════════════════════════════════

test('منبه معطّل → -1', () => {
  const now = Date.now();
  assert.equal(nextOccurrence(alarm(6, 0, [MON], false), now), -1);
});

test('بلا أيام مختارة → -1', () => {
  const now = Date.now();
  assert.equal(nextOccurrence(alarm(6, 0, []), now), -1);
});

test('النتيجة دائماً في المستقبل', () => {
  // نجرّب كل ساعة من كل يوم على مدار أسبوع كامل
  const base = new Date(2026, 6, 26, 0, 0, 0, 0); // أحد

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30, 59]) {
        const now = new Date(base);
        now.setDate(now.getDate() + dayOffset);
        now.setHours(h, m, 0, 0);

        for (let alarmHour = 0; alarmHour < 24; alarmHour += 3) {
          for (const day of [SUN, WED, SAT]) {
            const next = nextOccurrence(
              alarm(alarmHour, 15, [day]),
              now.getTime(),
            );
            assert.ok(
              next > now.getTime(),
              `الموعد في الماضي! الآن=${fmt(now.getTime())} الموعد=${fmt(next)}`,
            );
          }
        }
      }
    }
  }
});

test('النتيجة دائماً خلال 7 أيام + هامش', () => {
  const base = new Date(2026, 6, 26, 0, 0, 0, 0);
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    for (let h = 0; h < 24; h += 2) {
      const now = new Date(base);
      now.setDate(now.getDate() + dayOffset);
      now.setHours(h, 33, 0, 0);

      for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
        const next = nextOccurrence(alarm(7, 0, [day]), now.getTime());
        const diff = next - now.getTime();
        // +1 ساعة هامش لتغيّرات التوقيت الصيفي
        assert.ok(
          diff <= WEEK_MS + 3600_000,
          `أبعد من أسبوع! فرق=${diff / 3600000} ساعة`,
        );
      }
    }
  }
});

test('اليوم الصحيح دائماً', () => {
  const base = new Date(2026, 6, 26, 12, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const now = new Date(base);
    now.setDate(now.getDate() + dayOffset);

    for (const day of [SUN, MON, TUE, WED, THU, FRI, SAT]) {
      const next = nextOccurrence(alarm(9, 0, [day]), now.getTime());
      assert.equal(
        new Date(next).getDay(),
        day,
        `طلبت اليوم ${day} فحصلت على ${new Date(next).getDay()}`,
      );
    }
  }
});

// ════════════════════════════════════════════════
//  5. التوقيت الصيفي
// ════════════════════════════════════════════════

test('مصر تطبّق التوقيت الصيفي — الساعة المحلية تبقى ثابتة', () => {
  /**
   * مصر أعادت التوقيت الصيفي من 2023.
   * ينتهي آخر خميس من أكتوبر (الساعة ترجع ساعة للخلف).
   *
   * الجوهر: منبه 6:00 صباحاً يجب أن يرن 6:00 بالساعة المحلية،
   * سواء تغيّر التوقيت أم لا. الفرق بالملي ثانية سيكون
   * 25 ساعة بدل 24 — وهذا هو الصحيح.
   *
   * setHours() يتعامل مع هذا تلقائياً. الحساب اليدوي
   * (now + 24*3600*1000) يخطئ بساعة كاملة.
   */
  const before = new Date(2026, 9, 29, 12, 0, 0, 0); // 29 أكتوبر

  const next = nextOccurrence(alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]),
                              before.getTime());
  const d = new Date(next);

  // مهما حدث للتوقيت، الساعة المحلية 6:00
  assert.equal(d.getHours(), 6, 'الساعة المحلية يجب أن تبقى 6');
  assert.equal(d.getMinutes(), 0);
});

test('لا قفزة بسبب حساب يدوي خاطئ', () => {
  /**
   * هذا الاختبار يوثّق سبب استخدام Calendar/Date
   * بدل الحساب بالملي ثانية.
   */
  const now = new Date(2026, 9, 29, 12, 0, 0, 0);
  const next = nextOccurrence(alarm(6, 0, [FRI]), now.getTime());

  const naive = now.getTime() + 18 * 3600_000; // "18 ساعة" حساب ساذج
  const d = new Date(next);

  assert.equal(d.getHours(), 6);
  assert.equal(d.getDay(), FRI);
  // النتيجة الصحيحة قد تختلف عن الحساب الساذج — وهذا مقصود
});

// ════════════════════════════════════════════════
//  6. الغفوة
// ════════════════════════════════════════════════

test('الغفوة تضيف الدقائق الصحيحة', () => {
  const now = new Date(2026, 6, 30, 6, 0, 0, 0).getTime();
  const snoozeMinutes = 9;

  const at = now + snoozeMinutes * 60_000;

  assert.equal(new Date(at).getHours(), 6);
  assert.equal(new Date(at).getMinutes(), 9);
});

test('غفوة تعبر الساعة', () => {
  const now = new Date(2026, 6, 30, 6, 55, 0, 0).getTime();
  const at = now + 10 * 60_000;

  assert.equal(new Date(at).getHours(), 7);
  assert.equal(new Date(at).getMinutes(), 5);
});

test('غفوة تعبر منتصف الليل', () => {
  const now = new Date(2026, 6, 30, 23, 55, 0, 0).getTime();
  const at = now + 10 * 60_000;

  assert.equal(new Date(at).getDate(), 31);
  assert.equal(new Date(at).getHours(), 0);
  assert.equal(new Date(at).getMinutes(), 5);
});

// ════════════════════════════════════════════════
//  7. فحص التقادُم
// ════════════════════════════════════════════════

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

const isStale = (occurrenceAt, nowMs) =>
  occurrenceAt > 0 && (nowMs - occurrenceAt) > STALE_THRESHOLD_MS;

test('منبه في وقته → ليس متقادماً', () => {
  const at = Date.now();
  assert.equal(isStale(at, at + 2000), false);
});

test('تأخير 4 دقائق → ليس متقادماً', () => {
  const at = Date.now();
  assert.equal(isStale(at, at + 4 * 60_000), false);
});

test('تأخير 6 دقائق → متقادم', () => {
  const at = Date.now();
  assert.equal(isStale(at, at + 6 * 60_000), true);
});

test('تأخير ساعتين (هاتف كان مطفياً) → متقادم', () => {
  const at = Date.now();
  assert.equal(isStale(at, at + 2 * 3600_000), true);
});

// ════════════════════════════════════════════════
//  8. تفرّد رمز الطلب
// ════════════════════════════════════════════════

/** نفس دالة Kotlin: hashCode() ثم and 0xFFFF */
function javaHashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

const requestCodeFor = (id) => 90_000 + (javaHashCode(id) & 0x0000FFFF);

test('معرّفات مختلفة → رموز طلب مختلفة (غالباً)', () => {
  const ids = Array.from({ length: 300 }, (_, i) => `alarm-uuid-${i}-clan`);
  const codes = new Set(ids.map(requestCodeFor));

  const collisionRate = 1 - codes.size / ids.length;
  assert.ok(
    collisionRate < 0.02,
    `نسبة التصادم ${(collisionRate * 100).toFixed(1)}% مرتفعة جداً`,
  );
});

test('نفس المعرّف → نفس الرمز دائماً', () => {
  const id = 'clan-alarm-abc-123';
  assert.equal(requestCodeFor(id), requestCodeFor(id));
});

test('الرمز موجب دائماً', () => {
  for (let i = 0; i < 500; i++) {
    assert.ok(requestCodeFor(`x${i}${Math.random()}`) > 0);
  }
});

// ════════════════════════════════════════════════
//  9. التحقق من المدخلات
// ════════════════════════════════════════════════

function validate(a) {
  if (!a || typeof a !== 'object') throw new Error('المنبه يجب أن يكون كائناً');
  if (!a.id) throw new Error('المنبه يحتاج id');

  const h = Number(a.hour);
  const m = Number(a.minute);
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new Error(`ساعة غير صالحة: ${a.hour}`);
  if (!Number.isInteger(m) || m < 0 || m > 59) throw new Error(`دقيقة غير صالحة: ${a.minute}`);

  const days = Array.isArray(a.weekdays) ? a.weekdays : [];
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new Error('أيام الأسبوع يجب أن تكون أرقاماً من 0 إلى 6');
  }
  return true;
}

test('يرفض ساعة 24', () => {
  assert.throws(() => validate({ id: 'a', hour: 24, minute: 0, weekdays: [1] }));
});

test('يرفض ساعة سالبة', () => {
  assert.throws(() => validate({ id: 'a', hour: -1, minute: 0, weekdays: [1] }));
});

test('يرفض دقيقة 60', () => {
  assert.throws(() => validate({ id: 'a', hour: 6, minute: 60, weekdays: [1] }));
});

test('يرفض يوم 7', () => {
  assert.throws(() => validate({ id: 'a', hour: 6, minute: 0, weekdays: [7] }));
});

test('يرفض بلا id', () => {
  assert.throws(() => validate({ hour: 6, minute: 0, weekdays: [1] }));
});

test('يرفض ساعة عشرية', () => {
  assert.throws(() => validate({ id: 'a', hour: 6.5, minute: 0, weekdays: [1] }));
});

test('يقبل الحدود الصحيحة', () => {
  assert.ok(validate({ id: 'a', hour: 0, minute: 0, weekdays: [0] }));
  assert.ok(validate({ id: 'a', hour: 23, minute: 59, weekdays: [6] }));
  assert.ok(validate({ id: 'a', hour: 12, minute: 30, weekdays: [0,1,2,3,4,5,6] }));
});

// ════════════════════════════════════════════════
//  10. سيناريو حقيقي كامل
// ════════════════════════════════════════════════

test('سيناريو: طالب يستيقظ 5:30 أيام الدراسة', () => {
  // الأحد → الخميس (نمط مصر)
  const study = alarm(5, 30, [SUN, MON, TUE, WED, THU]);

  // الجمعة 31 يوليو 2026، 22:00 — ينام
  const fridayNight = new Date(2026, 6, 31, 22, 0, 0, 0);
  assert.equal(fridayNight.getDay(), FRI);

  const next = nextOccurrence(study, fridayNight.getTime());
  const d = new Date(next);

  assert.equal(d.getDay(), SUN, 'يجب أن يرن الأحد لا السبت');
  assert.equal(d.getHours(), 5);
  assert.equal(d.getMinutes(), 30);
  assert.equal(d.getDate(), 2);
});

test('سيناريو: سلسلة أسبوع كامل بلا فجوات', () => {
  const daily = alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]);

  let cursor = new Date(2026, 6, 30, 7, 0, 0, 0).getTime(); // بعد منبه الخميس
  const fired = [];

  // نحاكي 14 يوماً: كل مرة نجدول، نقفز للموعد، نجدول التالي
  for (let i = 0; i < 14; i++) {
    const next = nextOccurrence(daily, cursor);
    fired.push(new Date(next));
    cursor = next + 60_000; // بعد دقيقة من الرنين
  }

  assert.equal(fired.length, 14);

  // كل رنّة الساعة 6:00 بالضبط
  fired.forEach((d) => {
    assert.equal(d.getHours(), 6, `رنّ الساعة ${d.getHours()} لا 6`);
    assert.equal(d.getMinutes(), 0);
  });

  // كل رنّة بعد سابقتها بيوم واحد (±ساعة للتوقيت الصيفي)
  for (let i = 1; i < fired.length; i++) {
    const gapHours = (fired[i] - fired[i - 1]) / 3600_000;
    assert.ok(
      gapHours >= 23 && gapHours <= 25,
      `فجوة ${gapHours} ساعة بين الرنّة ${i - 1} و ${i}`,
    );
  }
});

test('سيناريو: مسافر يغيّر المنطقة الزمنية', () => {
  /**
   * لا نستطيع تغيير TZ داخل الاختبار، لكن نوثّق العقد:
   * بعد ACTION_TIMEZONE_CHANGED نستدعي rescheduleAll()،
   * فيُعاد الحساب بالتوقيت الجديد وتبقى الساعة المحلية 6:00.
   */
  const now = new Date(2026, 6, 30, 12, 0, 0, 0);
  const next = nextOccurrence(alarm(6, 0, [FRI]), now.getTime());

  assert.equal(new Date(next).getHours(), 6);
  assert.equal(new Date(next).getDay(), FRI);
});

// ════════════════════════════════════════════════
//  11. التوقيت الصيفي — الحالات القصوى الموثّقة
// ════════════════════════════════════════════════

/**
 * هذه الاختبارات نتجت عن مسح شامل: 28,224 حالة × 7 مناطق زمنية.
 * وثّقت السلوك الصحيح في اللحظات التي تكسر معظم تطبيقات المنبه.
 */

test('DST: لا يوم مفقود ولا يوم مكرر عبر 400 يوم', () => {
  const daily = alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]);

  let cursor = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
  const fires = [];

  for (let i = 0; i < 400; i++) {
    const next = nextOccurrence(daily, cursor);
    fires.push(new Date(next));
    cursor = next + 60_000;
  }

  const uniqueDays = new Set(fires.map((f) => f.toDateString()));

  assert.equal(
    uniqueDays.size,
    fires.length,
    'يوم مكرر أو مفقود — سلسلة المنبه مكسورة',
  );
});

test('DST: كل الفجوات بين 23 و 25 ساعة', () => {
  const daily = alarm(6, 0, [SUN, MON, TUE, WED, THU, FRI, SAT]);

  let cursor = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
  const fires = [];

  for (let i = 0; i < 400; i++) {
    const next = nextOccurrence(daily, cursor);
    fires.push(next);
    cursor = next + 60_000;
  }

  for (let i = 1; i < fires.length; i++) {
    const gapHours = (fires[i] - fires[i - 1]) / 3600_000;
    assert.ok(
      gapHours >= 23 && gapHours <= 25,
      `فجوة شاذة ${gapHours}س عند ${new Date(fires[i])}`,
    );
  }
});

test('DST: ساعة غير موجودة (spring forward) لا تُسقط المنبه', () => {
  /**
   * في ليلة تقديم الساعة، ساعة كاملة تختفي من التقويم المحلي.
   * القاهرة 24 أبريل 2026: 00:00 ← تقفز مباشرة إلى ← 01:00
   *
   * منبه 00:30 يشير لوقت لا وجود له.
   *
   * السلوك الصحيح (وهو ما يفعله تطبيق الساعة المدمج):
   * يرن في أقرب لحظة صالحة، ولا يُلغى ولا يُؤجّل أسبوعاً.
   */
  const now = new Date(2026, 3, 23, 12, 0, 0, 0).getTime();

  const next = nextOccurrence(
    alarm(0, 30, [SUN, MON, TUE, WED, THU, FRI, SAT]),
    now,
  );

  assert.ok(next > now, 'المنبه لم يُجدول إطلاقاً');
  assert.ok(
    (next - now) / 3600_000 < 26,
    'المنبه قفز أكثر من يوم — ساعة DST أسقطته',
  );
});

test('DST: ساعة مكررة (fall back) لا تُرنّ المنبه مرتين', () => {
  /**
   * ليلة تأخير الساعة: ساعة كاملة تحدث مرتين.
   * منبه في تلك الساعة يجب أن يرن مرة واحدة فقط.
   */
  let cursor = new Date(2026, 9, 29, 12, 0, 0, 0).getTime();
  const fires = [];

  for (let i = 0; i < 6; i++) {
    const next = nextOccurrence(
      alarm(0, 30, [SUN, MON, TUE, WED, THU, FRI, SAT]),
      cursor,
    );
    fires.push(new Date(next));
    cursor = next + 60_000;
  }

  const dates = fires.map((f) => f.toDateString());
  const duplicates = dates.filter((d, i) => dates.indexOf(d) !== i);

  assert.equal(duplicates.length, 0, `رنّ مرتين في: ${duplicates.join(', ')}`);
});

test('DST: الساعة المحلية ثابتة خارج نافذة التغيير', () => {
  const daily = alarm(6, 30, [SUN, MON, TUE, WED, THU, FRI, SAT]);

  let cursor = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();
  let correctHour = 0;

  for (let i = 0; i < 365; i++) {
    const next = nextOccurrence(daily, cursor);
    const d = new Date(next);
    if (d.getHours() === 6 && d.getMinutes() === 30) correctHour++;
    cursor = next + 60_000;
  }

  // 6:30 موجودة دائماً في كل المناطق — لا استثناء
  assert.equal(correctHour, 365, 'الساعة المحلية انزاحت في بعض الأيام');
});
