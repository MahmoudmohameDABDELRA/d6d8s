/**
 * ═══════════════════════════════════════════════════════════
 *  فاحص سلامة ملفات Dart — بديل جزئي لـ `flutter analyze`
 *
 *  ⚠️ ليه موجود:
 *     مفيش Flutter SDK في بيئة التطوير دي، فالكود اللي بيتكتب
 *     مش بيتكومبايل. الفاحص ده مش بديل عن المحلل الحقيقي، لكنه
 *     بيمسك أكتر الأخطاء شيوعاً في الكتابة اليدوية:
 *
 *       1. أقواس/أقواس معقوفة غير متوازنة
 *       2. استيراد ملف مش موجود
 *       3. استخدام رمز من ملف مش مستورد
 *       4. TODO/FIXME منسية
 *       5. مسارات API مستخدمة ومش معرّفة في ApiEndpoints
 *
 *  التشغيل:  node test/dart-sanity.mjs
 * ═══════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');

let pass = 0;
let fail = 0;

const ok = (cond, msg) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`  ❌ ${msg}`);
  }
};

/** كل ملفات .dart تحت lib/ */
const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.dart')) out.push(full);
  }
  return out;
};

/** يشيل التعليقات والنصوص عشان ما نعدّش أقواس جواها */
const strip = (src) =>
  src
    // تعليقات الأسطر
    .replace(/\/\/[^\n]*/g, '')
    // تعليقات الكتل
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // نصوص ثلاثية
    .replace(/'''[\s\S]*?'''/g, "''")
    .replace(/"""[\s\S]*?"""/g, '""')
    // نصوص عادية (مع تجاهل الهروب)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""');

const files = walk(LIB);

console.log(`\n═══ فحص ${files.length} ملف Dart ═══\n`);

// ════════════════════════════════════════════════
console.log('1) توازن الأقواس');
for (const file of files) {
  const rel = relative(APP, file);
  const code = strip(readFileSync(file, 'utf8'));

  for (const [open, close, name] of [
    ['{', '}', 'معقوفة'],
    ['(', ')', 'قوس'],
    ['[', ']', 'مربعة'],
  ]) {
    let depth = 0;
    let broke = false;
    for (const ch of code) {
      if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth < 0) {
          broke = true;
          break;
        }
      }
    }
    ok(!broke && depth === 0, `${rel}: أقواس ${name} غير متوازنة (فرق ${depth})`);
  }
}

// ════════════════════════════════════════════════
console.log('2) الاستيرادات موجودة فعلاً');
for (const file of files) {
  const rel = relative(APP, file);
  const src = readFileSync(file, 'utf8');
  const imports = [...src.matchAll(/import\s+'([^']+)'/g)].map((m) => m[1]);

  for (const imp of imports) {
    if (imp.startsWith('package:') || imp.startsWith('dart:')) continue;
    const target = resolve(dirname(file), imp);
    ok(existsSync(target), `${rel}: استيراد ملف مش موجود → ${imp}`);
  }
}

// ════════════════════════════════════════════════
console.log('3) الرموز المستخدمة مستوردة');

/** رمز → الملف اللي بيعرّفه */
const declaredIn = new Map();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(
    /^(?:abstract\s+final\s+|abstract\s+|final\s+|sealed\s+)?(?:class|enum|mixin|extension)\s+(\w+)/gm,
  )) {
    declaredIn.set(m[1], file);
  }
}

for (const file of files) {
  const rel = relative(APP, file);
  const src = readFileSync(file, 'utf8');
  const code = strip(src);

  const imported = new Set([file]);
  for (const m of src.matchAll(/import\s+'([^']+)'/g)) {
    const imp = m[1];
    if (imp.startsWith('package:') || imp.startsWith('dart:')) continue;
    imported.add(resolve(dirname(file), imp));
  }

  for (const [symbol, owner] of declaredIn) {
    // الرموز اللي بتبدأ بـ _ خاصة بملفها
    if (symbol.startsWith('_')) continue;
    if (owner === file) continue;

    const used = new RegExp(`\\b${symbol}\\b`).test(code);
    if (used && !imported.has(owner)) {
      fail += 1;
      console.log(
        `  ❌ ${rel}: بيستخدم «${symbol}» بلا استيراد ← ${relative(APP, owner)}`,
      );
    }
  }
}
pass += 1; // القسم عدّى

// ════════════════════════════════════════════════
console.log('3ب) رموز حزم Flutter من مكتبتها الصح');

/**
 * ️ الفجوة اللي القسم ده بيقفلها:
 *
 *  القسم اللي فوق بيفحص الملفات **المحلية** بس. رموز Flutter
 *  نفسها (`Ticker`, `Timer`, `HapticFeedback`) كانت بتعدّي بلا
 *  فحص، رغم إن أغلبها **مش** في `material.dart`.
 *
 *  ده اتمسك فعلاً: `snake_game_screen.dart` كان بيستخدم `Ticker`
 *  ومستورد `material.dart` بس — والملف مكانش هيتكومبايل، والفاحص
 *  كان بيقول ٣٤١/٣٤١ نجح.
 *
 *  الرموز دي مش كتيرة، فقايمة صريحة أدق من أي استنتاج.
 */
