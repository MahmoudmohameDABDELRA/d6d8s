/**
 * ثوابت التطبيق — مصدر واحد لكل الأرقام الحاكمة.
 * أي رقم يتكرر في أكثر من ملف يجب أن يعيش هنا.
 */

// ════════════════════════════════════════════════
//  اقتصاد الشرارات
// ════════════════════════════════════════════════

export const SPARKS = {
  /** شرارة لكل دقيقة تركيز فردي */
  PER_MINUTE_SOLO: 0.45,
  /** شرارة لكل دقيقة تركيز جماعي (النبض) */
  PER_MINUTE_PULSE: 0.75,

  /** مكافأة إتمام أي مهمة — ثابتة بلا تفرقة بين الفئات */
  TASK_COMPLETED: 2,

  /** بونص فتح وسام */
  ACHIEVEMENT_BONUS: 100,
};

// ════════════════════════════════════════════════
//  دورة النبض الجماعي — 120 دقيقة بالضبط
// ════════════════════════════════════════════════

/**
 * كل دورة تبدأ عند ساعة زوجية بتوقيت UTC (00:00, 02:00, 04:00...).
 * الأطوار محسوبة رياضياً — لا حاجة لأي مجدول.
 *
 * ️ الدورة المقررة (قرار المالك — أغسطس 2026):
 *    لوبي 5 → تركيز 30 → راحة 10 → تركيز 30 → راحة 10 → تركيز 30 → لوبي 5
 *    اللوبي الأخير (115-120) يمهّد للدورة التالية — فيبقى الانتظار والحجز
 *    متاحين قبل بدء كل دورة، والدورة لا تنتهي براحة.
 */
export const PULSE = {
  CYCLE_MIN: 120,

  /** حدود الأطوار بالدقائق من بداية الدورة */
  PHASES: [
    { phase: 'LOBBY', start: 0, end: 5, isFocus: false },
    { phase: 'FOCUS_1', start: 5, end: 35, isFocus: true },
    { phase: 'BREAK_1', start: 35, end: 45, isFocus: false },
    { phase: 'FOCUS_2', start: 45, end: 75, isFocus: true },
    { phase: 'BREAK_2', start: 75, end: 85, isFocus: false },
    { phase: 'FOCUS_3', start: 85, end: 115, isFocus: true },
    { phase: 'LOBBY', start: 115, end: 120, isFocus: false },
  ],

  /** عدد فترات التركيز في الدورة */
  FOCUS_BLOCKS: 3,
  /** مدة فترة التركيز الواحدة */
  FOCUS_BLOCK_MIN: 30,
  /** إجمالي دقائق التركيز الفعلي */
  TOTAL_FOCUS_MIN: 90,
};

// ════════════════════════════════════════════════
//  حدود وقواعد
// ════════════════════════════════════════════════

export const LIMITS = {
  /** أقصى عدد عشائر عامة لكل مستخدم */
  MAX_GLOBAL_CLANS: 2,
  /** أقصى عدد عشائر خاصة يقودها المستخدم */
  MAX_OWNED_PRIVATE_CLANS: 1,
  /** الحد الافتراضي لأعضاء العشيرة الخاصة (قرار المالك: 15) */
  DEFAULT_PRIVATE_CLAN_SIZE: 15,
  /** الحد الأقصى لعشائر الانضمام للمستخدم (خاصة + عامة) — قرار المالك: 7 */
  MAX_JOINED_CLANS: 7,
  /** محادثات جديدة يومياً مع أشخاص خارج العشيرة */
  DAILY_NEW_CHATS: 10,
  /** أقصى طول رسالة دردشة */
  MESSAGE_MAX_LENGTH: 2000,
  /** أفضل أوسمة تُعرض على البروفايل */
  SHOWCASE_BADGES: 3,
  /** مرات الخروج من التطبيق قبل فشل الجلسة (الوضع الصارم) */
  STRICT_MODE_MAX_VIOLATIONS: 3,
};

// ════════════════════════════════════════════════
//  كشف الساهي (Focus Check)
// ════════════════════════════════════════════════

/**
 * اختبار فجائي أثناء الجلسة للتأكد أن المستخدم أمام الشاشة.
 *
 * ️ التوقيت عشوائي داخل كل نافذة — لو كان ثابتاً كل 15 دقيقة
 *    لأمكن كتابة بوت يجيب تلقائياً عند الدقائق المعروفة.
 */
