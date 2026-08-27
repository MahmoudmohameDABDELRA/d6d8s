/**
 * ═══════════════════════════════════════════════════════════
 *  توحيد سلّم الخطوط
 *
 *  ️ المشكلة اللي بيحلها:
 *
 *  في التطبيق **٢٥ حجم خط مختلف** مكتوبين بالإيد في ١٦٨ مكان،
 *  وفيهم كسور غريبة زي 13.5 و17.5 و20.5. الكسور دي مش تصميم —
 *  دي بقايا سكربت التكبير ١٥٪ اللي اشتغل على أرقام ثابتة
 *  (12 × 1.15 = 13.8 → 13.5). يعني السلّم مش مقصود أصلاً، هو
 *  نتيجة عملية حسابية على أرقام عشوائية.
 *
 *  الأثر: النصوص اللي المفروض ليها نفس الأهمية بتطلع بأحجام
 *  مختلفة بفرق نص نقطة — فرق مش كفاية إنه يفرّق في المعنى، بس
 *  كفاية إنه يخلي الصفحة تبان مش مظبوطة من غير ما تعرف ليه.
 *
 *  الحل: ١١ درجة مسمّاة، وكل حجم قديم بيتنقل لأقرب درجة.
 *  الفرق الأقصى في أي نقلة ١.٥ نقطة — مش هيغيّر التخطيط.
 *
 *  ️ الأرقام نفسها ما اتغيرتش عشوائياً: الدرجات مختارة من
 *    الأحجام الأكتر استخداماً فعلاً في الكود، فأغلب الاستخدامات
 *    (٤١ من ٤١ في درجة النص العادي مثلاً) مش بتتحرك خالص.
 *
 *  التشغيل:  node scripts/unify-type-scale.mjs [--dry]
 * ═══════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '../bal_app/lib');
const THEME = join(LIB, 'core/theme/app_theme.dart');

const DRY = process.argv.includes('--dry');

/**
 * السلّم — الاسم، القيمة، والدور.
 * ️ الترتيب مهم: الاستنتاج بياخد أقرب قيمة.
 */
const SCALE = [
  ['micro', 11, 'أختام ووقت الرسالة'],
  ['caption', 12.5, 'تسميات صغيرة'],
  ['small', 14, 'نص ثانوي'],
  ['body', 15.5, 'النص الأساسي'],
  ['bodyLg', 17, 'نص بارز'],
  ['title', 18.5, 'عنوان قسم'],
  ['titleLg', 21, 'عنوان شاشة صغير'],
  ['heading', 25.5, 'عنوان شاشة'],
  ['display', 32, 'رقم كبير'],
  ['displayLg', 39, 'شعار'],
  ['hero', 60, 'عدّاد الجلسة'],
];

const nearest = (n) => {
  let best = SCALE[0];
  let bestDiff = Math.abs(n - SCALE[0][1]);
  for (const step of SCALE) {
    const diff = Math.abs(n - step[1]);
    if (diff < bestDiff) {
      best = step;
      bestDiff = diff;
    }
  }
  return best;
};

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.dart')) out.push(full);
  }
  return out;
};

// ════════════════════════════════════════════════
//  ١. حقن ثوابت السلّم في الثيم
// ════════════════════════════════════════════════

const constants = SCALE.map(
  ([name, value, role]) => `  /// ${role}\n  static const double ${name} = ${value};`,
).join('\n\n');

const block = `
/// 🔠 سلّم الخطوط — المصدر الوحيد لأحجام النص
///
/// ️ قبل كده كان في **٢٥ حجم** مكتوبين بالإيد في ١٦٨ مكان،
///    فيهم كسور زي 13.5 و17.5 مالهاش أي معنى تصميمي — دي بقايا
///    سكربت تكبير ١٥٪ اشتغل على أرقام ثابتة عشوائية.
///
///    النتيجة كانت نصوص بنفس الأهمية بأحجام مختلفة بفرق نص نقطة:
///    فرق مش كفاية يفرّق في المعنى، بس كفاية يخلي الشاشة تبان
///    مش مظبوطة من غير ما المستخدم يعرف السبب.
///
/// ️ استخدم \`Theme.of(context).textTheme\` لما ينفع — ده بيدّي
///    اللون والوزن وارتفاع السطر مع الحجم. الثوابت دي للحالات
///    اللي محتاجة رقم صريح (أيقونات، عدّادات، إيموجي).
abstract final class BalType {
${constants}
}
`;

let themeSrc = readFileSync(THEME, 'utf8');
if (!themeSrc.includes('abstract final class BalType')) {
  themeSrc = `${themeSrc.trimEnd()}\n${block}`;
  if (!DRY) writeFileSync(THEME, themeSrc);
  console.log('✅ اتضاف BalType في app_theme.dart');
}

// ════════════════════════════════════════════════
//  ٢. نقل كل fontSize لأقرب درجة
// ════════════════════════════════════════════════

const moves = new Map();
let touched = 0;
let replaced = 0;

for (const file of walk(LIB)) {
  //  الثيم نفسه بيعرّف السلّم — ما نلمسوش
  if (file === THEME) continue;

  const src = readFileSync(file, 'utf8');
  let out = src;
  let n = 0;

  out = out.replace(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)\b/g, (whole, num) => {
    const value = Number(num);
    const [name, target] = nearest(value);

    const key = `${value} → ${target} (BalType.${name})`;
    moves.set(key, (moves.get(key) ?? 0) + 1);
    n += 1;

    return `fontSize: BalType.${name}`;
  });

  if (n > 0) {
    //  الاستيراد لازم يكون موجود
    const needsImport = !/import\s+'[^']*app_theme\.dart'/.test(out);
    if (needsImport) {
      const rel = file
        .slice(LIB.length + 1)
        .split('/')
        .slice(0, -1)
        .map(() => '..')
        .join('/');
      const path = rel
        ? `${rel}/core/theme/app_theme.dart`
        : 'core/theme/app_theme.dart';

      //  بعد آخر import
      const lastImport = out.lastIndexOf("import '");
      const lineEnd = out.indexOf('\n', lastImport);
      out = `${out.slice(0, lineEnd + 1)}import '${path}';\n${out.slice(lineEnd + 1)}`;
    }

    if (!DRY) writeFileSync(file, out);
    touched += 1;
    replaced += n;
  }
}

console.log(`\n📐 ${replaced} حجم في ${touched} ملف\n`);

const sorted = [...moves.entries()].sort((a, b) => b[1] - a[1]);
for (const [move, count] of sorted) {
  const changed = !move.startsWith(move.split(' → ')[1]);
  console.log(`  ${changed ? '↔' : '='} ${move.padEnd(34)} ×${count}`);
}

console.log(`\n  السلّم: ${SCALE.length} درجة بدل ٢٥\n`);
if (DRY) console.log('  (تجربة — مفيش ملف اتكتب)\n');
