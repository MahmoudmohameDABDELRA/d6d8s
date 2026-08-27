/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار صياغة الوقت العربي
 *
 *  ️ الحالة الحرجة اللي بيحرسها:
 *
 *  رسالة الساعة ١١:٥٠ بالليل ورسالة ١٢:١٠ بعد نص الليل بينهم
 *  **٢٠ دقيقة** — بس واحدة «امبارح» والتانية «النهاردة».
 *
 *  الحساب البديهي (فرق بالساعات) بيقول «النهاردة» على الاتنين،
 *  والمستخدم بيشوف رسالتين تحت فاصل واحد وهما في يومين. الحل
 *  المقارنة بالتاريخ نفسه مش بالفرق.
 *
 *  وكمان بيحرس جمع العربي: «من ٢ دقايق» غلط و«من ٥ دقيقة» غلط.
 *
 *  ️ الكود Dart ومفيش SDK هنا، فبنترجم الدالتين لـ JS ترجمة
 *    نصية ضيقة — نفس أسلوب `focus-cycle-parity`.
 *
 *  التشغيل:  node --test test/time-ago.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DART = resolve(HERE, '../bal_app/lib/core/time_ago.dart');

const src = readFileSync(DART, 'utf8');

// ════════════════════════════════════════════════
//  نسخة JS من نفس المنطق
// ════════════════════════════════════════════════

const WEEKDAYS = [
  'الاتنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الحد',
];

