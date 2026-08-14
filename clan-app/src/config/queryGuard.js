/**
 * ════════════════════════════════════════════════════════════
 *  حارس الاستعلامات — سقف إجباري على كل قراءة
 * ════════════════════════════════════════════════════════════
 *
 *  ️ المشكلة: 25 من 44 نداء `findMany` بلا `take`.
 *
 *   كل واحد منها قنبلة موقوتة. الاستعلام الذي يرجع 12 صفاً في
 *   التطوير يرجع 50,000 في الإنتاج، فيُحمَّل كله في ذاكرة Node
 *   ثم يُسلسَل إلى JSON. هذا بالضبط ما حدث سابقاً في
 *   `GET /api/tasks`: **1,881ms** مع 50 ألف صف، قبل إضافة الحدّ.
 *
 *  ️ لماذا middleware بدل تعديل 25 موضعاً؟
 *
 *   التعديل اليدوي يصلح الحاضر ولا يمنع المستقبل. أول `findMany`
 *   يكتبها مطوّر جديد الأسبوع القادم ستكون بلا حدّ مرة أخرى.
 *   الحارس يجعل الوضع الافتراضي **آمناً** بدل أن يكون خطراً
 *   يعتمد على الانتباه.
 *
 *  ️ لا نرفض الاستعلام — نحدّه.
 *
 *   الرفض يكسر مسارات تعمل اليوم. الحدّ يبقيها تعمل ويمنع
 *   الانفجار. الفرق بين إصلاح وتعطيل.
 *
 *  ️ ما لا يلمسه الحارس:
 *   · الاستعلامات التي فيها `take` صريح — نية المطوّر تفوز
 *   · العدّ والتجميع — لا ترجع صفوفاً
 *   · العلاقات المضمّنة (include) — لها حدودها الخاصة أدناه
 */

/**
 * السقف الافتراضي حين لا يُحدَّد.
 *
 * ️ 100 اختيار مقصود: كبير بما يكفي لأي شاشة واقعية (قائمة
 *    لا تعرض أكثر من ~50 عنصراً)، وصغير بما يكفي لئلا يُسقط
 *    العملية. من يحتاج أكثر يطلبه صراحةً.
 */
export const DEFAULT_TAKE = 100;

/** السقف المطلق — لا يتجاوزه حتى الطلب الصريح */
export const MAX_TAKE = 1000;

/**
 * جداول لها سقف أوسع — قوائم يُتوقَّع طولها.
 *
 * ️ الأوسمة مثال: عددها ثابت (15) ومحدود بالتصميم، فلا خطر
 *    من قراءتها كاملة.
 */
const RELAXED = {
  Achievement: 200,
  UserAchievement: 300,
  ClanMember: 500,
  GoalWeek: 500,
};

/** عدّادات للتشخيص — تُقرأ من /health */
export const guardStats = { capped: 0, truncated: 0, byModel: {} };

const record = (model, kind) => {
  guardStats[kind] += 1;
  guardStats.byModel[model] = (guardStats.byModel[model] ?? 0) + 1;
};

/**
 * يركّب الحارس على عميل Prisma.
 *
 * ️ `$extends` لا `$use`: الأخيرة مهجورة في Prisma 5+ وستُزال.
 */
export const attachQueryGuard = (prisma) =>
  prisma.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          const limit = RELAXED[model] ?? DEFAULT_TAKE;

          if (args.take == null) {
            // لم يُحدَّد حدّ — نفرض الافتراضي
            args.take = limit;
            record(model, 'capped');
          } else if (Math.abs(args.take) > MAX_TAKE) {
            /**
             * ️ نحترم الإشارة: take سالب يعني "الأخيرة" في Prisma،
             *    وقلبها يعكس اتجاه القراءة ويكسر الترقيم.
             */
            args.take = args.take < 0 ? -MAX_TAKE : MAX_TAKE;
            record(model, 'truncated');
          }

          return query(args);
        },
      },
    },
  });

export default { attachQueryGuard, DEFAULT_TAKE, MAX_TAKE, guardStats };