export const FOCUS_CHECK = {
  /**
   * اختبار واحد لكل فترة تركيز — لا أكثر.
   *
   * تركيز 30د → كشف واحد عشوائي → راحة → تركيز 30د → كشف واحد → ...
   *
   * مهما طالت فترة التركيز يبقى اختباراً واحداً فيها.
   */
  PER_FOCUS_BLOCK: 1,
  /** لا يظهر قبل هذه الدقيقة من بداية الفترة */
  MIN_OFFSET: 3,
  /** ولا بعد هذه النسبة من الفترة — يترك هامشاً قبل الراحة */
  MAX_OFFSET_RATIO: 0.85,
  /** أقصر فترة تستحق اختباراً */
  MIN_SESSION_FOR_CHECK: 8,
  /** مهلة الإجابة */
  TIMEOUT_MS: 30_000,

  /** رصيد الطوارئ اليومي (مكالمة مهمة مثلاً) */
  EMERGENCY_PER_DAY: 2,
  /** مهلة السماح عند استخدام الطوارئ */
  EMERGENCY_GRACE_MS: 3 * 60_000,
};

// ════════════════════════════════════════════════
//  منبه المعركة
// ════════════════════════════════════════════════

/**
 * ️ المنبه يرنّ محلياً في التطبيق لا من الخادم.
 *    إشعار Push يحتاج إنترنت وقد يتأخر — منبه لا يرنّ بلا نت = فاشل.
 *    الخادم يخزّن الإعدادات ويسجّل الاستيقاظ ويحسب السلاسل.
 */
export const ALARM = {
  /** دقائق السماح بعد الموعد — بعدها يُحتسب تأخراً */
  GRACE_MINUTES: 10,
  /** شرارات الاستيقاظ في الموعد */
  WAKE_SPARKS: 5,
  /** لا تأجيل — تقوم أو تفشل */
  SNOOZE_ALLOWED: false,
  /** أقصى عدد منبهات لكل مستخدم */
  MAX_ALARMS: 5,

  /** أيام يُسمح بفواتها في التحدي الجماعي */
  CHALLENGE_MAX_MISSES: 1,
  /** مدة التحدي الافتراضية */
  CHALLENGE_DEFAULT_DAYS: 7,
  /** مكافأة إتمام التحدي */
  CHALLENGE_REWARD_SPARKS: 100,
};

// ════════════════════════════════════════════════
//  الشات
// ════════════════════════════════════════════════

export const CHAT = {
  /** أقصى طول رسالة */
  MAX_LENGTH: 2000,

  /**
   * حمايات شات العشيرة العامة.
   * العامة بلا حد أعضاء — قد تصل آلافاً.
   * بلا هذه الحدود: 5000 عضو × رسالة/دقيقة = 25 مليون حدث بث/دقيقة.
   */
  GLOBAL_SLOW_MODE_SEC: 30,
  GLOBAL_MAX_PER_HOUR: 20,

  /** العشيرة الخاصة (50 عضواً كحد أقصى) — قيود أخف */
  PRIVATE_SLOW_MODE_SEC: 2,
  PRIVATE_MAX_PER_HOUR: 200,

  /** المحادثات المباشرة */
  DM_MAX_PER_HOUR: 300,

  /** مهلة مؤشر الكتابة */
  TYPING_TTL_SEC: 5,
  /** مدة اعتبار المستخدم متصلاً بعد آخر نشاط */
  PRESENCE_TTL_SEC: 60,

  /** عدد الرسائل في الصفحة */
  PAGE_SIZE: 50,
};

// ════════════════════════════════════════════════
//  التجربة المجانية والاشتراك
// ════════════════════════════════════════════════

/**
 * الـ AI والدوبامين مدفوعان بعد التجربة.
 * التركيز والمهام والعشائر والشات تبقى مجانية للأبد.
 */
export const TRIAL = {
  /** أيام التجربة من تاريخ التسجيل */
  DAYS: 3,
  /** رسائل AI مسموحة يومياً أثناء التجربة */
  AI_MESSAGES_PER_DAY: 3,
};

/** الأقسام التي تُقفل بعد انتهاء التجربة بلا اشتراك */
export const PAID_FEATURES = ['AI_COMPANION', 'AI_ASSISTANT', 'DOPAMINE_FEED'];

export const VALIDATION = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  PASSWORD_MIN: 8,
  CLAN_NAME_MIN: 3,
  CLAN_NAME_MAX: 40,
  TASK_TITLE_MAX: 200,
};

