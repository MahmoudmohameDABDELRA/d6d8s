/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار استنتاج المنطقة الزمنية
 *
 *  ️ الباج اللي بيحرسه — وده أهم جزء:
 *
 *  الحل «البديهي» للثغرة (كل المستخدمين على القاهرة) كان:
 *  «ابعت `DateTime.now().timeZoneName` من التطبيق». الحل ده
 *  **بيكسر التطبيق أكتر**، لأن Dart بيرجّع اختصار أو اسم ويندوز،
 *  و`Intl` في السيرفر بيرمي RangeError عليهم:
 *
 *      localDate('India Standard Time')   → RangeError ❌
 *      localDate('Eastern Standard Time') → RangeError ❌
 *
 *  الاختبار ده بيتأكد إن:
 *    ١. المنطقة اللي بنحفظها **دايماً** يقبلها Intl (مفيش 500).
 *    ٢. الاستنتاج من الأوفست بيدي نفس اليوم المحلي بالظبط
 *       زي المنطقة الحقيقية — الاسم ممكن يختلف، الحساب لأ.
 *
 *  التشغيل:  node --test test/timezone.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isValidTimezone,
  resolveTimezone,
  zoneForOffsets,
} from '../src/utils/timezone.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** نسخة من localDate في streak.service — بلا Prisma */
const localDate = (timezone, now) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

/** أوفست منطقة بالدقايق في لحظة */
const offsetOf = (timeZone, at) => {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName').value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
};

const YEAR = new Date().getUTCFullYear();
const JAN = new Date(Date.UTC(YEAR, 0, 15));
const JUL = new Date(Date.UTC(YEAR, 6, 15));

/** ما بيرجّعه التطبيق لمستخدم في منطقة معيّنة */
const payloadFor = (zone) => ({
  utcOffsetMinutes: offsetOf(zone, new Date()),
  januaryOffsetMinutes: offsetOf(zone, JAN),
  julyOffsetMinutes: offsetOf(zone, JUL),
});

// ════════════════════════════════════════════════
//  ١. الأسماء الغلط اللي كانت هتكسر السيرفر
// ════════════════════════════════════════════════

test('الأسماء اللي Dart بيرجّعها فعلاً مرفوضة كـ IANA', () => {
  // دي القيم الحقيقية من DateTime.now().timeZoneName على منصات مختلفة
  assert.equal(isValidTimezone('India Standard Time'), false);
  assert.equal(isValidTimezone('Eastern Standard Time'), false);
  assert.equal(isValidTimezone('W. Europe Standard Time'), false);
  assert.equal(isValidTimezone('EEST'), false);
  assert.equal(isValidTimezone(''), false);
  assert.equal(isValidTimezone(null), false);
});

test('الأسماء الصحيحة مقبولة', () => {
  for (const z of ['Africa/Cairo', 'Asia/Tokyo', 'America/New_York', 'UTC']) {
    assert.equal(isValidTimezone(z), true, z);
  }
});

test('اسم ويندوز مع الأوفست → منطقة صحيحة مش انفجار', () => {
  // الهند: +05:30 صيفاً وشتاءً
  const { timezone, source } = resolveTimezone({
    timezone: 'India Standard Time',
    ...payloadFor('Asia/Kolkata'),
  });

  assert.equal(source, 'offset', 'المفروض يتجاهل اسم ويندوز ويستنتج');
  assert.ok(isValidTimezone(timezone), `${timezone} مش صالحة لـ Intl`);
  assert.doesNotThrow(() => localDate(timezone, new Date()));
});

// ════════════════════════════════════════════════
//  ٢. الاستنتاج بيدي نفس اليوم المحلي
// ════════════════════════════════════════════════

const CITIES = [
  'Africa/Cairo',
  'Asia/Tokyo',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Asia/Kolkata', // نص ساعة
  'Asia/Kathmandu', // ربع ساعة
  'Australia/Sydney', // صيفي معكوس
  'America/Sao_Paulo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Pacific/Auckland',
];