const clock = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`;

/** ️ Dart: الاتنين = 1 … الأحد = 7. JS: الأحد = 0 … السبت = 6 */
const dartWeekday = (d) => (d.getDay() === 0 ? 7 : d.getDay());

const forList = (at, now) => {
  if (!at) return '';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const diff = Math.round((today - day) / 86_400_000);

  if (diff === 0) return clock(at);
  if (diff === 1) return 'امبارح';
  if (diff < 7) return WEEKDAYS[dartWeekday(at) - 1];

  if (at.getFullYear() === now.getFullYear()) {
    return `${at.getDate()}/${at.getMonth() + 1}`;
  }
  return `${at.getDate()}/${at.getMonth() + 1}/${at.getFullYear()}`;
};

const plural = (n, single, pl) => (n >= 3 && n <= 10 ? pl : single);

const relative = (at, now) => {
  const seconds = Math.floor((now - at) / 1000);
  if (seconds < 60) return 'دلوقتي';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `من ${minutes} ${plural(minutes, 'دقيقة', 'دقايق')}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `من ${hours} ${plural(hours, 'ساعة', 'ساعات')}`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'امبارح';
  if (days < 7) return `من ${days} ${plural(days, 'يوم', 'أيام')}`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `من ${weeks} ${plural(weeks, 'أسبوع', 'أسابيع')}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `من ${months} ${plural(months, 'شهر', 'شهور')}`;

  const years = Math.floor(days / 365);
  return `من ${years} ${plural(years, 'سنة', 'سنين')}`;
};

// ════════════════════════════════════════════════
//  ١. الحالة الحرجة: نص الليل
// ════════════════════════════════════════════════

test('٢٠ دقيقة حوالين نص الليل = يومين مختلفين', () => {
  const now = new Date(2026, 7, 27, 9, 0);

  const beforeMidnight = new Date(2026, 7, 26, 23, 50);
  const afterMidnight = new Date(2026, 7, 27, 0, 10);

  //  الفرق بينهم ٢٠ دقيقة بس
  assert.equal((afterMidnight - beforeMidnight) / 60_000, 20);

  assert.equal(forList(beforeMidnight, now), 'امبارح');
  assert.equal(forList(afterMidnight, now), '00:10');
});

test('نفس اليوم بفرق ٢٣ ساعة لسه «النهاردة»', () => {
  const now = new Date(2026, 7, 27, 23, 59);
  const early = new Date(2026, 7, 27, 0, 1);

  /**
   * ️ الفرق ٢٣ ساعة و٥٨ دقيقة — الحساب بالساعات كان هيقول
   *    «امبارح». التاريخ واحد، فالصح «النهاردة» (الساعة).
   */
  assert.equal(forList(early, now), '00:01');
});

// ════════════════════════════════════════════════
//  ٢. سلّم القايمة
// ════════════════════════════════════════════════

test('سلّم قايمة المحادثات', () => {
  //  الخميس ٢٧ أغسطس ٢٠٢٦
  const now = new Date(2026, 7, 27, 15, 0);

  const cases = [
    [new Date(2026, 7, 27, 14, 32), '14:32', 'النهاردة → ساعة'],
    [new Date(2026, 7, 27, 9, 5), '09:05', 'صفر بادئ'],
    [new Date(2026, 7, 26, 20, 0), 'امبارح', 'امبارح'],
    [new Date(2026, 7, 24, 10, 0), 'الاتنين', 'الأسبوع ده → اسم اليوم'],
    [new Date(2026, 7, 12, 10, 0), '12/8', 'أقدم → تاريخ'],
    [new Date(2025, 11, 25, 10, 0), '25/12/2025', 'سنة تانية → بالسنة'],
  ];

  for (const [at, expected, label] of cases) {
    assert.equal(forList(at, now), expected, label);
  }
});

test('كل أيام الأسبوع بأسماء صحيحة', () => {
  /**
   * ️ الفهرسة سهل تغلط فيها: Dart بيرقّم الاتنين = 1 والأحد = 7،
   *    وJS بيرقّم الأحد = 0. خطأ واحد في الإزاحة بيخلي كل يوم
   *    يعرض باسم اليوم اللي قبله.
   */
  const now = new Date(2026, 7, 30, 12, 0); // الأحد

  /**
   * ️ يوم ٢٩ = امبارح بالنسبة ليوم ٣٠، فبياخد «امبارح» مش
   *    «السبت». ده **صح**: التطبيقات كلها بتفضّل «امبارح» على
   *    اسم اليوم لأنها أوضح. توقّعي الأول كان غلط والاختبار
   *    مسكه — سبت التوقّع الصح هنا كتوثيق.
   */
  const expected = {
    24: 'الاتنين',
    25: 'الثلاثاء',
    26: 'الأربعاء',
    27: 'الخميس',
    28: 'الجمعة',
    29: 'امبارح',
  };

  for (const [day, name] of Object.entries(expected)) {
    const at = new Date(2026, 7, Number(day), 12, 0);
    assert.equal(forList(at, now), name, `يوم ${day}`);
  }
});

// ════════════════════════════════════════════════
//  ٣. جمع العربي
// ════════════════════════════════════════════════

test('الجمع العربي: ٣-١٠ جمع، غير كده مفرد', () => {
  const now = new Date(2026, 7, 27, 12, 0);

  const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000);

  assert.equal(relative(at(2), now), 'من 2 دقيقة', 'اتنين → مفرد');
  assert.equal(relative(at(5), now), 'من 5 دقايق', 'خمسة → جمع');
  assert.equal(relative(at(10), now), 'من 10 دقايق', 'عشرة → جمع');
  assert.equal(relative(at(15), now), 'من 15 دقيقة', 'فوق العشرة → مفرد');
  assert.equal(relative(at(45), now), 'من 45 دقيقة');
});

test('سلّم الوقت النسبي', () => {
  const now = new Date(2026, 7, 27, 12, 0);
  const ago = (ms) => new Date(now.getTime() - ms);

  assert.equal(relative(ago(30_000), now), 'دلوقتي', 'أقل من دقيقة');
  assert.equal(relative(ago(3600_000), now), 'من 1 ساعة');
  assert.equal(relative(ago(5 * 3600_000), now), 'من 5 ساعات');
  assert.equal(relative(ago(24 * 3600_000), now), 'امبارح');
  assert.equal(relative(ago(4 * 24 * 3600_000), now), 'من 4 أيام');
  assert.equal(relative(ago(14 * 24 * 3600_000), now), 'من 2 أسبوع');
  assert.equal(relative(ago(60 * 24 * 3600_000), now), 'من 2 شهر');
});

test('الوقت في المستقبل مبيكسرش حاجة', () => {
  /**
   * ️ بيحصل فعلاً: ساعة الجهاز متأخرة عن السيرفر بثواني،
   *    فالرسالة اللي لسه واصلة تاريخها «في المستقبل». من غير
   *    الحارس ده كنا هنعرض «من -1 دقيقة».
   */
  const now = new Date(2026, 7, 27, 12, 0);
  const future = new Date(now.getTime() + 30_000);

  assert.equal(relative(future, now), 'دلوقتي');
});

// ════════════════════════════════════════════════
//  ٤. الكود مربوط فعلاً في الشاشتين
// ════════════════════════════════════════════════

test('الملف فيه الدالتين', () => {
  assert.match(src, /static String forList\(/);
  assert.match(src, /static String relative\(/);

  //  حارس ضد الرجوع لحساب الفرق بالساعات
  assert.match(src, /today\.difference\(day\)\.inDays/);
});

test('قايمة المحادثات بتعرض وقت آخر رسالة', () => {
  const chat = readFileSync(
    resolve(HERE, '../bal_app/lib/screens/chat/chat_screen.dart'),
    'utf8',
  );

  assert.match(chat, /TimeAgo\.forList\(conv\.lastMessageAt\)/);
});

test('المحادثة فيها فواصل تاريخ', () => {
  const conv = readFileSync(
    resolve(HERE, '../bal_app/lib/screens/chat/conversation_screen.dart'),
    'utf8',
  );

  assert.match(conv, /_needsDateDivider/, 'مفيش فاصل تاريخ');
  assert.match(conv, /_dateDivider/);

  /** الفاصل لازم يقارن بالتاريخ مش بالفرق */
  assert.match(conv, /a\.year != b\.year \|\| a\.month != b\.month/);
});
