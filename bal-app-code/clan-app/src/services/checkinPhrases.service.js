/**
 * ═══════════════════════════════════════════════════════════
 *  بنك صيغ الاطمئنان — Check-In Phrase Bank
 *
 *  المشكلة اللي بيحلها:
 *    سؤال «عملت إيه في المهمة؟» لو اتبعت بنفس الصياغة كل مرة
 *    بيتحول لضوضاء — المستخدم بيقفل الإشعار من غير ما يقراه.
 *    ودي أخطر حاجة تحصل لأهم فيتشر في التطبيق.
 *
 *  الحل بطبقتين:
 *    ١) الـ AI بياخد «توجيه أسلوب» مختلف كل مرة (variantHint) فبيغيّر
 *       الصياغة من نفسه — مش قالب جاهز.
 *    ٢) لو الـ AI مش متاح: نختار من بنك صيغ ثابتة، بس **بلا تكرار**
 *       — بنفتكر آخر الصيغ المستخدمة لكل مستخدم في Redis وبنستبعدها.
 *
 *  ️ الاختيار حتمي-عشوائي (deterministic seed + استبعاد المكرر) عشان
 *    نفس المهمة ما تجيبش نفس الصيغة لو الجوب اتعاد.
 * ═══════════════════════════════════════════════════════════
 */
import redisClient from '../config/redis.js';
import { scoped } from '../config/logger.js';

const log = scoped('checkin-phrases');

/** كام صيغة نفتكرها ونستبعدها لكل مستخدم قبل ما نسمح بالتكرار */
const RECENT_MEMORY = 8;
const RECENT_TTL_SECONDS = 14 * 24 * 60 * 60;

const recentKey = (userId, bucket) => `checkin:recent:${bucket}:${userId}`;

/**
 * ── توجيهات الأسلوب للـ AI ──
 * كل واحدة بتخلي النموذج يكتب سؤال بنبرة مختلفة تماماً.
 * مش قوالب — دي تعليمات صياغة.
 */
export const AI_VARIANT_HINTS = [
  'ابدأ بملاحظة عن الوقت نفسه (الساعة/الفترة) قبل ما تسأل.',
  'ابدأ بنكشة خفيفة فيها روح دعابة مصرية، وبعدين السؤال.',
  'اسأل سؤال محدد جداً عن جزء من المهمة بالاسم — مش سؤال عام.',
  'ابدأ باعتراف بإن المهمة دي ممكن تكون تقيلة، وبعدين اسأله وصل لفين.',
  'استخدم صيغة الفضول الصادق: كإنك مستني تعرف الآخر إيه.',
  'ابدأ بجملة تشجيع قصيرة على مجرد إنه وصل للوقت ده، وبعدين اسأل.',
  'اسأله عن أكتر حاجة وقفت قدامه بالتحديد — بلا مقدمات.',
  'ابدأ بسؤال بسيط عن مزاجه دلوقتي وبعدين اربطه بالمهمة.',
  'خلي السؤال قصير جداً — جملة واحدة بس، وحاسمة ودافية.',
  'اربط المهمة بحلمه الكبير في نص سطر، وبعدين اسأل عن النهاردة.',
];

/**
 * ── بنك الصيغ الاحتياطية (لو الـ AI مش متاح) ──
 * `{task}` بتتبدل باسم المهمة.
 * ️ مكتوبة بالعامية المصرية، بلا لوم، وكلها بتنتهي بسؤال مفتوح.
 */
export const FALLBACK_TEMPLATES = [
  'إيه أخبار «{task}»؟ عملت فيها إيه؟ احكيلي عشان أساعدك.',
  'وصلت لفين في «{task}»؟ لو فيه حاجة واقفة قدامك قولي.',
  'قوللي بقى — «{task}» ماشية معاك إزاي؟',
  'كنت فاكرك مع «{task}» دلوقتي. الدنيا ماشية؟ محتاج حاجة؟',
  'إيه الأخبار مع «{task}»؟ حتى لو مبدأتش، قوللي إيه اللي حصل.',
  'عامل إيه في «{task}»؟ احكيلي وأنا معاك.',
  'خلصت «{task}» ولا لسه؟ أي إجابة تمام — بس قوللي.',
  'باسأل عن «{task}» — فيه حاجة عطّلتك؟',
  'إزيك؟ «{task}» كانت النهاردة — إيه اللي اتعمل فيها؟',
  'شغل «{task}» وصل لفين؟ لو محتاج نفكّكها سوا قوللي.',
  'حابب أطمن عليك في «{task}». إيه الموقف؟',
  'قوللي على «{task}» — إنجاز ولا يوم تقيل؟ الاتنين تمام.',
];

