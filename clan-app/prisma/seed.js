import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * الأوسمة الاثنا عشر — 4 فئات × 3 مستويات.
 *
 * ملاحظة: وسام TRIBE_GOLD تغيّر شرطه بعد إلغاء لوحة الصدارة.
 * كان "المركز الأول في الصدارة" وأصبح "حضور 50 جلسة جماعية".
 */
const ACHIEVEMENTS = [
  // ⚡ التركيز — targetValue بالدقائق
  {
    code: 'FOCUS_BRONZE',
    category: 'FOCUS',
    tier: 'BRONZE',
    title: 'بداية الشغف',
    description: 'أكمل أول 10 ساعات تركيز',
    targetValue: 600,
    icon: '⚡',
  },
  {
    code: 'FOCUS_SILVER',
    category: 'FOCUS',
    tier: 'SILVER',
    title: 'العقل العميق',
    description: 'أكمل 50 ساعة تركيز',
    targetValue: 3000,
    icon: '🧠',
  },
  {
    code: 'FOCUS_GOLD',
    category: 'FOCUS',
    tier: 'GOLD',
    title: 'أسطورة الانضباط',
    description: 'أكمل 200 ساعة تركيز عميق',
    targetValue: 12000,
    icon: '🏆',
  },

  // 🔥 الاستمرارية — targetValue بالأيام
  {
    code: 'STREAK_BRONZE',
    category: 'STREAK',
    tier: 'BRONZE',
    title: 'شرارة الأسبوع',
    description: 'التزم 7 أيام متتالية',
    targetValue: 7,
    icon: '🔥',
  },
  {
    code: 'STREAK_SILVER',
    category: 'STREAK',
    tier: 'SILVER',
    title: 'محارب الشهر',
    description: 'التزم 30 يوماً متتالياً',
    targetValue: 30,
    icon: '⚔️',
  },
  {
    code: 'STREAK_GOLD',
    category: 'STREAK',
    tier: 'GOLD',
    title: 'لا يُقهر',
    description: 'التزم 100 يوم بلا انقطاع',
    targetValue: 100,
    icon: '👑',
  },

  // 🛡️ العشيرة
  {
    code: 'TRIBE_BRONZE',
    category: 'TRIBE',
    tier: 'BRONZE',
    title: 'الصديق الداعم',
    description: 'أرسل 50 تشجيعاً لأعضاء عشيرتك',
    targetValue: 50,
    icon: '🤝',
  },
  {
    code: 'TRIBE_SILVER',
    category: 'TRIBE',
    tier: 'SILVER',
    title: 'بطل الجلسة',
    description: 'شارك في 10 جلسات نبض جماعية',
    targetValue: 10,
    icon: '🛡️',
  },
  {
    code: 'TRIBE_GOLD',
    category: 'TRIBE',
    tier: 'GOLD',
    title: 'قائد الكتيبة',
    description: 'احضر 50 جلسة نبض جماعية كاملة',
    targetValue: 50,
    icon: '🎖️',
  },

  // 📜 المذكرات
  {
    code: 'REFLECTION_BRONZE',
    category: 'REFLECTION',
    tier: 'BRONZE',
    title: 'صريح مع نفسه',
    description: 'اكتب 10 مذكرات يومية',
    targetValue: 10,
    icon: '📝',
  },
  {
    code: 'REFLECTION_SILVER',
    category: 'REFLECTION',
    tier: 'SILVER',
    title: 'صفاء الذهن',
    description: 'اكتب 50 مذكرة وتفريغاً يومياً',
    targetValue: 50,
    icon: '🌙',
  },
  {
    code: 'REFLECTION_GOLD',
    category: 'REFLECTION',
    tier: 'GOLD',
    title: 'الحكيم',
    description: 'التزم بالمراجعة اليومية 90 يوماً',
    targetValue: 90,
    icon: '📜',
  },

  // 🌅 الاستيقاظ المبكر — targetValue بالأيام المتتالية
  {
    code: 'EARLY_BIRD_BRONZE',
    category: 'EARLY_BIRD',
    tier: 'BRONZE',
    title: 'أول الفجر',
    description: 'استيقظ في موعدك 7 أيام متتالية',
    targetValue: 7,
    icon: '🌅',
  },
  {
    code: 'EARLY_BIRD_SILVER',
    category: 'EARLY_BIRD',
    tier: 'SILVER',
    title: 'سيّد الصباح',
    description: 'استيقظ في موعدك 30 يوماً متتالياً',
    targetValue: 30,
    icon: '☀️',
  },
  {
    code: 'EARLY_BIRD_GOLD',
    category: 'EARLY_BIRD',
    tier: 'GOLD',
    title: 'لا ينام عن هدفه',
    description: 'استيقظ في موعدك 100 يوم متتالٍ',
    targetValue: 100,
    icon: '🔆',
  },
];

