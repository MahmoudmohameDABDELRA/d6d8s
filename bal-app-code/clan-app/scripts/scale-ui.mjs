/**
 * ═══════════════════════════════════════════════════════════
 *  تكبير واجهة bal_app بنسبة ثابتة
 *
 *  الاستخدام:
 *    node scripts/scale-ui.mjs --check        فحص بلا تعديل
 *    node scripts/scale-ui.mjs --apply        تنفيذ التكبير
 *    node scripts/scale-ui.mjs --apply --factor 1.15
 *
 *  ⚠️ ليه سكربت مش بحث-واستبدال:
 *
 *   الأرقام في Flutter مش كلها أبعاد. بحث أعمى على `height:`
 *   هيضرب `height: 1.5` اللي هي **نسبة ارتفاع السطر** — النتيجة
 *   كلام متباعد بشكل بشع. والقاعدة اللي اكتشفناها بالفحص:
 *
 *     height < 2   →  نسبة سطر (line-height)   ← ممنوع المساس
 *     height >= 2  →  بُعد حقيقي (SizedBox…)   ← يتكبّر
 *
 *   وكمان فيه أرقام ممنوع تتغير إطلاقاً:
 *     alpha (شفافية) · elevation · thickness · sigmaX/Y (ضبابية)
 *     · flex · duration · maxLength · maxLines
 *
 *  ⚠️ الزوايا (radius) بتتكبّر بنص النسبة:
 *     تكبير الزاوية بنفس نسبة الحجم بيخلي الكروت تبان "أكتر
 *     استدارة" مش "أكبر" — والشكل بيتغير مش بس الحجم.
 *
 *  ⚠️ radiusPill = 999 قيمة سحرية (كبسولة كاملة) — تفضل زي ما هي.
 * ═══════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../bal_app');
const LIB = join(APP, 'lib');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const factorArg = args.indexOf('--factor');
const FACTOR = factorArg !== -1 ? Number(args[factorArg + 1]) : 1.15;

/** الزوايا بنص النسبة — عشان الشكل يفضل هو هو */
const RADIUS_FACTOR = 1 + (FACTOR - 1) / 2;

if (!Number.isFinite(FACTOR) || FACTOR <= 0) {
  console.error('❌ --factor لازم يكون رقم موجب');
  process.exit(1);
}

/**
 * الخصائص اللي بتتكبّر، وكل واحدة وقاعدتها.
 *   scale: 'size'   → النسبة الكاملة
 *   scale: 'radius' → نص النسبة
 *   min:            → أقل قيمة نلمسها (تحت كده الرقم غالباً نسبة)
 */
const RULES = {
  fontSize: { scale: 'size' },
  size: { scale: 'size' },
  iconSize: { scale: 'size' },
  width: { scale: 'size' },
  // ⚠️ القاعدة الحاسمة: height تحت 2 = نسبة سطر
  height: { scale: 'size', min: 2 },
  minHeight: { scale: 'size', min: 2 },
  maxHeight: { scale: 'size', min: 2 },
  minWidth: { scale: 'size' },
  maxWidth: { scale: 'size' },
  strokeWidth: { scale: 'size' },
  radius: { scale: 'radius' },
  // حشوات EdgeInsets
  horizontal: { scale: 'size' },
  vertical: { scale: 'size' },
  left: { scale: 'size' },
  right: { scale: 'size' },
  top: { scale: 'size' },
  bottom: { scale: 'size' },
  all: { scale: 'size' },
};

/** أرقام ممنوع تتغير مهما كان */
const FORBIDDEN = new Set([
  'alpha', 'opacity', 'elevation', 'thickness', 'sigmaX', 'sigmaY',
  'flex', 'milliseconds', 'seconds', 'minutes', 'hours', 'days',
  'maxLength', 'maxLines', 'minLines', 'itemCount', 'length',
  'begin', 'end', 'value', 'progress', 'turns', 'angle', 'scale',
  'blurRadius', 'spreadRadius', 'letterSpacing', 'wordSpacing',
]);