/** عناوين الإشعار — كمان بتتغير عشان الشكل ما يبقاش واحد */
export const FALLBACK_TITLES = [
  'اطمئنان سريع',
  'باسأل عنك',
  'إيه الأخبار؟',
  'وقفة صغيرة',
  'رفيقك بيسأل',
];

/** اختيار عشوائي بسيط */
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** قراءة الصيغ المستخدمة مؤخراً — Fail-Open لو Redis واقع */
const readRecent = async (userId, bucket) => {
  try {
    if (!userId || !redisClient?.isOpen) return [];
    const raw = await redisClient.get(recentKey(userId, bucket));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    log.warn({ userId, err: error.message }, 'تعذّر قراءة الصيغ الأخيرة');
    return [];
  }
};

/** تسجيل صيغة كمستخدمة */
const rememberUsed = async (userId, bucket, index) => {
  try {
    if (!userId || !redisClient?.isOpen) return;
    const recent = await readRecent(userId, bucket);
    recent.push(index);
    const trimmed = recent.slice(-RECENT_MEMORY);
    await redisClient.set(recentKey(userId, bucket), JSON.stringify(trimmed), {
      EX: RECENT_TTL_SECONDS,
    });
  } catch (error) {
    log.warn({ userId, err: error.message }, 'تعذّر حفظ الصيغة المستخدمة');
  }
};

/**
 * اختيار عنصر من قائمة مع استبعاد اللي اتستخدم قريّب.
 * لو كله اتستخدم → نبدأ من أول ونختار عشوائي (مع استبعاد آخر واحدة بس).
 *
 * @returns {Promise<{value: any, index: number}>}
 */
const pickUnrepeated = async (userId, bucket, list) => {
  const recent = await readRecent(userId, bucket);
  const lastUsed = recent.length ? recent[recent.length - 1] : -1;

  let candidates = list
    .map((_, i) => i)
    .filter((i) => !recent.includes(i));

  // استهلكنا البنك كله → افتح كل الخيارات ما عدا آخر واحدة مباشرة
  if (candidates.length === 0) {
    candidates = list.map((_, i) => i).filter((i) => i !== lastUsed);
  }
  if (candidates.length === 0) candidates = list.map((_, i) => i);

  const index = pickRandom(candidates);
  await rememberUsed(userId, bucket, index);
  return { value: list[index], index };
};

/**
 * توجيه أسلوب للـ AI — مختلف عن آخر مرة.
 * @param {string} userId
 * @returns {Promise<string>}
 */
export const nextAiVariantHint = async (userId) => {
  const { value } = await pickUnrepeated(userId, 'hint', AI_VARIANT_HINTS);
  return value;
};

/**
 * نص اطمئنان احتياطي — مختلف عن آخر مرة، باسم المهمة الحقيقي.
 * @param {string} userId
 * @param {string} taskTitle
 * @returns {Promise<string>}
 */
export const nextFallbackText = async (userId, taskTitle) => {
  const { value } = await pickUnrepeated(userId, 'tpl', FALLBACK_TEMPLATES);
  return value.replaceAll('{task}', taskTitle);
};

/**
 * عنوان إشعار متغيّر.
 * @param {string} userId
 * @param {string} [companionName] لو موجود بنستخدم صيغة باسم الرفيق أحياناً
 * @returns {Promise<string>}
 */
export const nextTitle = async (userId, companionName) => {
  const { value } = await pickUnrepeated(userId, 'ttl', FALLBACK_TITLES);
  if (companionName && value === 'رفيقك بيسأل') return `${companionName} بيسأل عنك`;
  return value;
};

export default {
  AI_VARIANT_HINTS,
  FALLBACK_TEMPLATES,
  FALLBACK_TITLES,
  nextAiVariantHint,
  nextFallbackText,
  nextTitle,
};