const MYTHIC_TITLES = [
  {
    code: 'SOLAR_TITAN',
    title: 'وحش اليوم الكامل 🐉',
    subtitle: 'إتقان الـ 10 ساعات والتركيز الفوري بعد الفجر',
    description: 'يُمنح لمن يكسر حاجز الـ 10 ساعات تركيز في يوم واحد مع بدء التركيز فور الاستيقاظ وإنجاز مهمة حرجة بصفر إخفاق.',
    tier: 'MYTHIC',
    auraEffect: 'CRIMSON_SOLAR_FLAME',
    glowColor: '#FF1744',
    soundFx: 'MYTHIC_DRAGON_ROAR',
    bannerTemplate: '🔥 تنبيه شرفي: تم تسجيل دخول حامل لقب [وحش اليوم الكامل 🐉] {username} إلى الغرفة!',
    badgeIcon: '🐉',
    bonusSparks: 500,
    requirements: {
      focusMinutesDaily: 600,
      wakeToFocusMaxMin: 30,
      criticalTasksDaily: 1,
      zeroFailedSessions: true,
      description: 'تركيز ١٠ ساعات كاملة في يوم واحد + بدء أول جلسة خلال ٣٠ دقيقة من الاستيقاظ + إتمام مهمة حرجة بصفر جلسات ملغاة',
    },
  },
  {
    code: 'IRON_JUGGERNAUT',
    title: 'المحارب الفولاذي ⚡',
    subtitle: 'صمود الـ 5 ساعات يومياً لـ 30 يوماً متتالية وتوثيق الهدف الكامل',
    description: 'يُمنح للحديد الذي لا يلين: 5 ساعات تركيز يومياً لمدة شهر متواصل دون دروع مع إنهاء هدف توثيقي كامل.',
    tier: 'MYTHIC',
    auraEffect: 'IRON_LIGHTNING_STORM',
    glowColor: '#00E5FF',
    soundFx: 'MYTHIC_WAR_HORN',
    bannerTemplate: '⚡ انتبهوا جميعاً: دخل الكتيبة [المحارب الفولاذي ⚡] {username} — سيد الانضباط الشهري!',
    badgeIcon: '⚡',
    bonusSparks: 1000,
    requirements: {
      dailyFocusMin: 300,
      consecutiveDays: 30,
      completedDocumentedGoals: 1,
      wakeOnTimeDays: 30,
      description: '٥ ساعات تركيز يومياً لمدة ٣٠ يوماً متتالية بلا انقطاع + إنهاء هدف توثيقي كامل + استيقاظ مثالي ٣٠ يوماً',
    },
  },
  {
    code: 'CONQUEROR_SOVEREIGN',
    title: 'الفاتح الأسطوري 👑',
    subtitle: 'قاهر تحديات العشيرة وسيد النبض الجماعي والأعلى 1%',
    description: 'يُمنح لقمة الهرم الإنتاجي: الفوز في 5 تحديات عشائرية بنسبة 100% وحضور 20 نبضاً وبلوغ أعلى 1% في المنصة.',
    tier: 'MYTHIC',
    auraEffect: 'GOLDEN_CONQUEROR_CROWN',
    glowColor: '#FFD700',
    soundFx: 'MYTHIC_ROYAL_FANFARE',
    bannerTemplate: '👑 تحية إجلال: تم تسجيل دخول [الفاتح الأسطوري 👑] {username} — قاهر التحديات وأعلى 1%!',
    badgeIcon: '👑',
    bonusSparks: 1500,
    requirements: {
      clanChallengesWon: 5,
      pulseSessionsAttended: 20,
      lifetimeFocusHours: 100,
      fastMathWakeSolves: 15,
      topDomainPercentile: 1,
      description: 'الفوز بـ ٥ تحديات عشيرة بنسبة ١٠٠٪ + حضور ٢٠ جلسة نبض + ١٠٠ ساعة تركيز + حل ١٥ منبهاً في <١٥ث + أعلى ١٪ في المجال',
    },
  },
];

const main = async () => {
  console.log('🌱 زرع الأوسمة والألقاب الأسطورية...');

  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: a.code },
      update: {
        title: a.title,
        description: a.description,
        targetValue: a.targetValue,
        icon: a.icon,
      },
      create: { ...a, bonusSparks: 100 },
    });
  }

  const count = await prisma.achievement.count();
  console.log(`✅ ${count} وساماً جاهزاً`);

  for (const t of MYTHIC_TITLES) {
    await prisma.title.upsert({
      where: { code: t.code },
      update: {
        title: t.title,
        subtitle: t.subtitle,
        description: t.description,
        tier: t.tier,
        auraEffect: t.auraEffect,
        glowColor: t.glowColor,
        soundFx: t.soundFx,
        bannerTemplate: t.bannerTemplate,
        badgeIcon: t.badgeIcon,
        bonusSparks: t.bonusSparks,
        requirements: t.requirements,
      },
      create: { ...t },
    });
  }

  const titleCount = await prisma.title.count();
  console.log(`✅ ${titleCount} ألقاب أسطورية نادرة جاهزة`);
};

main()
  .catch((e) => {
    console.error('❌ فشل الزرع:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
