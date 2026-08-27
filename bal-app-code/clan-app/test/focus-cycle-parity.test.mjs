/**
 * ═══════════════════════════════════════════════════════════
 *  تطابق حساب دورة التركيز بين السيرفر والتطبيق
 *
 *  ️ المشكلة اللي بيحلها:
 *
 *  الجلسة الجارية بتتحسب في مكانين — `src/utils/focusCycle.js`
 *  في السيرفر و`bal_app/.../focus_cycle.dart` في التطبيق. لازم
 *  يكونوا متطابقين تماماً، وإلا المستخدم يشوف «راحة» والسيرفر
 *  شايفه في «تركيز».
 *
 *  مفيش Dart SDK هنا، فبنترجم كود Dart لـ JS **آلياً** (ترجمة
 *  نصية بسيطة على الدالة الحسابية بس) وبنشغّل النسختين على كل
 *  ثانية في جلسات كتيرة ونقارن. الترجمة مش كاملة — هي كفاية
 *  للحساب الرياضي، وده اللي بنقارنه.
 *
 *  ️ وكمان بيحرس باج حقيقي كان في السيرفر:
 *     `elapsed % totalNoFinalRest` كان بيلفّ من الأول بعد ما
 *     الجلسة تخلص — يعني بعد ٩٠ دقيقة كان بيقول «تركيز، دورة ١».
 *
 *  التشغيل:  node --test test/focus-cycle-parity.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { phaseAt, totalSeconds } from '../src/utils/focusCycle.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DART = resolve(HERE, '../bal_app/lib/screens/focus/focus_cycle.dart');

// ════════════════════════════════════════════════
//  ترجمة دالة Dart لـ JS
// ════════════════════════════════════════════════

/**
 * بناخد جسم `FocusCycle.at` من ملف Dart ونحوّله لدالة JS.
 * الترجمة مقصود إنها ضيقة: `~/` → قسمة صحيحة، وبناء
 * `FocusPhaseState` → كائن عادي. أي حاجة تانية في الملف
 * مش بتتلمس.
 */
const dartAt = (() => {
  const src = readFileSync(DART, 'utf8');

  const sig = src.indexOf('static FocusPhaseState at({');
  assert.ok(sig > 0, 'مالقيناش FocusCycle.at في ملف Dart');

  /**
   * ️ Dart بيكتب الباراميترات المسمّاة بين `{}` كمان:
   *      static FocusPhaseState at({ required ... }) {
   *   فأول `{` بعد الاسم هو قوس الباراميترات مش جسم الدالة.
   *   لازم نعدّي على `}) {` الأول.
   */
  const start = src.indexOf('}) {', sig);
  assert.ok(start > sig, 'مالقيناش بداية جسم الدالة');

  let depth = 0;
  let i = src.indexOf('{', start + 2);
  let end = -1;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > 0, 'قفلة الدالة مش متوازنة');

  let body = src.slice(src.indexOf("{", start + 2) + 1, end);

  body = body
    // التعليقات
    .replace(/\/\/[^\n]*/g, '')
    // Duration(seconds: X) → X
    .replace(/Duration\(seconds:\s*([^)]+)\)/g, '($1)')
    .replace(/Duration\.zero/g, '0')
    // القسمة الصحيحة في Dart
    .replace(/(\S+)\s*~\/\s*(\S+)/g, 'Math.floor($1 / $2)')
    // البناء
    .replace(/return\s+FocusPhaseState\(/g, 'return ({')
    .replace(/phase:\s*FocusPhase\.(\w+)/g, "name: '$1'")
    .replace(/(\w+):\s*/g, '$1: ')
    .replace(/\);/g, '});')
    // المدخلات
    .replace(/elapsed\.inSeconds/g, 'elapsedSec')
    // `final x =` في Dart = `const x =` في JS
    .replace(/\bfinal\s+(\w+)\s*=/g, 'const $1 =');

  // eslint-disable-next-line no-new-func
  return new Function(
    'elapsedSec',
    'focusMin',
    'restMin',
    'cycles',
    `${body}\n throw new Error('مفيش return');`,
  );
})();

const dartPhase = ({ elapsedSec, focusMin, restMin, cycles }) => {
  const r = dartAt(elapsedSec, focusMin, restMin, cycles);
  return {
    name: r.name.toUpperCase(),
    cycleNumber: r.cycleNumber,
    remainingSec: r.remaining,
    phaseTotalSec: r.phaseTotal,
    totalRemainingSec: r.totalRemaining,
  };
};

// ════════════════════════════════════════════════
//  ١. التطابق ثانية بثانية
// ════════════════════════════════════════════════

const SHAPES = [
  { focusMin: 25, restMin: 5, cycles: 3 }, // الافتراضي
  { focusMin: 50, restMin: 10, cycles: 2 },
  { focusMin: 5, restMin: 1, cycles: 8 }, // دورات قصيرة كتير
  { focusMin: 90, restMin: 0, cycles: 1 }, // بلا راحة أصلاً
  { focusMin: 15, restMin: 3, cycles: 1 }, // دورة واحدة
  { focusMin: 45, restMin: 10, cycles: 4 },
];

