import prisma from '../config/prisma.js';
import * as streakService from './streak.service.js';
import * as sparksService from './sparks.service.js';
import * as userCache from './userCache.service.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/AppError.js';
import { scoped } from '../config/logger.js';

const log = scoped('human-engine');

/**
 * ════════════════════════════════════════════════════════════
 *  المحرك الإنساني والنفسي للمستخدم — The Human-First Engine
 * ════════════════════════════════════════════════════════════
 *
 *  الركائز الخمس:
 *   ١. درع استراحة المحارب (Mental Health Rest Shield): تجميد الستريك دون كسره في أيام التعب.
 *   ٢. جلسة الإنقاذ المصغرة (5-Minute Rescue Session): كسر حاجز الركود والتكاسل بـ 5 دقائق فقط.
 *   ٣. فحص المزاج اليومي وتكيّف نبرة التطبيق (Daily Mood Adaptation).
 *   ٤. صندوق تفريغ الغضب وحرق الهموم الصامت (The Silent Venting Box).
 *   ٥. استقبال البطل واستعراض أمجاد الإنجازات الـ ٣ بعد الغياب (Hero's Welcome Back).
 */

const MOOD_RESPONSES = {
  FRUSTRATED: {
    title: 'حاسس بيك.. الأيام الصعبة جزء من الطريق ',
    advice: 'الإحباط معناه إنك بتحاول ومستني من نفسك الأفضل. متجلدش ذاتك النهاردة، ومطلوب منك بس خطوة واحدة بسيطة.',
    recommendedAudio: 'NATURE',
    recommendedAudioName: 'أصوات مطر وغابة هادئة ️',
    suggestedAction: 'جلسة إنقاذ خفيفة ٥ دقائق أو تفريغ ما في صدرك بصندوق الفضفضة ',
  },
  TIRED: {
    title: 'جسمك وعقلك محتاجين شحن ',
    advice: 'الإرهاق إشارة ذكية من جسمك عشان ترتاح مش عشان تستسلم. ريّح شوية واشرب مياه دافية.',
    recommendedAudio: 'AMBIENT',
    recommendedAudioName: 'أجواء استرخاء وهدوء عميق ',
    suggestedAction: 'استخدم درع استراحة المحارب ️ أو اعمل جلسة إنقاذ ٥ دقائق فقط.',
  },
  STRESSED: {
    title: 'خد نفس عميق.. كل حاجة هتتحل خطوة خطوة ',
    advice: 'التوتر بيجي لما نفكر في كل المهام مرة واحدة. ركّز في الدقيقة اللي إنت فيها وسيب الباقي.',
    recommendedAudio: 'WHITE_NOISE',
    recommendedAudioName: 'ضوضاء بيضاء لعزل المشتتات ',
    suggestedAction: 'فرغ همومك في صندوق حرق الغضب  وابدأ مهمة واحدة صغيرة.',
  },
  ENERGIZED: {
    title: 'طاقة نارية! يلا نكتسح أهداف النهاردة ',
    advice: 'استغل قمة تركيزك وطاقتك الذهنية في المهمة الحرجة الأهم في يومك.',
    recommendedAudio: 'BINAURAL',
    recommendedAudioName: 'موجات بيتا للتركيز المكثف ',
    suggestedAction: 'ادخل دورة النبض الجماعية القادمة واكسب ٦٨ شرارة ',
  },
};

//////////////////////////////////////////////////////
// 1. درع استراحة المحارب (Streak Rest Shield)
//////////////////////////////////////////////////////

export const activateRestShield = async (userId, timezone = 'Africa/Cairo') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      shieldsRemaining: true,
      shieldsUsedThisMonth: true,
      currentStreak: true,
      timezone: true,
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const tz = user.timezone || timezone;
  const today = streakService.localDate(tz);

  // التحقق من وجود دروع متبقية
  if (user.shieldsRemaining <= 0) {
    throw forbidden(
      'استهلكت درعي استراحة المحارب لهذا الشهر ️ يتجدد رصيدك تلقائياً مع بداية الشهر الجديد',
      'NO_SHIELDS_LEFT',
    );
  }

  // تفعيل الدرع ذرياً وتثبيت الستريك
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        shieldsRemaining: { decrement: 1 },
        shieldsUsedThisMonth: { increment: 1 },
        shieldActiveDate: today,
        lastActiveDate: today, // حماية السلسلة اليوم
      },
      select: { shieldsRemaining: true, currentStreak: true },
    });

    return updated;
  });

  await userCache.invalidate(userId);

  log.info({ userId, remaining: result.shieldsRemaining }, 'تم تفعيل درع استراحة المحارب');

  return {
    success: true,
    message: 'أنت إنسان مش ماكينة  ريّح جسمك وعقلك النهاردة، والستريك بتاعك في أمان ومحفوظ لبكرة ️',
    shieldsRemaining: result.shieldsRemaining,
    currentStreak: result.currentStreak,
  };
};