test('المنطقة المستنتَجة = نفس اليوم المحلي في كل ساعات السنة', () => {
  const failures = [];

  for (const city of CITIES) {
    const { timezone: guessed, source } = resolveTimezone(payloadFor(city));

    if (source === 'default') {
      failures.push(`${city}: مفيش استنتاج خالص`);
      continue;
    }

    // نقارن اليوم المحلي كل ٣ ساعات على مدار سنة كاملة
    for (let h = 0; h < 365 * 24; h += 3) {
      const at = new Date(Date.UTC(YEAR, 0, 1, h));
      const real = localDate(city, at);
      const got = localDate(guessed, at);
      if (real !== got) {
        failures.push(
          `${city} → ${guessed} @ ${at.toISOString()}: ${real} ≠ ${got}`,
        );
        break;
      }
    }
  }

  assert.deepEqual(failures, [], 'اليوم المحلي اختلف');
});

test('الاسم الصحيح له الأولوية على الاستنتاج', () => {
  const { timezone, source } = resolveTimezone({
    timezone: 'Asia/Tokyo',
    ...payloadFor('Asia/Tokyo'),
  });
  assert.equal(timezone, 'Asia/Tokyo');
  assert.equal(source, 'iana');
});

test('أوفست الحاضر لوحده كفاية (لو التطبيق قديم)', () => {
  const { timezone, source } = resolveTimezone({
    utcOffsetMinutes: offsetOf('Asia/Tokyo', new Date()),
  });
  assert.notEqual(source, 'default');
  assert.ok(isValidTimezone(timezone));
  assert.equal(
    localDate(timezone, new Date()),
    localDate('Asia/Tokyo', new Date()),
  );
});

test('مفيش أي معلومة → القاهرة، بلا انفجار', () => {
  const { timezone, source } = resolveTimezone({});
  assert.equal(source, 'default');
  assert.equal(timezone, 'Africa/Cairo');
});

test('قيم بايظة مبتكسرش حاجة', () => {
  for (const bad of [
    { utcOffsetMinutes: NaN },
    { utcOffsetMinutes: 'abc' },
    { utcOffsetMinutes: 99999 },
    { timezone: 12345 },
    undefined,
  ]) {
    const out = resolveTimezone(bad);
    assert.ok(isValidTimezone(out.timezone), JSON.stringify(bad));
  }
});

test('zoneForOffsets بيرجّع null لأوفست مستحيل', () => {
  assert.equal(zoneForOffsets(9999, 9999), null);
});

// ════════════════════════════════════════════════
//  ٣. الطرف التاني: التطبيق بيبعت فعلاً
// ════════════════════════════════════════════════

test('التطبيق بيبعت المنطقة في التسجيل والأونبوردنج', () => {
  const src = readFileSync(
    resolve(HERE, '../bal_app/lib/core/app_state.dart'),
    'utf8',
  );

  const uses = [...src.matchAll(/DeviceTimezone\.payload\(\)/g)].length;
  assert.ok(uses >= 2, `${uses} استخدام بس — التسجيل والأونبوردنج محتاجينها`);
  assert.match(src, /import 'device_timezone\.dart'/);
});

test('DeviceTimezone بيبعت الأوفست مش الاسم لوحده', () => {
  const src = readFileSync(
    resolve(HERE, '../bal_app/lib/core/device_timezone.dart'),
    'utf8',
  );

  assert.match(src, /utcOffsetMinutes/);
  assert.match(src, /januaryOffsetMinutes/);
  assert.match(src, /julyOffsetMinutes/);
  // الاسم بيتبعت بشرط — مش على طول
  assert.match(src, /_looksLikeIana/);
});

test('السيرفر مش بياخد timezone الخام من الطلب', () => {
  const src = readFileSync(
    resolve(HERE, '../src/modules/auth/auth.controller.js'),
    'utf8',
  );

  assert.match(src, /timezoneFrom/, 'لازم يعدّي على المُحقِّق');
  assert.doesNotMatch(
    src,
    /const \{[^}]*\btimezone\b[^}]*\} = req\.body/,
    'الأخذ المباشر من req.body هو الباج نفسه',
  );
});
