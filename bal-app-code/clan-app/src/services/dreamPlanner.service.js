/**
 * ═══════════════════════════════════════════════════════════
 *  مخطّط جبل الأحلام — Dream Planner Service
 *
 *  يحوّل طموح المستخدم («عاوز أكون CEO») إلى:
 *   1) أسئلة كويز يعرف بيها المستوى الحالي (خلفية/مهارات/وضع)
 *   2) خطة تصاعدية من خطوات (حقول الجبل) من الأسفل إلى القمة
 *
 *  ⚠️ لا بيانات وهمية أبداً: كل ناتج من الـ AI الفعلي.
 *     لو الـ AI غير متاح → خطأ صريح (GEMINI_NOT_CONFIGURED / GEMINI_QUOTA)
 *     والفرونت يعرض رسالة واضحة — لا اختراع.
 * ═══════════════════════════════════════════════════════════
 */
import { generate, isConfigured } from './gemini.service.js';
import { DOMAIN_LABELS, SPECIALTY_LABELS } from '../config/constants.js';

/** استخراج JSON من نص الـ AI — يتحمل علامات ```json ... ``` */
const extractJson = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI_INVALID_JSON');
  return JSON.parse(raw.slice(start, end + 1));
};

const QUIZ_SYSTEM = `أنت «مخطط الأحلام» في تطبيق بال — رفيق يبني خططاً واقعية.
مهمتك: اطرح 4 أسئلة كويز فقط لتعرف مستوى المستخدم الحالي قبل بناء خطته نحو هدفه.
الأسئلة يجب أن تكشف: (1) الخلفية الحالية، (2) المهارات الموجودة، (3) الوقت المتاح أسبوعياً، (4) أول عقبة متوقعة.
لكل سؤال: نص واضح + 3 خيارات (اختيار من متعدد) + الخيارات واقعية ومتنوعة.
أسلوبك: صديق دافئ يحفّز، سؤال واحد بسيط وواضح — ليس استجواباً.
أخرج JSON فقط بهذا الشكل بالضبط:
{"questions":[{"question":"...","options":["...","...","..."]}]}`;

const PLAN_SYSTEM = `أنت «مخطط الأحلام» في تطبيق بال — رفيق يبني خططاً واقعية.
المستخدم كتب هدفه وأجاب على أسئلة التقييم. مهمتك: ابنِ خطة تصاعدية من 5 إلى 7 خطوات (حقول الجبل) من الأسفل إلى القمة.
القاعدة الذهبية: كل خطوة واقعية وقابلة للتنفيذ خلال أسبوع إلى شهر، والخطوة الأخيرة (القمة) هي الهدف النهائي نفسه.
ابدأ من مستوى المستخدم الحالي (اللي كشفه في إجاباته) — لا تقفز فوق الأساسيات.
أخرج JSON فقط بهذا الشكل بالضبط:
{"steps":[{"title":"عنوان الخطوة","description":"شرح مختصر بماذا تُنجز"}]}`;

/**
 * ملف المستخدم كسطر عربي جاهز للحقن في البرومبت.
 *
 * ️ ليه ده مهم:
 *    المستخدم بيملا شاشة الاهتمامات والتخصص في الأونبوردنج، وبعدين
 *    كان مخطط الأحلام بيسأله من الأول «إيه خلفيتك؟» — أسوأ حاجة في
 *    الـ UX إنك تسأل حد سؤال هو جاوبه قبل كده.
 *
 *    دلوقتي الـ AI بيعرف مين بيكلم قبل ما يسأل، فالأسئلة بتبقى أعمق
 *    والخطة أدق.
 *
 * @returns {string|null} null لو مفيش أي بيانات (ما نحقنش سطر فاضي)
 */
const buildUserProfile = ({ interests, specialty, timezone } = {}) => {
  const parts = [];

  const domains = (interests ?? [])
    .map((d) => DOMAIN_LABELS[d] ?? d)
    .filter(Boolean);
  if (domains.length) parts.push(`مجالات اهتمامه: ${domains.join(' · ')}`);

  const spec = specialty ? (SPECIALTY_LABELS[specialty] ?? specialty) : null;
  if (spec) parts.push(`وضعه الحالي: ${spec}`);

  // المنطقة الزمنية = مؤشر تقريبي على السياق الجغرافي/الثقافي
  if (timezone && timezone !== 'UTC') parts.push(`منطقته الزمنية: ${timezone}`);

  return parts.length ? parts.join(' — ') : null;
};

/** هل الـ AI متاح أصلاً؟ */
export const isDreamPlannerReady = () => isConfigured();

/**
 * توليد أسئلة الكويز لهدف المستخدم
 * @returns {Promise<{questions: {question:string, options:string[]}[]}>}
 */
export const generateQuizQuestions = async ({
  username,
  dreamTitle,
  companionName,
  profile,
}) => {
  const name = companionName || 'رفيقك';
  const known = buildUserProfile(profile);

  /**
   * ️ لما نبقى عارفين بياناته، بنمنع النموذج صراحةً إنه يسأله عنها
   *    تاني. من غير المنع ده النموذج بيسأل «إيه مجالك؟» حتى لو
   *    المجال مكتوب قدامه في السياق.
   */
  const system = [
    QUIZ_SYSTEM,
    `أنت تُدعى «${name}» وتخاطب «${username || 'صديقي'}».`,
    known
      ? `\n── ما تعرفه عنه بالفعل (لا تسأله عنه تاني إطلاقاً) ──\n${known}\nاستثمر المعلومات دي: اسأله أسئلة أعمق تبني على اللي انت عارفه، مش أسئلة تعيد اكتشافه.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `هدف المستخدم: «${dreamTitle}»\nاسألني الأسئلة الأربعة.`;

  const res = await generate(system, [], prompt, { maxTokens: 1024, temperature: 0.7 });
  const data = extractJson(res.text ?? '');
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('AI_INVALID_RESPONSE');
  }
  return data;
};

/**
 * توليد خطة الجبل من إجابات المستخدم
 * @returns {Promise<{steps: {title:string, description:string}[]}>}
 */
export const generatePlan = async ({
  username,
  dreamTitle,
  answers,
  companionName,
  profile,
}) => {
  const name = companionName || 'رفيقك';
  const known = buildUserProfile(profile);

  const system = [
    PLAN_SYSTEM,
    `أنت تُدعى «${name}» وتخاطب «${username || 'صديقي'}».`,
    known ? `\n── ما تعرفه عنه ──\n${known}\nابنِ الخطة على وضعه ده فعلياً، مش على شخص عام.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = JSON.stringify({
    goal: dreamTitle,
    answers: answers.map((a) => ({ question: a.question, answer: a.answer })),
  });

  const res = await generate(system, [], prompt, { maxTokens: 1536, temperature: 0.7 });
  const data = extractJson(res.text ?? '');
  if (!Array.isArray(data.steps) || data.steps.length < 2) {
    throw new Error('AI_INVALID_RESPONSE');
  }
  return data;
};

export default {
  isDreamPlannerReady,
  generateQuizQuestions,
  generatePlan,
};