//////////////////////////////////////////////////////
// 2. فحص المزاج اليومي وتكيّف المنظومة (Daily Mood Log)
//////////////////////////////////////////////////////

export const recordDailyMood = async (userId, { mood, note, timezone = 'Africa/Cairo' }) => {
  const validMoods = ['ENERGIZED', 'TIRED', 'STRESSED', 'FRUSTRATED'];
  if (!mood || !validMoods.includes(mood)) {
    throw badRequest(`المزاج يجب أن يكون أحد الخيارات: ${validMoods.join(' · ')}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, username: true },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const today = streakService.localDate(user.timezone || timezone);

  const moodEntry = await prisma.dailyMoodLog.upsert({
    where: { userId_date: { userId, date: today } },
    update: {
      mood,
      note: note ? String(note).slice(0, 300) : null,
    },
    create: {
      userId,
      date: today,
      mood,
      note: note ? String(note).slice(0, 300) : null,
    },
  });

  // مكافأة استكشاف المشاعر 3 شرارات
  await sparksService.award(userId, {
    source: 'ACHIEVEMENT_BONUS',
    baseAmount: 3,
    refId: moodEntry.id,
    note: 'مكافأة تسجيل مشاعرك اليومية ',
  }).catch(() => {});

  const responseTemplate = MOOD_RESPONSES[mood] || MOOD_RESPONSES.FRUSTRATED;

  return {
    success: true,
    mood,
    response: {
      greeting: `أهلاً يا ${user.username}`,
      title: responseTemplate.title,
      advice: responseTemplate.advice,
      recommendedAudio: responseTemplate.recommendedAudio,
      recommendedAudioName: responseTemplate.recommendedAudioName,
      suggestedAction: responseTemplate.suggestedAction,
    },
  };
};

//////////////////////////////////////////////////////
// 3. صندوق تفريغ الغضب وحرق الهموم (Silent Venting Box)
//////////////////////////////////////////////////////

export const performSilentCatharsis = async (userId, ventText) => {
  if (!ventText || !String(ventText).trim()) {
    throw badRequest('اكتب ما يضايقك لتفريغه وحرقه');
  }

  // ️ خصوصية مطلقة: النص لا يُحفظ في قاعدة البيانات إطلاقاً
  log.info({ userId, charsCount: ventText.length }, ' تم تفريغ وحرق مذكرة غضب بنجاح');

  // منح 3 شرارات استرخاء وهدوء
  const awardResult = await sparksService.award(userId, {
    source: 'VENTING_CATHARSIS',
    baseAmount: 3,
    note: 'هدية الهدوء النفسي وتفريغ الضغوط ',
  });

  return {
    success: true,
    message: 'خرجت من صدرك خلاص وتلاشت في الرماد.. خذ نفساً عميقاً واشرب كوب ماء وركز في مستقبلك ',
    burned: true,
    sparksAwarded: 3,
    newBalance: awardResult.balance,
  };
};

//////////////////////////////////////////////////////
// 4. استقبال البطل واستعراض الأمجاد الثلاثة (Hero's Welcome Back)
//////////////////////////////////////////////////////

export const generateHeroComeback = async (userId, timezone = 'Africa/Cairo') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      totalFocusMin: true,
      longestStreak: true,
      totalSparksEarned: true,
      lastActiveDate: true,
      achievements: {
        where: { isUnlocked: true },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
        take: 3,
      },
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  // تجهيز شرائح استعراض الأمجاد الثلاثة (5 ثوانٍ لكل شريحة)
  const slides = [];

  // الشريحة 1: ساعات التركيز والعمق
  const totalHours = Math.round((user.totalFocusMin || 0) / 60);
  slides.push({
    index: 1,
    title: ' إنجاز العقل العميق',
    badgeIcon: '',
    headline: `أنت أنجزت ${totalHours} ساعة تركيز حقيقية!`,
    narrative: `انظر يا ${user.username} إلى هذا الرقم.. ${totalHours} ساعة من البناء والانضباط حُفرت في تاريخك، وهذا ليس إنجازاً عادياً. اعتبر غيبتك استراحة محارب ولنكمل معاً `,
  });

  // الشريحة 2: أطول سلسلة التزام
  const bestStreak = user.longestStreak || 1;
  slides.push({
    index: 2,
    title: ' محارب الاستمرارية',
    badgeIcon: '',
    headline: `حققت سلسلة ${bestStreak} يوماً متتالياً بلا استسلام!`,
    narrative: `القوة والانضباط التي بنتها في سلسلة الـ ${bestStreak} يوماً ما زالت بداخلك ولم تضع، وغياب بضعة أيام لا يمحو بطولتك.`,
  });

  // الشريحة 3: رصيد الإنجاز التراكمي
  const totalSparks = user.totalSparksEarned || 0;
  slides.push({
    index: 3,
    title: ' رصيد البطولة التراكمي',
    badgeIcon: '',
    headline: `${totalSparks} شرارة إنجاز حصدتها بعرقك!`,
    narrative: `أنت قطعت شوطاً كبيراً يفوق 90% من الناس.. مرحباً بعودتك إلى كتيبتك، واليوم بداية خطوة جديدة نحو القمة `,
  });

  // منح 10 شرارات ترحيبية بالعودة
  const welcomeGift = await sparksService.award(userId, {
    source: 'WELCOME_BACK_BONUS',
    baseAmount: 10,
    note: `هدية استقبال البطل بعودتك يا ${user.username} `,
  });

  return {
    success: true,
    isHeroComeback: true,
    greeting: `انظر يا ${user.username} إلى ما صنعته يداك... أنت بطل حقيقي لا تكسره العثرات `,
    slideDurationSec: 5,
    totalSlides: 3,
    slides,
    welcomeSparksGift: 10,
    currentBalance: welcomeGift.balance,
  };
};

//////////////////////////////////////////////////////
// 5. محدد وموجه حالة دخول التطبيق (Emotional State Dispatcher)
//////////////////////////////////////////////////////

export const getAppEntryState = async (userId, timezone = 'Africa/Cairo') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      lastActiveDate: true,
      timezone: true,
      shieldsRemaining: true,
    },
  });

  if (!user) throw notFound('المستخدم غير موجود');

  const tz = user.timezone || timezone;
  const today = streakService.localDate(tz);

  let gapDays = 0;
  if (user.lastActiveDate) {
    const last = new Date(user.lastActiveDate);
    gapDays = Math.max(0, Math.floor((today.getTime() - last.getTime()) / 86_400_000));
  }

  // ── الأولوية الأولى (P1): غياب 4 أيام فأكثر ──> شاشة استقبال البطل ──
  if (gapDays >= 4) {
    const heroPayload = await generateHeroComeback(userId, tz);
    return {
      action: 'HERO_COMEBACK',
      priority: 1,
      gapDays,
      message: 'استقبال البطل الرسمي بعد غياب',
      payload: heroPayload,
    };
  }

  // ── الأولوية الثانية (P2): غياب يوم أمس فقط ──> صندوق حرق وتفريغ عتب الأمس ──
  if (gapDays === 1) {
    return {
      action: 'YESTERDAY_VENT',
      priority: 2,
      gapDays: 1,
      message: 'فاتك يوم أمس؟ فرّغ ما في صدرك واحرقه لنبدأ صفحة بيضاء لليوم ',
      prompt: `فاتك يوم أمس يا ${user.username}؟ اكتب هنا كل اللي مضايقك واحرقه عشان نبدأ اليوم بروح جديدة `,
    };
  }

  // ── الأولوية الثالثة (P3): الاستخدام اليومي ──> فحص المزاج الصباحي إن لم يُسجل ──
  const todayMood = await prisma.dailyMoodLog.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { mood: true, createdAt: true },
  });

  if (!todayMood) {
    return {
      action: 'DAILY_MOOD_PROMPT',
      priority: 3,
      gapDays: 0,
      message: 'سؤال المزاج الصباحي اليومي',
      options: [
        { key: 'ENERGIZED', emoji: '', label: 'مستعد ومتحمس' },
        { key: 'TIRED', emoji: '', label: 'تعبان ومرهق' },
        { key: 'STRESSED', emoji: '', label: 'مضغوط ومشتت' },
        { key: 'FRUSTRATED', emoji: '', label: 'محبط ومخنوق' },
      ],
    };
  }

  // ── الأولوية الرابعة (P4): الحالة الطبيعية للصفحة الرئيسية ──
  return {
    action: 'STANDARD_HOME',
    priority: 4,
    gapDays: 0,
    todayMood: todayMood.mood,
    message: 'الصفحة الرئيسية جاهزة',
  };
};

export default {
  activateRestShield,
  recordDailyMood,
  performSilentCatharsis,
  generateHeroComeback,
  getAppEntryState,
};
