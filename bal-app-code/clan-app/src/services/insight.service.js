import prisma from '../config/prisma.js';
import * as streakService from './streak.service.js';
import * as sparksService from './sparks.service.js';
import * as userCache from './userCache.service.js';
import { badRequest, conflict, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('insight');

/**
 * ════════════════════════════════════════════════════════════
 *  خدمة معلومة اليوم — Daily Golden Insight Service
 * ════════════════════════════════════════════════════════════
 *
 *  القواعد الحاكمة:
 *   1. تفتح مرة واحدة فقط كل 24 ساعة لكل مستخدم (Strict 24h Lock عبر @@unique([userId, date])).
 *   2. مخصصة 100% بحسب مجال المستخدم وتخصصه (Domain & Specialty Matching).
 *   3. تمنح المستخدم 5 شرارات استكشاف يومية (+5 Sparks Discovery Reward).
 */

/** مكتبة احتياطية من الخلاصات الذهبية للمجالات في حال عدم وجود مدخلات مخصصة */
const FALLBACK_INSIGHTS = {
  BUSINESS: {
    title: 'سر بناء الشركات الناشئة وتحمل المخاطر',
    speaker: 'إيلون ماسك — Elon Musk',
    content: 'عندما تبدأ شركة، الأمر أشبه بتناول الزجاج والنظر إلى الهاوية. عليك أن تعمل 80 إلى 100 ساعة أسبوعياً في البداية لتضاعف فرص نجاحك. إذا كان الآخرون يعملون 40 ساعة وأنت تعمل 100 ساعة، فستحقق في 4 أشهر ما يحققونه في عام كامل.',
    videoUrl: 'https://youtube.com/shorts/sample_elon_startup',
    takeaway: 'الكثافة والتركيز الشديد في البدايات يختصران سنوات من المنافسة.',
  },
  TECH: {
    title: 'قانون البساطة في كتابة البرمجيات الكبرى',
    speaker: 'جون كارماك — John Carmack',
    content: 'الكود المعقد هو العدو الأول للأداء والاستقرار. أفضل كود هو الكود الذي لم تضطر لكتابته. اجعل كل دالة تقوم بمهمة واحدة محددة، واختبرها على الحالات الحدية قبل أن تنتقل لغيرها.',
    videoUrl: 'https://youtube.com/shorts/sample_carmack_code',
    takeaway: 'البساطة الصارمة في البنية البرمجية تمنحك سرعة صيانة لا تقارن.',
  },
  STUDY: {
    title: 'تقنية الاسترجاع النشط والتكرار المتباعد',
    speaker: 'ريتشارد فاينمان — Richard Feynman',
    content: 'لا تخدع نفسك بإعادة قراءة الملخصات؛ القراءة السلبية تعطي شعوراً كاذباً بالفهم. أغلق الكتاب وحاول شرح المفهوم لطفل في الثامنة من عمره. الفجوات التي ستتعثر فيها هي مواطن ضعفك الحقيقية.',
    videoUrl: 'https://youtube.com/shorts/sample_feynman_technique',
    takeaway: 'الشرح البسيط هو الاختبار الحقيقي للفهم العميق.',
  },
  CREATIVE: {
    title: 'الإلهام يأتي أثناء العمل لا قبله',
    speaker: 'ستيف جوبز — Steve Jobs',
    content: 'الإبداع هو مجرد ربط الأشياء ببعضها. عندما تسأل المبدعين كيف فعلوا شيئاً، يشعرون بقليل من الذنب لأنهم لم يفعلوه حقاً، بل رأوا شيئاً بدا واضحاً لهم بعد فترة.',
    videoUrl: 'https://youtube.com/shorts/sample_steve_creativity',
    takeaway: 'غذّ بصرك يومياً بالتجارب المتنوعة، فالأفكار العظيمة وليدة تقاطع المجالات.',
  },
  HEALTH: {
    title: 'النوم العميق وترميم الذاكرة والأداء',
    speaker: 'د. أندرو هوبرمان — Dr. Andrew Huberman',
    content: 'التعرض لضوء الشمس المباشر في أول 30 دقيقة من الاستيقاظ يضبط ساعتك البيولوجية ويزيد إفراز الدوبامين والكورتيزول الصحي، مما يمنحك تركيزاً مضاعفاً طوال ساعات النهار.',
    videoUrl: 'https://youtube.com/shorts/sample_huberman_morning',
    takeaway: 'روتين الصباح الطبيعي هو أساس طاقتك الذهنية لبقية اليوم.',
  },
  SELF_GROWTH: {
    title: 'عادة الـ 1% والتحسن التراكمي المستمر',
    speaker: 'جيمس كلير — James Clear',
    content: 'إذا تحسنت بنسبة 1% فقط كل يوم لمدة عام، فستكون في نهاية العام أفضل بـ 37 ضعفاً. النتائج هي مقياس متأخر لعاداتك اليومية.',
    videoUrl: 'https://youtube.com/shorts/sample_atomic_habits',
    takeaway: 'ركز على بناء النظام اليومي بدلاً من الهوس بالهدف النهائي.',
  },
};

/**
 * جلب معلومة اليوم المخصصة للمستخدم (تفتح مرة واحدة كل 24 ساعة)
 */
export const getTodayInsightForUser = async (userId, tzOffsetMinutes = 0) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      domain: true,
      specialty: true,
      timezone: true,
      sparksBalance: true,
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  // حساب بداية اليوم الحالي بتوقيت المستخدم
  const today = streakService.localDate(user.timezone || 'Africa/Cairo');

  // 1. التحقق هل فتح المستخدم معلومة اليوم مسبقاً خلال الـ 24 ساعة؟
  const existingLog = await prisma.dailyInsightLog.findUnique({
    where: { userId_date: { userId, date: today } },
    include: { insight: true },
  });

  if (existingLog) {
    const nextReset = new Date(today);
    nextReset.setDate(nextReset.getDate() + 1);
    const hoursLeft = Math.max(0, Math.ceil((nextReset.getTime() - Date.now()) / 3_600_000));

    return {
      success: true,
      alreadyViewedToday: true,
      message: 'لقد استلمت معلومة اليوم بالفعل  تتجدد المعلومة تلقائياً غداً',
      nextAvailableInHours: hoursLeft,
      viewedAt: existingLog.viewedAt,
      insight: existingLog.insight || FALLBACK_INSIGHTS[user.domain] || FALLBACK_INSIGHTS.SELF_GROWTH,
      sparksAwarded: 0,
    };
  }

  // 2. البحث عن أنسب معلومة مخصصة للمستخدم في مكتبة المشرف
  const domainKey = user.domain || 'SELF_GROWTH';
  const matchingItems = await prisma.dailyInsightItem.findMany({
    where: {
      domain: domainKey,
      isActive: true,
      ...(user.specialty ? { OR: [{ specialty: user.specialty }, { specialty: null }] } : {}),
    },
    orderBy: [{ specialty: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 5,
  });

  const selectedInsight = matchingItems[0] || null;
  const fallback = FALLBACK_INSIGHTS[domainKey] || FALLBACK_INSIGHTS.SELF_GROWTH;

  const insightPayload = selectedInsight
    ? {
        id: selectedInsight.id,
        title: selectedInsight.title,
        content: selectedInsight.content,
        domain: selectedInsight.domain,
        specialty: selectedInsight.specialty,
        speaker: selectedInsight.speaker,
        videoUrl: selectedInsight.videoUrl,
        takeaway: selectedInsight.takeaway,
      }
    : {
        id: null,
        title: fallback.title,
        content: fallback.content,
        domain: domainKey,
        specialty: user.specialty,
        speaker: fallback.speaker,
        videoUrl: fallback.videoUrl,
        takeaway: fallback.takeaway,
      };

  // 3. تسجيل الاستعراض ذرياً وصرف 5 شرارات استكشاف يومية
  const result = await prisma.$transaction(async (tx) => {
    const logEntry = await tx.dailyInsightLog.create({
      data: {
        userId,
        insightId: selectedInsight?.id ?? null,
        date: today,
        sparksAwarded: 5,
      },
    });

    const awarded = await sparksService.award(userId, {
      source: 'ACHIEVEMENT_BONUS',
      baseAmount: 5,
      refId: logEntry.id,
      note: `مكافأة فتح معلومة اليوم  (${insightPayload.title.slice(0, 30)})`,
      tx,
    });

    return { logEntry, awarded };
  });

  await userCache.invalidate(userId);

  log.info({ userId, domain: domainKey, title: insightPayload.title }, 'تم فتح معلومة اليوم بنجاح');

  return {
    success: true,
    alreadyViewedToday: false,
    isNewToday: true,
    message: 'معلومة اليوم جاهزة لإلهامك!  +5 شرارات مكافأة استكشاف',
    insight: insightPayload,
    sparksAwarded: 5,
    newBalance: result.awarded.balance,
  };
};

/**
 * إضافة معلومة جديدة إلى خزانة الأدمن
 */
export const createInsightItem = async (data) => {
  const { title, content, domain, specialty, speaker, videoUrl, takeaway, tags } = data;

  if (!title || !content || !domain) {
    throw badRequest('العنوان والمحتوى والمجال حقول إلزامية');
  }

  return prisma.dailyInsightItem.create({
    data: {
      title: String(title).trim(),
      content: String(content).trim(),
      domain,
      specialty: specialty || null,
      speaker: speaker ? String(speaker).trim() : null,
      videoUrl: videoUrl ? String(videoUrl).trim() : null,
      takeaway: takeaway ? String(takeaway).trim() : null,
      tags: Array.isArray(tags) ? tags : [],
    },
  });
};

/**
 * قائمة المعلومات في لوحة الإدارة
 */
export const listInsightItems = async ({ domain, page = 1, limit = 50 }) => {
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;

  const where = { isActive: true, ...(domain ? { domain } : {}) };

  const [items, total] = await Promise.all([
    prisma.dailyInsightItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.dailyInsightItem.count({ where }),
  ]);

  return { items, total, page: Number(page) || 1, limit: take };
};

/**
 * حذف أو تعطيل معلومة
 */
export const deleteInsightItem = async (id) => {
  return prisma.dailyInsightItem.update({
    where: { id },
    data: { isActive: false },
  });
};

export default {
  getTodayInsightForUser,
  createInsightItem,
  listInsightItems,
  deleteInsightItem,
};