const round = (n) => {
  const r = Math.round(n * 2) / 2; // لأقرب 0.5
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (e.endsWith('.dart')) out.push(full);
  }
  return out;
};

/** مواقع النصوص والتعليقات — ما نعدّلش جواها */
const protectedRanges = (src) => {
  const ranges = [];
  const patterns = [
    /\/\/[^\n]*/g,
    /\/\*[\s\S]*?\*\//g,
    /'''[\s\S]*?'''/g,
    /"""[\s\S]*?"""/g,
    /'(?:\\.|[^'\\\n])*'/g,
    /"(?:\\.|[^"\\\n])*"/g,
  ];
  for (const p of patterns) {
    for (const m of src.matchAll(p)) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
};

const inProtected = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

let totalChanged = 0;
let totalSkipped = 0;
const perFile = [];
const samples = [];

/**
 * ️ ثوابت الثيم (spaceLg/radiusXl…) بتتكبّر **بإيدنا مرة واحدة**
 *    في app_theme.dart. لو السكربت عدّى عليها كمان هتتكبّر مرتين
 *    (١.١٥ × ١.١٥ = ٣٢٪) والمسافات هتتفرقع.
 */
const THEME_CONSTANTS = resolve(LIB, 'core/theme/app_theme.dart');

for (const file of walk(LIB)) {
  if (file === THEME_CONSTANTS) continue;

  const src = readFileSync(file, 'utf8');
  const ranges = protectedRanges(src);

  let changed = 0;
  let skipped = 0;

  const out = src.replace(
    /(\b[a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(\d+(?:\.\d+)?)\b/g,
    (match, prop, num, offset) => {
      if (inProtected(ranges, offset)) return match;
      if (FORBIDDEN.has(prop)) return match;

      const rule = RULES[prop];
      if (!rule) return match;

      const value = Number(num);

      // القيمة السحرية للكبسولة الكاملة
      if (value === 999) return match;
      if (value === 0) return match;

      // تحت الحد الأدنى → غالباً نسبة مش بُعد
      if (rule.min !== undefined && value < rule.min) {
        skipped += 1;
        return match;
      }

      const f = rule.scale === 'radius' ? RADIUS_FACTOR : FACTOR;
      const scaled = round(value * f);
      if (scaled === num) return match;

      changed += 1;
      if (samples.length < 12) {
        samples.push(`${relative(APP, file)}: ${prop} ${num} → ${scaled}`);
      }
      return `${prop}: ${scaled}`;
    },
  );

  if (changed > 0) {
    perFile.push({ file: relative(APP, file), changed, skipped });
    totalChanged += changed;
    totalSkipped += skipped;
    if (APPLY) writeFileSync(file, out, 'utf8');
  } else if (skipped > 0) {
    totalSkipped += skipped;
  }
}

console.log(`\n${'═'.repeat(52)}`);
console.log(`  تكبير واجهة bal_app بنسبة ${Math.round((FACTOR - 1) * 100)}%`);
console.log(`  (الزوايا ${Math.round((RADIUS_FACTOR - 1) * 100)}% — عشان الشكل يفضل هو هو)`);
console.log('═'.repeat(52));

console.log(`\nالملفات المتأثرة: ${perFile.length}`);
for (const f of perFile.sort((a, b) => b.changed - a.changed).slice(0, 10)) {
  console.log(`  ${String(f.changed).padStart(3)} قيمة  ${f.file}`);
}
if (perFile.length > 10) console.log(`  … و${perFile.length - 10} ملف تاني`);

console.log(`\nأمثلة على التغيير:`);
for (const s of samples) console.log(`  ${s}`);

console.log(`\nالإجمالي:`);
console.log(`  ✅ ${totalChanged} قيمة اتكبّرت`);
console.log(`  🛡️  ${totalSkipped} قيمة اتحمت (نسب سطر تحت 2)`);

if (!APPLY) {
  console.log(`\n⚠️  ده فحص بس — مفيش ملف اتغير.`);
  console.log(`   للتنفيذ: node scripts/scale-ui.mjs --apply\n`);
} else {
  console.log(`\n✅ اتنفذ على ${perFile.length} ملف.\n`);
}