// ════════════════════════════════════════════════
//  المجالات والتخصصات
// ════════════════════════════════════════════════

/** المجالات الأم — يجب أن تطابق enum Domain في المخطط */
export const DOMAINS = [
  'STUDY',
  'BUSINESS',
  'TECH',
  'HEALTH',
  'CREATIVE',
  'SELF_GROWTH',
];

/** الاسم العربي لكل مجال — يُستخدم في اسم العشيرة التلقائية */
export const DOMAIN_LABELS = {
  STUDY: 'دراسة',
  BUSINESS: 'بزنس',
  TECH: 'تقنية',
  HEALTH: 'صحة',
  CREATIVE: 'إبداع',
  SELF_GROWTH: 'تطوير ذاتي',
};

/** التخصصات المسموحة تحت كل مجال */
export const SPECIALTIES = {
  STUDY: [
    'HIGH_SCHOOL',
    'UNIVERSITY',
    'POSTGRAD',
    'RESEARCHER',
    'EXAM_PREP',
    'TEACHER',
  ],
  BUSINESS: [
    'ENTREPRENEUR',
    'FOUNDER',
    'EXECUTIVE',
    'MANAGER',
    'MARKETING',
    'SALES',
    'FINANCE',
    'ECOMMERCE',
    'FREELANCER',
  ],
  TECH: [
    'SOFTWARE_DEV',
    'AI_DATA',
    'CYBERSECURITY',
    'CIVIL_ARCH',
    'MECH_ELEC',
    'DEVOPS',
  ],
  HEALTH: [
    'PHYSICIAN',
    'DENTIST',
    'PHARMACIST',
    'NURSE',
    'PHYSIOTHERAPY',
    'NUTRITION_FITNESS',
  ],
  CREATIVE: [
    'GRAPHIC_DESIGN',
    'UI_UX',
    'CONTENT_CREATOR',
    'WRITER',
    'VIDEO_EDITOR',
    'PHOTOGRAPHY',
  ],
  SELF_GROWTH: [
    'QURAN',
    'ISLAMIC_STUDIES',
    'LANGUAGES',
    'READING',
    'FITNESS',
    'GENERAL_SKILLS',
  ],
};

/** كل التخصصات في مصفوفة واحدة — للتحقق السريع */
export const ALL_SPECIALTIES = Object.values(SPECIALTIES).flat();

export const AUDIO = {
  DEFAULT_LOCAL_SLOTS: 1,
  SLOT_UNLOCK_COST: 50,
  DEFAULT_TRACK_COST: 30,
  CATEGORIES: ['LOFI', 'WHITE_NOISE', 'NATURE', 'BINAURAL', 'AMBIENT'],
  CATEGORY_LABELS: {
    LOFI: 'موسيقى لو-فاي',
    WHITE_NOISE: 'ضوضاء بيضاء',
    NATURE: 'أصوات طبيعة ومطر',
    BINAURAL: 'موجات ثنائية للتركيز',
    AMBIENT: 'أجواء هادئة',
  },
};

export const REFERRAL = {
  // ── المستوى الأول: مكافأة التسجيل المجاني العادية ──
  FREE_SIGNUP_REFERRER_SPARKS: 25,
  FREE_SIGNUP_REFERRED_SPARKS: 25,
  FREE_SIGNUP_AUDIO_SLOT: true, // تحرير مساحة صوتية محلية واحدة للداعي

  // ── المستوى الثاني: المكافآت الكبرى عند اشتراك الصديق في باقة مدفوعة ──
  PAID_CONVERSION_SPARKS: 150, // 150 شرارة كبرى عند دفع الصديق
  PAID_CONVERSION_AI_MESSAGES: 20, // 20 رسالة AI إضافية
  PAID_CONVERSION_DOPAMINE_PASS: true,

  // المحطات الكبرى للاشتراكات المدفوعة
  MILESTONE_PAID_BADGE_COUNT: 5,
  MILESTONE_PAID_BADGE_SPARKS: 500,
};

/** هل هذا التخصص ينتمي لهذا المجال؟ */
export const isValidSpecialty = (domain, specialty) =>
  !specialty || (SPECIALTIES[domain]?.includes(specialty) ?? false);

export default {
  SPARKS,
  PULSE,
  LIMITS,
  VALIDATION,
  DOMAINS,
  DOMAIN_LABELS,
  SPECIALTIES,
  ALL_SPECIALTIES,
  AUDIO,
  REFERRAL,
  isValidSpecialty,
};