const PACKAGE_SYMBOLS = {
  Ticker: ['package:flutter/scheduler.dart'],
  TickerProvider: ['package:flutter/scheduler.dart', 'package:flutter/material.dart'],
  SchedulerBinding: ['package:flutter/scheduler.dart'],
  Timer: ['dart:async'],
  StreamController: ['dart:async'],
  StreamSubscription: ['dart:async'],
  Completer: ['dart:async'],
  unawaited: ['dart:async'],
  HapticFeedback: ['package:flutter/services.dart', 'package:flutter/material.dart'],
  SystemChrome: ['package:flutter/services.dart'],
  Clipboard: ['package:flutter/services.dart', 'package:flutter/material.dart'],
  TextInputFormatter: ['package:flutter/services.dart'],
  jsonEncode: ['dart:convert'],
  jsonDecode: ['dart:convert'],
  debugPrint: ['package:flutter/foundation.dart', 'package:flutter/material.dart'],
  kIsWeb: ['package:flutter/foundation.dart'],
  defaultTargetPlatform: ['package:flutter/foundation.dart'],
  ChangeNotifier: ['package:flutter/foundation.dart', 'package:flutter/material.dart'],
};

for (const file of files) {
  const rel = relative(APP, file);
  const src = readFileSync(file, 'utf8');
  const code = strip(src);

  const imports = [...src.matchAll(/import\s+'([^']+)'/g)].map((m) => m[1]);

  for (const [symbol, sources] of Object.entries(PACKAGE_SYMBOLS)) {
    if (!new RegExp(`\\b${symbol}\\b`).test(code)) continue;

    const covered = sources.some((want) =>
      imports.some((imp) => imp === want || imp.startsWith(`${want} `)),
    );

    if (!covered) {
      fail += 1;
      console.log(
        `  ❌ ${rel}: «${symbol}» محتاج ${sources[0]}`,
      );
    }
  }
}
pass += 1;

// ════════════════════════════════════════════════
console.log('4) مفيش TODO/FIXME منسية في الكود الجديد');
const NEW_FILES = [
  'lib/core/checkin/checkin_watcher.dart',
  'lib/core/checkin/checkin_phrases.dart',
  'lib/widgets/checkin_dialog.dart',
  'lib/shell/main_shell.dart',
];
for (const rel of NEW_FILES) {
  const full = join(APP, rel);
  if (!existsSync(full)) {
    fail += 1;
    console.log(`  ❌ ملف ناقص: ${rel}`);
    continue;
  }
  const src = readFileSync(full, 'utf8');
  ok(!/TODO|FIXME|XXX/.test(src), `${rel}: فيه TODO/FIXME`);
}

// ════════════════════════════════════════════════
console.log('5) مسارات الـ API معرّفة في ApiEndpoints');
const endpointsSrc = readFileSync(
  join(LIB, 'core/network/api_endpoints.dart'),
  'utf8',
);
for (const name of [
  'notifications',
  'notificationReply',
  'notificationThread',
  'checkinOpen',
]) {
  ok(
    new RegExp(`\\b${name}\\b`).test(endpointsSrc),
    `ApiEndpoints ناقصها «${name}»`,
  );
}

// ════════════════════════════════════════════════
console.log('6) بنك الأسئلة: تنوّع كافٍ وبلا تكرار');
const phrasesSrc = readFileSync(
  join(LIB, 'core/checkin/checkin_phrases.dart'),
  'utf8',
);
const qBlock = phrasesSrc.slice(
  phrasesSrc.indexOf('questions = <String>['),
  phrasesSrc.indexOf('];', phrasesSrc.indexOf('questions = <String>[')),
);
const questions = [...qBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);

ok(questions.length >= 20, `بنك الأسئلة صغير (${questions.length})`);
ok(
  new Set(questions).size === questions.length,
  'فيه أسئلة مكررة حرفياً في البنك',
);
ok(
  questions.every((q) => q.includes('{task}')),
  'فيه سؤال مش بيذكر اسم المهمة',
);

// ════════════════════════════════════════════════
console.log('7) الوصلات الحرجة موجودة');
const shellSrc = readFileSync(join(LIB, 'shell/main_shell.dart'), 'utf8');
ok(
  /showCheckInDialog/.test(shellSrc),
  'الشل مش بيفتح البوب-أب — الفيتشر مقطوع',
);
ok(
  /WidgetsBindingObserver/.test(shellSrc),
  'الشل مش بيراقب رجوع التطبيق من الخلفية',
);

const tasksSrc = readFileSync(join(LIB, 'screens/tasks/tasks_screen.dart'), 'utf8');
ok(
  /updateTasks/.test(tasksSrc),
  'شاشة المهام مش بتغذّي المراقب — البوب-أب عمره ما هيطلع',
);

const mainSrc = readFileSync(join(LIB, 'main.dart'), 'utf8');
ok(
  /CheckInWatcher/.test(mainSrc),
  'المراقب مش متسجّل في الـ providers',
);

// ════════════════════════════════════════════════
console.log(`\n${'═'.repeat(44)}`);
console.log(`النتيجة: ✅ ${pass} نجح · ❌ ${fail} فشل`);
console.log('═'.repeat(44));
process.exit(fail ? 1 : 0);
