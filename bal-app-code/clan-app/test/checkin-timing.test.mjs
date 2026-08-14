/**
 * ═══════════════════════════════════════════════════════════
 *  اختبار منطق توقيت البوب-أب
 *
 *  ⚠️ الاختبار ده بيعيد تنفيذ منطق `CheckInWatcher._resolveEnd`
 *     و `_sweep` بـ JavaScript، عشان مفيش Flutter SDK نشغّل بيه
 *     الكود الأصلي. أي تعديل في الملف الأصلي **لازم** يتعكس هنا —
 *     وفيه فحص في الآخر بيتأكد إن القواعد الأساسية لسه موجودة
 *     في كود الـ Dart نفسه.
 *
 *  بيغطي السيناريو اللي المالك وصفه:
 *     مهمة الفطار من 5 لـ 6 → البوب-أب يطلع الساعة 6 بالظبط
 *
 *  التشغيل:  node --test test/checkin-timing.test.mjs
 * ═══════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WATCHER = resolve(HERE, '../bal_app/lib/core/checkin/checkin_watcher.dart');

const GRACE_MS = 2 * 60 * 60 * 1000;

/** نسخة JS من `_resolveEnd` في checkin_watcher.dart */
const resolveEnd = (task, now) => {
  const endText = task.endTime;
  if (!endText) return null;

  const parts = endText.split(':');
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (task.dueDate) {
    const parsed = new Date(task.dueDate);
    if (!Number.isNaN(parsed.getTime())) {
      day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
};

/** نسخة JS من `_sweep` */
const sweep = (tasks, now, asked = new Set()) => {
  const queue = [];
  for (const task of tasks) {
    if (asked.has(task.id)) continue;
    const end = resolveEnd(task, now);
    if (!end) continue;
    if (now < end) continue;
    if (now - end > GRACE_MS) {
      asked.add(task.id);
      continue;
    }
    queue.push(task);
    asked.add(task.id);
  }
  return queue;
};

const at = (h, m = 0) => new Date(2026, 7, 15, h, m);

// ════════════════════════════════════════════════
test('سيناريو المالك: الفطار من 5 لـ 6 → البوب-أب الساعة 6', () => {
  const breakfast = { id: 't1', title: 'الفطار', startTime: '05:00', endTime: '06:00' };

  // 5:30 — لسه بيفطر، ممنوع نقاطعه
  assert.equal(sweep([breakfast], at(5, 30)).length, 0, 'ممنوع السؤال قبل الميعاد');

  // 5:59 — دقيقة فاضلة، برضه لأ
  assert.equal(sweep([breakfast], at(5, 59)).length, 0);

  // 6:00 — الوقت خلص → السؤال يطلع
  const fired = sweep([breakfast], at(6, 0));
  assert.equal(fired.length, 1, 'البوب-أب لازم يطلع الساعة 6');
  assert.equal(fired[0].title, 'الفطار');
});

test('السؤال ما يتكررش على نفس المهمة', () => {
  const task = { id: 't1', title: 'الفطار', endTime: '06:00' };
  const asked = new Set();

  assert.equal(sweep([task], at(6, 0), asked).length, 1, 'أول مرة يطلع');
  assert.equal(sweep([task], at(6, 1), asked).length, 0, 'تاني مرة لأ');
  assert.equal(sweep([task], at(6, 30), asked).length, 0, 'ولا حتى بعد نص ساعة');
});

test('نافذة السماح: فتح التطبيق متأخر', () => {
  const task = { id: 't1', title: 'الفطار', endTime: '06:00' };

  // 6:40 — لسه منطقي نسأل
  assert.equal(sweep([task], at(6, 40)).length, 1, 'بعد 40 دقيقة لسه مناسب');

  // 7:59 — على حافة النافذة
  assert.equal(sweep([task], at(7, 59)).length, 1, 'جوه الساعتين');

  // 11 بالليل — «عملت إيه في الفطار؟» دلوقتي؟ مزعج
  assert.equal(sweep([task], at(23, 0)).length, 0, 'بعد الساعتين ما نسألش');
});

test('مهمة بلا وقت انتهاء → مفيش سؤال تلقائي', () => {
  assert.equal(sweep([{ id: 't1', title: 'مهمة حرة' }], at(12)).length, 0);
  assert.equal(sweep([{ id: 't2', title: 'x', endTime: '' }], at(12)).length, 0);
  assert.equal(sweep([{ id: 't3', title: 'x', endTime: 'مش وقت' }], at(12)).length, 0);
  assert.equal(sweep([{ id: 't4', title: 'x', endTime: '99:99' }], at(12)).length, 0);
  assert.equal(sweep([{ id: 't5', title: 'x', endTime: '6' }], at(12)).length, 0);
});

test('مهام كتير خلصت → كلها في الطابور بالترتيب', () => {
  const tasks = [
    { id: 't1', title: 'الفطار', endTime: '06:00' },
    { id: 't2', title: 'مذاكرة', endTime: '09:00' },
    { id: 't3', title: 'جيم', endTime: '20:00' },
  ];

  // الساعة 9:30 — الفطار خرج من النافذة، المذاكرة لسه جواها
  const fired = sweep(tasks, at(9, 30));
  assert.equal(fired.length, 1);
  assert.equal(fired[0].title, 'مذاكرة', 'الفطار فات نافذته');

  // الساعة 20:00 بالظبط — الجيم بس
  const evening = sweep(tasks, at(20, 0));
  assert.equal(evening.length, 1);
  assert.equal(evening[0].title, 'جيم');
});

test('مهمة بتاريخ قديم ما تسألش النهاردة', () => {
  const old = {
    id: 't1',
    title: 'مهمة إمبارح',
    endTime: '06:00',
    dueDate: new Date(2026, 7, 14).toISOString(),
  };
  assert.equal(sweep([old], at(6, 30)).length, 0, 'مهمة إمبارح خرجت من النافذة');
});

test('المهمة المنجزة برضه بتتسأل', () => {
  /**
   * ️ قرار مقصود: «خلصت الفطار؟ جامد — عامل إيه؟» سؤال مشروع.
   *    الاطمئنان مش عقاب على التقصير، هو متابعة.
   */
  const done = { id: 't1', title: 'الفطار', endTime: '06:00', isCompleted: true };
  assert.equal(sweep([done], at(6, 0)).length, 1);
});

// ════════════════════════════════════════════════
test('كود الـ Dart لسه فيه القواعد اللي اتختبرت هنا', () => {
  /**
   * ️ حارس ضد انحراف النسخة: الاختبارات فوق بتشتغل على نسخة JS
   *    من المنطق. لو حد غيّر الـ Dart وما غيّرش هنا، الاختبارات
   *    هتفضل خضرا وهي بتختبر حاجة مش موجودة. الفحوص دي بتمسك ده.
   */
  const src = readFileSync(WATCHER, 'utf8');

  assert.match(src, /_graceWindow\s*=\s*Duration\(hours:\s*2\)/, 'نافذة السماح اتغيرت');
  assert.match(src, /_tick\s*=\s*Duration\(seconds:\s*30\)/, 'دورية المسح اتغيرت');
  assert.match(src, /now\.isBefore\(end\)/, 'فحص «الوقت لسه مجاش» اتشال');
  assert.match(src, /_asked\.contains\(task\.id\)/, 'حارس التكرار اتشال');
  assert.match(src, /hour < 0 \|\| hour > 23/, 'التحقق من صحة الساعة اتشال');
  assert.match(src, /syncPending/, 'سحب أسئلة السيرفر اتشال');
});

test('البوب-أب بيميّز رد النظام عن رد الرفيق', () => {
  /**
   * ️ لو الـ AI واقع، السيرفر بيرجّع source=SYSTEM. لازم يتعرض
   *    بشكل مختلف — ممنوع ندّعي على الرفيق كلام مقالوش.
   */
  const dialog = readFileSync(
    resolve(HERE, '../bal_app/lib/widgets/checkin_dialog.dart'),
    'utf8',
  );
  assert.match(dialog, /source == 'SYSTEM'/, 'مفيش تمييز لرد النظام');
  assert.match(dialog, /رسالة من التطبيق/, 'مفيش وسم مرئي لرد النظام');
  assert.match(dialog, /crisis/, 'مفيش تعامل مع حالة الأزمة');
});