test('السيرفر والتطبيق بيوصلوا لنفس الطور في كل ثانية', () => {
  const mismatches = [];

  for (const shape of SHAPES) {
    const total = totalSeconds(shape);
    // نتخطى الجلسة كلها + دقيقتين بعد الخلاص
    for (let t = 0; t <= total + 120; t += 1) {
      const js = phaseAt({ elapsedSec: t, ...shape });
      const dart = dartPhase({ elapsedSec: t, ...shape });

      if (
        js.name !== dart.name ||
        js.cycleNumber !== dart.cycleNumber ||
        js.remainingSec !== dart.remainingSec ||
        js.totalRemainingSec !== dart.totalRemainingSec
      ) {
        mismatches.push(
          `${JSON.stringify(shape)} @${t}s: ` +
            `سيرفر=${js.name}/${js.cycleNumber}/${js.remainingSec} ` +
            `تطبيق=${dart.name}/${dart.cycleNumber}/${dart.remainingSec}`,
        );
        if (mismatches.length > 4) break;
      }
    }
  }

  assert.deepEqual(mismatches, [], 'النسختين اختلفوا');
});

// ════════════════════════════════════════════════
//  ٢. الباج القديم: اللفّ بعد الخلاص
// ════════════════════════════════════════════════

test('بعد ما الجلسة تخلص الطور DONE مش بيلفّ من الأول', () => {
  const shape = { focusMin: 25, restMin: 5, cycles: 3 };
  const total = totalSeconds(shape); // 85 دقيقة

  //  النسخة القديمة كانت بتعمل % فترجع «FOCUS دورة 1»
  const after = phaseAt({ elapsedSec: total + 60, ...shape });
  assert.equal(after.name, 'DONE');
  assert.equal(after.remainingSec, 0);
  assert.equal(after.totalRemainingSec, 0);

  const wayAfter = phaseAt({ elapsedSec: total * 5, ...shape });
  assert.equal(wayAfter.name, 'DONE', 'حتى بعد 5 أضعاف المدة');
});

// ════════════════════════════════════════════════
//  ٣. شكل الدورة نفسه
// ════════════════════════════════════════════════

test('آخر دورة بلا راحة', () => {
  const shape = { focusMin: 25, restMin: 5, cycles: 3 };

  //  25+5+25+5+25 = 85، مش 3×30 = 90
  assert.equal(totalSeconds(shape), 85 * 60);

  // اللحظة 84:59 لازم تكون تركيز في الدورة التالتة
  const last = phaseAt({ elapsedSec: 84 * 60 + 59, ...shape });
  assert.equal(last.name, 'FOCUS');
  assert.equal(last.cycleNumber, 3);
});

test('حدود الأطوار بالظبط', () => {
  const shape = { focusMin: 25, restMin: 5, cycles: 3 };

  const boundaries = [
    [0, 'FOCUS', 1],
    [25 * 60 - 1, 'FOCUS', 1],
    [25 * 60, 'REST', 1], // أول ثانية راحة
    [30 * 60 - 1, 'REST', 1],
    [30 * 60, 'FOCUS', 2], // أول ثانية دورة تانية
    [55 * 60, 'REST', 2],
    [60 * 60, 'FOCUS', 3],
    [85 * 60, 'DONE', 3],
  ];

  for (const [t, name, cycle] of boundaries) {
    const got = phaseAt({ elapsedSec: t, ...shape });
    assert.equal(got.name, name, `@${t}s الطور`);
    assert.equal(got.cycleNumber, cycle, `@${t}s الدورة`);
  }
});

test('قيم بايظة مبتكسرش', () => {
  for (const bad of [
    { elapsedSec: -100, focusMin: 25, restMin: 5, cycles: 3 },
    { elapsedSec: 0, focusMin: 0, restMin: 0, cycles: 0 },
    { elapsedSec: 0, focusMin: -5, restMin: -5, cycles: -1 },
  ]) {
    const got = phaseAt(bad);
    assert.ok(['FOCUS', 'REST', 'DONE'].includes(got.name));
    assert.ok(got.remainingSec >= 0);
  }
});

// ════════════════════════════════════════════════
//  ٤. الشاشة بتسأل السيرفر فعلاً
// ════════════════════════════════════════════════

test('شاشة الجلسة بتنادي /focus/active مش بتعد محلياً بس', () => {
  const src = readFileSync(
    resolve(HERE, '../bal_app/lib/screens/focus/focus_setup_screen.dart'),
    'utf8',
  );

  assert.match(src, /ApiEndpoints\.focusActive/, 'مفيش نداء لـ /focus/active');
  assert.match(src, /startedAt/, 'مش بتقرا وقت البداية من السيرفر');
  assert.match(
    src,
    /WidgetsBindingObserver/,
    'مش بتعيد المزامنة لما التطبيق يرجع من الخلفية',
  );
  assert.match(src, /AppLifecycleState\.resumed/);
  assert.match(src, /FocusCycle\.at/, 'مش بتستخدم الحساب المشترك');
});

test('السيرفر بيستخدم نفس الوحدة المشتركة', () => {
  const src = readFileSync(
    resolve(HERE, '../src/modules/focus/focus.controller.js'),
    'utf8',
  );

  assert.match(src, /from '\.\.\/\.\.\/utils\/focusCycle\.js'/);
  assert.match(src, /phaseAt\(\{/, 'مستورد ومش مستخدم');

  /**
   * ️ ندوّر على الباج في **الكود** بس — التعليق اللي بيشرح
   *    الباج القديم فيه نفس الجملة، فلو فحصنا الملف كله
   *    الاختبار بيقع على شرحه لنفسه.
   */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  assert.doesNotMatch(
    code,
    /%\s*totalNoFinalRest/,
    'الباج القديم (اللفّ بعد الخلاص) رجع',
  );
});
